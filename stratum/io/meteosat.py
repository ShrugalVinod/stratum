"""Meteosat-9 Indian Ocean (IODC) imagery: download, calibrate, crop, store.

What it does
------------
Meteosat-9 sits 35,786 km above the equator at 45.5°E and photographs the whole Earth disk
in 12 channels every 15 minutes (paper §3.2, Table 2; build prompt §3.4). Contrails show up
in the thermal infrared: ice absorbs more at 12.0 µm than at 10.8 µm, so a thin contrail is
a narrow, line-shaped positive anomaly in BTD = T10.8 − T12.0 (paper §4.4).

For each 15-minute *slot* this module:

1. downloads the native Level 1.5 full-disk file (``EO:EUM:DAT:MSG:HRSEVIRI-IODC``,
   ≈180 MB zipped) and the matching cloud mask (``EO:EUM:DAT:MSG:CLM-IODC``, ≈3.5 MB);
2. reads them with ``satpy`` (readers ``seviri_l1b_native`` and ``seviri_l2_grib``), which
   applies EUMETSAT's calibration to give **brightness temperatures in K**;
3. crops both to the padded study box **in the satellite's native geometry** (no
   reprojection, so thin lines are not blurred; build prompt §3.4). The cloud mask is on the
   identical 3,712 × 3,712 grid, so the same crop applies;
4. keeps six IR channels (IR_108, IR_120 for the BTD; IR_087, WV_062, WV_073, IR_134 as
   optional features and labeller context) as ``uint16`` = BT × 100 (0.01 K steps).

Slots are grouped by UTC day into ``<drive>/raw/meteosat/l15_crop/YYYY-MM-DD/data.zarr`` and
``.../clm/YYYY-MM-DD/data.zarr``. A day can be *extended* past midnight (default 2 h) so
contrails from late flights can still be matched 20–120 min later. Each finished day gets a
manifest and ``_SUCCESS``; a lock stops two processes writing the same day.

The static per-pixel grid (lat, lon, viewing zenith angle, pixel area) is computed once
(build prompt §1.3.4). VZA uses the WGS84 ellipsoid and the satellite at 45.5°E on the
equator; known values: ~38° at Mumbai, ~48° at Delhi, ~55° at Kolkata (build prompt §3.4).

Licence (EUMETSAT General Licence, accepted 2026-10-14): credit EUMETSAT as the source; the
original numerical data are never redistributed.

Why not EUMETSAT's server-side Data Tailor crop? Measured 93 s per slot and it returns
radiances; downloading + satpy takes ~2 s of processing per slot (docs/decisions.md).
"""

from __future__ import annotations

import logging
import shutil
import time as _time
import zipfile
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import xarray as xr

from stratum.manifest import RunManifest, UnitLock, UnitLockedError, is_done, mark_success

log = logging.getLogger(__name__)

COLLECTION_L15 = "EO:EUM:DAT:MSG:HRSEVIRI-IODC"
COLLECTION_CLM = "EO:EUM:DAT:MSG:CLM-IODC"
SAT_LON = 45.5  # sub-satellite longitude, degrees E (configs/domain.yaml)
SAT_ALTITUDE_M = 35_786_023.0  # height above the equator for a geostationary orbit
CHANNELS: tuple[str, ...] = ("IR_108", "IR_120", "IR_087", "WV_062", "WV_073", "IR_134")
BT_SCALE = 0.01  # stored uint16 = round(BT / BT_SCALE); 0 = missing
CLM_FILL = 255
CLM_MEANINGS = {0: "clear sky over water", 1: "clear sky over land", 2: "cloudy", 3: "no data"}
SLOT_MINUTES = 15

FloatArray = npt.NDArray[np.float64]


# ── Geometry ─────────────────────────────────────────────────────────────────


