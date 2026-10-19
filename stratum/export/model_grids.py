"""STRATUM probability grids for the web map (build prompt §8.1).

For each 0.25° cell, dashboard flight level and UTC hour (at half past), a stand-in "flight
segment" goes through the same feature code as the training segments (``build_segments_met``:
ERA5 at the point, the levels above and below, tropopause, local solar time, month; η = 0.30
as on the B1 map, since no aircraft type is known) and then through the frozen correction
models of Phase 7:

* **STRATUM**: the calibrated model of the seasonal fold that holds the day out, i.e. the same
  model whose predictions for that day were scored in the H2 final run. Value = probability that
  a persistent contrail forms *and Meteosat-9 would see it* (the labels' definition).
* **Spread**: max − min over the four seasonal models (a simple measure of model uncertainty;
  the map's "show uncertainty" toggle).

Run in Colab (needs ERA5 on Drive and ``interim/model``); chunked by hour to bound memory.
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

from stratum.evaluate.splits import SEASONS

Array = npt.NDArray[np.float64]


def pseudo_segments(lat: Array, lon: Array, fls: list[int], day: str, hour: int) -> pd.DataFrame:
    """One stand-in segment per (flight level, cell) at ``hour``:30 UTC."""
    from stratum.physics.units import flight_level_to_pressure  # noqa: F401  (documents units)

    la, lo = np.meshgrid(lat, lon, indexing="ij")
    n = la.size
    t = pd.Timestamp(day) + pd.Timedelta(hours=hour, minutes=30)
    parts = []
    for fl in fls:
        alt = float(fl) * 100.0
        parts.append(pd.DataFrame({
            "flight_id": "grid", "segment_id": [f"FL{fl}_{i}" for i in range(n)],
            "time_mid": t, "time_start": t, "time_end": t + pd.Timedelta(minutes=1),
            "lat_mid": la.ravel(), "lon_mid": lo.ravel(),
            "alt_ft_mid": alt, "alt_ft_start": alt, "alt_ft_end": alt,
            "duration_s": 60.0, "length_km": 14.0, "heading_deg": 0.0, "fl": fl,
            "openap_type": None, "aircraft_mass_kg": np.nan,
        }))  # fmt: skip
    s = pd.concat(parts, ignore_index=True)
    s["time_mid"] = pd.to_datetime(s["time_mid"], utc=True)
    return s


def probability_grids(
    pl: Any, tropo: Any, lat: Array, lon: Array, fls: list[int], day: str, mdir: Path, pre: Any
) -> tuple[dict[int, Array], dict[int, Array]]:
    """STRATUM probability and four-model spread, each {fl: (24, rows, cols)}, north-up as
    ``lat`` (the caller passes north-first latitudes)."""
    from stratum.decide.humidity import fold_for_day
    from stratum.met.features import build_segments_met
    from stratum.model import features as fe
    from stratum.model import run as mr

    names = list(pre.correction_model.features)
    cols = fe.columns(names)
    models = {f: mr.load(mdir / f)[0] for f in SEASONS}
    own = fold_for_day(day)
    rows, ncols = len(lat), len(lon)
    prob = {fl: np.full((24, rows, ncols), np.nan) for fl in fls}
    spread = {fl: np.full((24, rows, ncols), np.nan) for fl in fls}
    per = pd.DataFrame({"flight_id": ["grid"]})
    for h in range(24):
        seg = pseudo_segments(lat, lon, fls, day, h)
        s, _ = build_segments_met(seg, per, pl, tropo)
        X = s[cols].to_numpy(float)
        ok = np.isfinite(s["rhi"].to_numpy(float))
        preds = {}
        for f, m in models.items():
            p = np.full(len(s), np.nan)
            if ok.any():  # an hour beyond the loaded ERA5 has no valid cells
                p[ok] = m.predict(X[ok])
            preds[f] = p
        stack = np.vstack(list(preds.values()))
        with np.errstate(invalid="ignore"), warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN cells stay NaN
            sp = np.nanmax(stack, axis=0) - np.nanmin(stack, axis=0)
        fl_arr = s["fl"].to_numpy()
        for fl in fls:
            k = fl_arr == fl
            prob[fl][h] = preds[own][k].reshape(rows, ncols)
            spread[fl][h] = sp[k].reshape(rows, ncols)
    return prob, spread


def observability_grid(
    root: Path, day: str, lat: Array, lon: Array, max_vza: float = 60.0
) -> Array | None:
    """Fraction of each hour's Meteosat slots in which a 0.25° cell could be checked: no opaque
    cloud (EUMETSAT cloud mask; no-data counts as cloudy) and viewing angle below ``max_vza``.
    Satellite side only (the pre-registered rule also needs ERA5 high cloud < 0.5 at the
    segment's level). None when the day has no Meteosat data. (24, rows, cols), rows as ``lat``."""
    import xarray as xr

    from stratum.match.run import CLM_CLOUDY, CLM_NODATA

    met = root / "raw" / "meteosat"
    zarr = met / "clm" / day / "data.zarr"
    if not zarr.exists():
        return None
    static = xr.open_zarr(met / "static_grid.zarr").load()
    plat = static["lat"].values.astype(float)
    plon = static["lon"].values.astype(float)
    vza = static["vza_deg"].values.astype(float)
    step = abs(float(lon[1] - lon[0]))
    # pixels off the Earth's disk have no coordinates: leave them out before converting to indices
    on_disk = np.isfinite(plat) & np.isfinite(plon) & np.isfinite(vza)
    rf = (float(lat[0]) - plat) / step if lat[0] > lat[-1] else (plat - float(lat[0])) / step
    ri = np.where(on_disk, np.rint(np.where(on_disk, rf, 0.0)), -1).astype(int)
    ci = np.where(
        on_disk, np.rint(np.where(on_disk, (plon - float(lon[0])) / step, 0.0)), -1
    ).astype(int)
    inside = on_disk & (ri >= 0) & (ri < len(lat)) & (ci >= 0) & (ci < len(lon))
    cell = np.where(inside, ri * len(lon) + ci, -1).ravel()
    keep = cell >= 0
    n_cells = len(lat) * len(lon)
    total = np.bincount(cell[keep], minlength=n_cells).astype(float)
    clm = xr.open_zarr(zarr)["cloud_mask"]
    times = pd.to_datetime(clm["time"].values)
    out = np.full((24, len(lat), len(lon)), np.nan)
    for h in range(24):
        idx = [i for i, t in enumerate(times) if t.hour == h and str(t.date()) == day]
        if not idx:
            continue
        acc = np.zeros(n_cells)
        for i in idx:
            c = np.asarray(clm.isel(time=i).values)
            ok = (~np.isin(c, (CLM_CLOUDY, *CLM_NODATA))) & (vza < max_vza)
            acc += np.bincount(
                cell[keep], weights=ok.ravel()[keep].astype(float), minlength=n_cells
            )
        with np.errstate(invalid="ignore", divide="ignore"):
            out[h] = (acc / (total * len(idx))).reshape(len(lat), len(lon))
    return out
