"""Label-rule variants: a persistent (2-image) match is far rarer by chance than a single one."""

from pathlib import Path

import numpy as np
import pandas as pd

from stratum.manifest import SUCCESS_MARKER
from stratum.match.diagnostics import _rates, label_variants


def _per(n: int, p: float, seed: int, persistent: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        m = rng.random(5) < p
        if i < persistent:
            m[:] = True  # a real contrail, seen in every image
        for k in range(5):
            rows.append({"segment_id": f"s{i}", "observable": True, "matched": bool(m[k])})
    return pd.DataFrame(rows)


def test_rates_rule() -> None:
    per = pd.DataFrame(
        {"segment_id": list("aabbcc"), "observable": [True] * 6, "matched": [1, 0, 1, 1, 0, 0]}
    ).astype({"matched": bool})
    assert _rates(per, 1) == {"y1": 2, "y0": 1, "rate": 2 / 3}
    assert _rates(per, 2)["y1"] == 1


def test_label_variants_on_real_and_null(tmp_path: Path) -> None:
    for kind, name, df in (
        ("matches", "2026-01/2026-01-01", _per(2000, 0.003, 1, persistent=20)),
        ("matches_null", "2026-01-01_on_2026-02-01", _per(2000, 0.003, 2)),
    ):
        d = tmp_path / "interim" / kind / name
        d.mkdir(parents=True)
        df.to_parquet(d / "per_slot.parquet")
        (d / SUCCESS_MARKER).touch()
    v = label_variants(tmp_path)
    assert v["any_1"]["chance_share"] > 0.5  # single matches are mostly chance here
    assert v["any_2"]["chance_share"] < 0.2  # persistent matches are mostly real