def viewing_zenith_angle(
    lat: npt.ArrayLike, lon: npt.ArrayLike, sat_lon: float = SAT_LON
) -> FloatArray:
    """Satellite viewing zenith angle (degrees) at ground points, WGS84 ellipsoid.

    Angle between the local vertical (ellipsoid normal) and the line of sight to a
    geostationary satellite at ``sat_lon`` on the equator. 0° = straight overhead.
    """
    a, f = 6_378_137.0, 1 / 298.257223563
    e2 = f * (2 - f)
    phi = np.radians(np.asarray(lat, dtype=np.float64))
    lam = np.radians(np.asarray(lon, dtype=np.float64))
    n = a / np.sqrt(1 - e2 * np.sin(phi) ** 2)
    p = np.stack(
        [n * np.cos(phi) * np.cos(lam), n * np.cos(phi) * np.sin(lam), n * (1 - e2) * np.sin(phi)]
    )
    r_sat = a + SAT_ALTITUDE_M
    s = np.array([r_sat * np.cos(np.radians(sat_lon)), r_sat * np.sin(np.radians(sat_lon)), 0.0])
    los = s.reshape(3, *([1] * phi.ndim)) - p
    los /= np.linalg.norm(los, axis=0)
    normal = np.stack([np.cos(phi) * np.cos(lam), np.cos(phi) * np.sin(lam), np.sin(phi)])
    cosz = np.clip(np.sum(normal * los, axis=0), -1.0, 1.0)
    return np.degrees(np.arccos(cosz))


def pixel_area_km2(lat: FloatArray, lon: FloatArray) -> FloatArray:
    """Approximate ground area of each pixel (km²) from the lat/lon grid's local Jacobian."""
    r = 6371.0088
    phi, lam = np.radians(lat), np.radians(lon)
    dphi_y, dphi_x = np.gradient(phi)
    dlam_y, dlam_x = np.gradient(lam)
    return np.asarray(np.abs(dlam_x * dphi_y - dlam_y * dphi_x) * np.cos(phi) * r**2)


def static_grid(area: Any) -> xr.Dataset:
    """Per-pixel lat, lon, VZA and pixel area for a (cropped) satpy/pyresample area."""
    lon, lat = area.get_lonlats()
    lon = np.where(np.isfinite(lon), lon, np.nan)
    lat = np.where(np.isfinite(lat), lat, np.nan)
    vza = viewing_zenith_angle(lat, lon)
    pa = pixel_area_km2(lat, lon)
    ds = xr.Dataset(
        {
            "lat": (("y", "x"), lat.astype("float32")),
            "lon": (("y", "x"), lon.astype("float32")),
            "vza_deg": (("y", "x"), vza.astype("float32")),
            "pixel_area_km2": (("y", "x"), pa.astype("float32")),
        }
    )
    ds.attrs.update(
        area_proj4=area.crs.to_proj4(),
        area_extent=[float(v) for v in area.area_extent],
        sat_lon=SAT_LON,
    )
    return ds


# ── Reading one slot ─────────────────────────────────────────────────────────


@dataclass(frozen=True)
class BBox:
    """lon/lat box (degrees)."""

    lon_min: float
    lat_min: float
    lon_max: float
    lat_max: float

    @classmethod
    def padded_domain(cls) -> BBox:
        from stratum.config import load_domain

        b = load_domain().padded_bbox
        return cls(b.lon[0], b.lat[0], b.lon[1], b.lat[1])

    def ll(self) -> tuple[float, float, float, float]:
        return (self.lon_min, self.lat_min, self.lon_max, self.lat_max)


def _to_uint16(bt: FloatArray) -> npt.NDArray[np.uint16]:
    q = np.round(bt / BT_SCALE)
    q = np.where(np.isfinite(q) & (q > 0) & (q < 65535), q, 0)
    return q.astype(np.uint16)


def read_l15_crop(
    nat_path: Path, bbox: BBox
) -> tuple[dict[str, npt.NDArray[np.uint16]], Any, datetime]:
    """Calibrated BT (uint16 ×100) per channel, the cropped area, and the nominal slot time."""
    from satpy import Scene

    scn: Any = Scene(reader="seviri_l1b_native", filenames=[str(nat_path)])
    scn.load(list(CHANNELS), calibration="brightness_temperature")
    crop = scn.crop(ll_bbox=bbox.ll())
    first = crop[CHANNELS[0]]
    out = {ch: _to_uint16(np.asarray(crop[ch].values, dtype=np.float64)) for ch in CHANNELS}
    t0 = first.attrs["start_time"]
    return out, first.attrs["area"], t0


