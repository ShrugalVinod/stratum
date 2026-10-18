"""End to end on a synthetic year: table → folds → metrics → H1 → report (build prompt §6)."""

from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

from stratum.evaluate import report as rp
from stratum.evaluate import run as ev
from stratum.evaluate import table as tb
from stratum.manifest import SUCCESS_MARKER

DAYS = [f"{m:%Y-%m}-01" for m in pd.period_range("2025-03", "2026-02", freq="M").to_timestamp()]


def _fake_root(tmp: Path) -> Path:
    rng = np.random.default_rng(0)
    lev = np.array([150.0, 200, 250, 300, 350])
    lat = np.arange(4.0, 39.01, 0.25)
    lon = np.arange(66.0, 100.01, 0.25)
    for d in DAYS:
        n = 400
        seg_id = [f"{d}_f{i // 5:03d}_{i % 5:04d}" for i in range(n)]
        flight = [s.rsplit("_", 1)[0] for s in seg_id]
        T = rng.uniform(210, 230, n)
        rhi = rng.uniform(0.6, 1.3, n)
        seg = pd.DataFrame({
            "segment_id": seg_id, "temperature_k": T, "specific_humidity": rhi * 1e-4, "rhi": rhi,
            "pressure_pa": rng.uniform(20000, 30000, n), "engine_efficiency": 0.3,
            "alt_ft_mid": rng.uniform(30000, 40000, n), "lat_mid": rng.uniform(10, 30, n),
            "lon_mid": rng.uniform(70, 90, n), "persists_raw": rhi >= 1, "commercial": True,
            "in_corridor": False,
        })  # fmt: skip
        sd = tmp / "interim" / "segments_met" / d[:7] / d
        sd.mkdir(parents=True)
        seg.to_parquet(sd / "segments_met.parquet")
        # labels: observed more often where RHi is high (a real but noisy signal)
        y = (rng.random(n) < np.clip((rhi - 0.6) * 0.15, 0, 1)).astype(float)
        n_obs = rng.integers(0, 6, n)
        n_mo = np.where(y == 1, rng.integers(1, 4, n), 0)
        lab = pd.DataFrame({
            "segment_id": seg_id, "flight_id": flight, "time_mid": pd.Timestamp(d, tz="UTC"),
            "y": np.where(n_mo >= 2, 1.0, np.where((n_mo == 0) & (n_obs >= 2), 0.0, np.nan)),
            "n_observable": np.maximum(n_obs, n_mo), "n_matched_observable": n_mo,
            "night_fraction": rng.random(n), "image_time_first": pd.Timestamp(d),
        })  # fmt: skip
        md = tmp / "interim" / "matches" / d[:7] / d
        md.mkdir(parents=True)
        lab.to_parquet(md / "labels.parquet")
        per = pd.DataFrame({"segment_id": np.repeat(seg_id, 2), "image_time": np.tile([pd.Timestamp(d) + pd.Timedelta("1h"), pd.Timestamp(d) + pd.Timedelta("2h")], n),
                            "vza_deg": rng.uniform(30, 60, 2 * n)})  # fmt: skip
        per.to_parquet(md / "per_slot.parquet")
        (md / SUCCESS_MARKER).touch()
        cd = tmp / "interim" / "climatology"
        cd.mkdir(parents=True, exist_ok=True)
        xr.DataArray(rng.uniform(0, 0.2, (len(lev), len(lat), len(lon))), dims=("level", "latitude", "longitude"),
                     coords={"level": lev, "latitude": lat, "longitude": lon}).to_netcdf(cd / f"{d[:7]}.nc")  # fmt: skip
    return tmp


def test_harness_end_to_end(tmp_path: Path) -> None:
    root = _fake_root(tmp_path)
    t, images, info = tb.build(root)
    assert info["rows_primary"] == t["y"].notna().sum() > 0
    assert {"B0", "B0_all", "B1", "B2", "B3", "season", "fl_band", "y_k1", "y_k3"} <= set(t.columns)
    assert t["B0"].between(0, 1).all() and t["B1"].isin([0, 1]).all()
    # B0 for a winter row uses only non-winter months: a winter-only change must not move it
    res = ev.evaluate(t, images, n=200, seed=1)
    assert set(res["folds"]) >= {
        "pre_monsoon",
        "monsoon",
        "post_monsoon",
        "winter",
        "winter_without_2026-01",
        "train_west_test_east",
    }
    b3 = res["primary"]["B3"]
    assert b3["value"] == 0.0  # B3 vs itself
    assert np.isfinite(res["h1"]["ratio"]["value"]) and "sentence" in res["h1"]
    assert res["b4"]["run"] is False
    files = rp.write(
        res,
        tmp_path / "rep",
        {"run_id": "test", "commit": "abc", "n_resamples": 200, "seed": 1},
        "## D-001 — test\n",
    )
    html = Path(files["html"]).read_text()
    assert "H1 in one sentence" in html and "D-001" in html and "data:image/png;base64" in html


def test_b0_uses_training_months_only(tmp_path: Path) -> None:
    root = _fake_root(tmp_path)
    t1, _, _ = tb.build(root)
    # make every winter-month grid extreme: winter rows' B0 must not change
    for m in ("2025-12", "2026-01", "2026-02"):
        f = root / "interim" / "climatology" / f"{m}.nc"
        with xr.open_dataarray(f) as da:
            new = (da * 0 + 1.0).load()
        new.to_netcdf(f)
    t2, _, _ = tb.build(root)
    w = t1["season"] == "winter"
    assert np.allclose(t1.loc[w, "B0"], t2.loc[w, "B0"])
    assert not np.allclose(t1.loc[~w, "B0"], t2.loc[~w, "B0"])
