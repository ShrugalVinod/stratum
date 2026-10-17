"""Scene sampling: counts, strata, the 100/100 split, no near-duplicates, reproducibility."""

import numpy as np
import pandas as pd
import pytest

from stratum.labelling import sampling as sm

SEED = 20261017


def _cands(n_per: int = 6, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for mi in range(12):
        month = f"{2025 + (mi + 2) // 12}-{(mi + 2) % 12 + 1:02d}"
        for tod in sm.TOD_BINS:
            for dc in range(3):
                for _ in range(n_per):
                    rows.append(
                        {
                            "day": f"{month}-01",
                            "time": pd.Timestamp(f"{month}-01")
                            + pd.Timedelta(minutes=int(rng.integers(0, 96)) * 15),
                            "tmin": float(rng.integers(0, 96) * 15),
                            "r0": int(rng.integers(0, 7)) * 128,
                            "c0": int(rng.integers(0, 7)) * 128,
                            "month": month,
                            "tod_bin": tod,
                            "density": dc * 3,
                            "density_class": dc,
                        }
                    )
    return pd.DataFrame(rows)


def test_counts_split_and_strata() -> None:
    out, info = sm.sample_scenes(_cands(), 200, 20, SEED)
    main = out[out["role"] == "main"]
    assert len(main) == 200 and (out["role"] == "pilot").sum() == 20
    assert main["split"].value_counts().to_dict() == {"tuning": 100, "heldout": 100}
    # every stratum has at least one main scene (144 strata, all non-empty here)
    assert main.groupby(sm.STRATA).size().min() >= 1 and info["n_strata_nonempty"] == 144
    # both halves cover every month and time of day
    for col in ("month", "tod_bin", "density_class"):
        assert set(main.loc[main["split"] == "tuning", col]) == set(
            main.loc[main["split"] == "heldout", col]
        )
    assert out["scene_id"].is_unique and out["scene_id"].str.fullmatch(r"S\d{3}").all()


def test_no_near_duplicates_and_pilot_separate() -> None:
    out, _ = sm.sample_scenes(_cands(), 200, 20, SEED)
    rows = out.to_dict("records")
    for i, a in enumerate(rows):
        for b in rows[i + 1 :]:
            assert not (
                a["day"] == b["day"]
                and abs(a["tmin"] - b["tmin"]) <= sm.OVERLAP_MINUTES
                and abs(a["r0"] - b["r0"]) < 256
                and abs(a["c0"] - b["c0"]) < 256
            )
    pilot_months = out.loc[out["role"] == "pilot", "month"].value_counts()
    assert pilot_months.max() - pilot_months.min() <= 1  # spread over months


def test_same_seed_same_scenes_other_seed_differs() -> None:
    a, _ = sm.sample_scenes(_cands(), 200, 20, SEED)
    b, _ = sm.sample_scenes(_cands(), 200, 20, SEED)
    c, _ = sm.sample_scenes(_cands(), 200, 20, SEED + 1)
    key = ["day", "tmin", "r0", "c0", "split"]
    pd.testing.assert_frame_equal(a[key], b[key])
    assert not a[key].equals(c[key])


def test_density_classes_terciles_and_zero_heavy() -> None:
    cls, info = sm.density_classes(np.arange(9))
    assert info["method"] == "terciles" and list(np.bincount(cls)) == [3, 3, 3]
    x = np.array([0] * 70 + [1, 1, 2, 2, 3, 5, 8, 9, 20, 40] * 3)
    cls, info = sm.density_classes(x)
    assert (
        info["method"].startswith("zero") and (cls[x == 0] == 0).all() and set(cls[x > 0]) == {1, 2}
    )


def test_allocate_one_each_then_random_and_capped() -> None:
    rng = np.random.default_rng(1)
    q = sm.allocate({"a": 5, "b": 1, "c": 0, "d": 3}, 7, rng)
    assert q["b"] == 1 and "c" not in q and sum(q.values()) == 7 and q["a"] <= 5 and q["d"] <= 3
    with pytest.raises(ValueError):
        sm.allocate({"a": 1}, 2, rng)


def test_density_counts_age_window_and_tile() -> None:
    tiles = pd.DataFrame({"r0": [0, 128, 0], "c0": [0, 0, 128]})
    # segments at pixel (10,10) flown 30 min and 200 min before; one at (200, 10) 60 min before
    row = np.array([10.0, 10.0, 200.0])
    col = np.array([10.0, 10.0, 10.0])
    tseg = np.array([570.0, 400.0, 540.0])
    d = sm.density_for_slot(row, col, tseg, 600.0, tiles, (512, 512))
    assert list(d) == [2, 1, 0]  # tile 0: (10,10)@30 + (200,10)@60 min; the 200-min one is too old


def test_tod_bins_and_solar_time() -> None:
    assert list(sm.tod_bin([0, 5.5, 12, 18, 21])) == ["night", "dawn", "day", "dusk", "night"]
    assert sm.local_solar_hour(pd.Timestamp("2026-01-01 06:00"), 75.0) == pytest.approx(11.0)


def test_tile_origins_grid() -> None:
    o = sm.tile_origins((1118, 1036))
    assert len(o) == 7 * 7 and o[0] == (0, 0) and o[-1] == (768, 768)