def read_clm_crop(grb_path: Path, bbox: BBox) -> npt.NDArray[np.uint8]:
    """Cloud-mask categories (0–3, see CLM_MEANINGS; 255 = missing) on the same crop."""
    from satpy import Scene

    scn: Any = Scene(reader="seviri_l2_grib", filenames=[str(grb_path)])
    scn.load(["cloud_mask"])
    v = np.asarray(scn.crop(ll_bbox=bbox.ll())["cloud_mask"].values, dtype=np.float64)
    return np.where(np.isfinite(v), v, CLM_FILL).astype(np.uint8)


# ── Finding slots ────────────────────────────────────────────────────────────


def slot_floor(t: datetime) -> datetime:
    """Round a sensing time down to its 15-minute repeat-cycle start."""
    t = t.replace(tzinfo=None, second=0, microsecond=0)
    return t - timedelta(minutes=t.minute % SLOT_MINUTES)


def match_products(l15: Iterable[Any], clm: Iterable[Any]) -> dict[datetime, dict[str, Any]]:
    """Pair L1.5 and cloud-mask products by repeat-cycle start time."""
    slots: dict[datetime, dict[str, Any]] = {}
    for kind, prods in (("l15", l15), ("clm", clm)):
        for p in prods:
            slots.setdefault(slot_floor(p.sensing_start), {})[kind] = p
    return dict(sorted(slots.items()))


def day_window(day: date, extend_hours: float) -> tuple[datetime, datetime]:
    start = datetime(day.year, day.month, day.day)
    return start, start + timedelta(days=1, hours=extend_hours)


# ── Day ingest ───────────────────────────────────────────────────────────────


def _download_entry(product: Any, suffix: str, dest_dir: Path, attempts: int = 3) -> Path:
    """Download one file of a product, retrying a dropped connection (seen: ProtocolError)."""
    for attempt in range(1, attempts + 1):
        try:
            return _download_entry_once(product, suffix, dest_dir)
        except Exception:
            if attempt == attempts:
                raise
            _time.sleep(5.0 * attempt)
    raise AssertionError("unreachable")


def _download_entry_once(product: Any, suffix: str, dest_dir: Path) -> Path:
    """Download one file of a product (e.g. the .nat inside the zip) to ``dest_dir``."""
    entry = next(e for e in product.entries if e.endswith(suffix))
    dest = dest_dir / Path(entry).name
    tmp = dest.with_suffix(dest.suffix + ".part")
    with product.open(entry=entry) as src, tmp.open("wb") as f:
        shutil.copyfileobj(src, f, length=1 << 22)
    if zipfile.is_zipfile(tmp):  # some products stream the whole zip
        with zipfile.ZipFile(tmp) as z:
            inner = next(n for n in z.namelist() if n.endswith(suffix))
            with z.open(inner) as zsrc, dest.open("wb") as f:
                shutil.copyfileobj(zsrc, f)
        tmp.unlink()
    else:
        tmp.rename(dest)
    return dest


def ingest_day(
    day: date,
    root: Path,
    work: Path,
    store: Any,
    *,
    extend_hours: float = 2.0,
    bbox: BBox | None = None,
    max_slots: int | None = None,
    config_hash: str | None = None,
    parallel_downloads: int = 4,
) -> dict[str, Any]:
    """Download + crop every slot of ``day`` (+ ``extend_hours``) → two day Zarrs on ``root``.

    ``root`` = ``<drive>/raw/meteosat``. ``work`` = fast local scratch. ``store`` =
    ``eumdac.DataStore``. ``max_slots`` is for tests only (never marks the day done).
    """
    bbox = bbox or BBox.padded_domain()
    l15_dir = root / "l15_crop" / f"{day:%Y-%m-%d}"
    clm_dir = root / "clm" / f"{day:%Y-%m-%d}"
    if is_done(l15_dir) and is_done(clm_dir) and max_slots is None:
        return {"day": str(day), "status": "already done"}
    try:
        lock = UnitLock(l15_dir)
        lock.acquire()
    except UnitLockedError as e:
        return {"day": str(day), "status": f"locked: {e}"}
    try:
        return _ingest_day_locked(
            day,
            l15_dir,
            clm_dir,
            work,
            store,
            extend_hours,
            bbox,
            max_slots,
            config_hash,
            parallel_downloads,
        )
    finally:
        lock.release()


def _ingest_day_locked(
    day: date,
    l15_dir: Path,
    clm_dir: Path,
    work: Path,
    store: Any,
    extend_hours: float,
    bbox: BBox,
    max_slots: int | None,
    config_hash: str | None,
    parallel_downloads: int,
) -> dict[str, Any]:
    t_start = _time.time()
    start, end = day_window(day, extend_hours)
    l15 = list(store.get_collection(COLLECTION_L15).search(dtstart=start, dtend=end))
    clm = list(store.get_collection(COLLECTION_CLM).search(dtstart=start, dtend=end))
    slots = match_products(l15, clm)
    times = [t for t in slots if start <= t < end][:max_slots]
    scratch = work / "meteosat" / f"{day:%Y-%m-%d}"
    scratch.mkdir(parents=True, exist_ok=True)
    bt: dict[str, list[npt.NDArray[np.uint16]]] = {ch: [] for ch in CHANNELS}
    cm: list[npt.NDArray[np.uint8]] = []
    kept: list[datetime] = []
    missing: list[str] = []
    area = None

    def fetch(t: datetime) -> tuple[datetime, Path | None, Path | None, str | None]:
        """Download both files of one slot (runs in a small thread pool)."""
        s = slots[t]
        if "l15" not in s:
            return t, None, None, "no-l15"
        try:
            nat = _download_entry(s["l15"], ".nat", scratch)
            grb = _download_entry(s["clm"], ".grb", scratch) if "clm" in s else None
        except Exception as e:  # recorded per slot below
            return t, None, None, f"download:{type(e).__name__}"
        return t, nat, grb, None

    # Downloads run 4 at a time; reading/cropping (~2 s) happens in order as files arrive.
    with ThreadPoolExecutor(max_workers=parallel_downloads) as pool:
        for t, nat, grb, err in pool.map(fetch, times):
            if err or nat is None:
                missing.append(f"{t:%H%M}:{err}")
                continue
            try:
                chans, a, _ = read_l15_crop(nat, bbox)
                if grb is not None:
                    mask = read_clm_crop(grb, bbox)
                else:
                    mask = np.full(chans[CHANNELS[0]].shape, CLM_FILL, np.uint8)
                    missing.append(f"{t:%H%M}:no-clm")
            except Exception as e:  # one bad slot must not kill the day; it is recorded
                log.warning("slot %s failed: %s", t, e)
                missing.append(f"{t:%H%M}:read:{type(e).__name__}")
                continue
            finally:
                for f in (nat, grb):
                    if f is not None:
                        f.unlink(missing_ok=True)
            if area is None:
                area = a
            elif chans[CHANNELS[0]].shape != bt[CHANNELS[0]][0].shape:
                raise RuntimeError(f"crop shape changed at {t}: grid not static?")
            for ch in CHANNELS:
                bt[ch].append(chans[ch])
            cm.append(mask)
            kept.append(t)
    if not kept:
        return {"day": str(day), "status": "no slots", "missing": missing}

    assert area is not None  # set by the first kept slot
    time_coord = np.array(kept, dtype="datetime64[ns]")
    ds = xr.Dataset(
        {ch: (("time", "y", "x"), np.stack(bt[ch])) for ch in CHANNELS}, coords={"time": time_coord}
    )
    for ch in CHANNELS:
        ds[ch].attrs.update(
            units="K", scale_factor=BT_SCALE, long_name=f"{ch} brightness temperature"
        )
        ds[ch].encoding["_FillValue"] = 0  # 0 = missing; decoded to NaN on read
    ds.attrs.update(
        satellite="Meteosat-9 (MSG2)",
        service="IODC",
        collection=COLLECTION_L15,
        area_proj4=area.crs.to_proj4(),
        area_extent=[float(v) for v in area.area_extent],
        bbox_ll=[float(v) for v in bbox.ll()],
        source="EUMETSAT",
        licence="EUMETSAT General Licence: credit EUMETSAT; no redistribution of original data",
    )
    cds = xr.Dataset(
        {"cloud_mask": (("time", "y", "x"), np.stack(cm))}, coords={"time": time_coord}
    )
    cds["cloud_mask"].attrs.update(
        flag_values=list(CLM_MEANINGS),
        flag_meanings="; ".join(CLM_MEANINGS.values()),
        missing_code=CLM_FILL,  # kept as a plain integer category (not decoded to NaN)
    )
    cds.attrs.update(collection=COLLECTION_CLM, source="EUMETSAT")

    for out_dir, d in ((l15_dir, ds), (clm_dir, cds)):
        out_dir.mkdir(parents=True, exist_ok=True)
        tmp = scratch / f"{out_dir.parent.name}.zarr"
        shutil.rmtree(tmp, ignore_errors=True)
        d.to_zarr(tmp, mode="w", consolidated=True)
        target = out_dir / "data.zarr"
        shutil.rmtree(target, ignore_errors=True)
        shutil.copytree(tmp, target)
        shutil.rmtree(tmp, ignore_errors=True)
    shutil.rmtree(scratch, ignore_errors=True)

    stats = {
        "slots_expected": len(times),
        "slots_kept": len(kept),
        "missing": missing,
        "shape_yx": list(ds[CHANNELS[0]].shape[1:]),
        "time_range": [str(kept[0]), str(kept[-1])],
        "clm_fraction": {
            name: round(float((np.stack(cm) == k).mean()), 4) for k, name in CLM_MEANINGS.items()
        },
        "wall_time_s": round(_time.time() - t_start, 1),
    }
    if max_slots is None:
        for out_dir, job in ((l15_dir, "meteosat-l15-crop"), (clm_dir, "meteosat-clm-crop")):
            m = RunManifest.start(
                job,
                unit=str(day),
                config_hash=config_hash,
                params={
                    "extend_hours": extend_hours,
                    "bbox": list(bbox.ll()),
                    "channels": list(CHANNELS),
                },
            )
            m.stats = stats
            mark_success(out_dir, m)
    return {"day": str(day), "status": "downloaded", **stats, "_area": area}


def open_day(root: Path, day: date) -> xr.Dataset:
    """Open a stored day as BT in K (float32, decoded), with the cloud mask added."""
    l15 = xr.open_zarr(root / "l15_crop" / f"{day:%Y-%m-%d}" / "data.zarr")
    clm = xr.open_zarr(root / "clm" / f"{day:%Y-%m-%d}" / "data.zarr")
    out: xr.Dataset = l15.assign(cloud_mask=clm["cloud_mask"])
    return out


# ── Choosing the clear January test days (build prompt §1.3.5) ───────────────


def daily_high_cloud(
    pl: xr.Dataset, lat: tuple[float, float], lon: tuple[float, float], top_hpa: float = 400.0
) -> Any:
    """Daily mean (over hours and the box) of the max cloud fraction at or above ``top_hpa``."""
    cc = pl["fraction_of_cloud_cover"].sel(
        latitude=slice(lat[0], lat[1]), longitude=slice(lon[0], lon[1]), level=slice(None, top_hpa)
    )
    hc = cc.max("level").mean(["latitude", "longitude"])
    return hc.resample(time="1D").mean().to_series()


def select_clear_days(
    pl: xr.Dataset,
    n: int,
    exclude: Iterable[str],
    lat: tuple[float, float],
    lon: tuple[float, float],
) -> list[str]:
    """The ``n`` days with the least high cloud over the box (objective, not by eye)."""
    s = daily_high_cloud(pl, lat, lon)
    s.index = s.index.strftime("%Y-%m-%d")
    s = s.drop(labels=[d for d in exclude if d in s.index])
    return list(s.sort_values().index[:n])
