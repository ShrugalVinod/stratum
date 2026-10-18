"""Train/test splits without leakage (paper §6.2; build prompt §6.2).

* **Seasonal leave-one-season-out**: four folds from ``preregistered.yaml: periods.
  seasonal_folds`` (pre-monsoon Mar–May, monsoon Jun–Sep, post-monsoon Oct–Nov, winter Dec–Feb).
  Groups are the connected components of the graph linking every segment to its flight and to
  every satellite image it was checked in, so neither a flight nor an image ever sits on both
  sides. ``assert_no_leak`` checks it for every fold.
* **Validation folds** inside the training seasons: one per training day (leave-one-day-out),
  for tuning and calibration in Phase 7.
* **Spatial**: train west of 80°E, test east (and the reverse as a diagnostic). Images cover
  the whole domain, so here the group is the flight: each flight goes to the side holding most
  of its labelled segments; its few segments on the other side are dropped from that split
  (counted).
* **January 2026** (development month, inside winter): winter is reported with and without it
  (open question 7, ``dev_month_policy``).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

SEASONS = {
    "pre_monsoon": [3, 4, 5],
    "monsoon": [6, 7, 8, 9],
    "post_monsoon": [10, 11],
    "winter": [12, 1, 2],
}


def season_of(
    month: pd.Series | np.ndarray, folds: dict[str, list[int]] | None = None
) -> np.ndarray:
    f = folds or SEASONS
    lut = {m: s for s, ms in f.items() for m in ms}
    return np.array([lut[int(m)] for m in np.asarray(month)], dtype=object)


class _UF:
    def __init__(self, n: int) -> None:
        self.p = np.arange(n)

    def find(self, a: int) -> int:
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]
            a = int(self.p[a])
        return a

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)


def leakage_groups(table: pd.DataFrame, images: pd.DataFrame) -> pd.Series:
    """Group id per segment: connected components over shared flight_id and shared image.

    ``images``: (segment_id, image_time) rows, one per image the segment was checked in."""
    seg = table["segment_id"].to_numpy()
    idx = {s: i for i, s in enumerate(seg)}
    uf = _UF(len(seg))
    for key in (table["flight_id"].to_numpy(),):
        first: dict[object, int] = {}
        for i, k in enumerate(key):
            if k in first:
                uf.union(first[k], i)
            else:
                first[k] = i
    im = images[images["segment_id"].isin(idx)]
    first_img: dict[object, int] = {}
    for s, t in zip(im["segment_id"].to_numpy(), im["image_time"].to_numpy(), strict=True):
        i = idx[s]
        if t in first_img:
            uf.union(first_img[t], i)
        else:
            first_img[t] = i
    roots = np.array([uf.find(i) for i in range(len(seg))])
    return pd.Series(roots, index=table.index, name="group")


@dataclass
class Fold:
    name: str
    train: np.ndarray  # boolean masks over the table rows
    test: np.ndarray
    dropped: int = 0
    notes: dict[str, object] = field(default_factory=dict)


def seasonal_folds(table: pd.DataFrame, folds: dict[str, list[int]] | None = None) -> list[Fold]:
    s = table["season"].to_numpy()
    return [Fold(name, s != name, s == name) for name in (folds or SEASONS)]


def winter_without_month(table: pd.DataFrame, month: str = "2026-01") -> Fold:
    """Winter fold with the development month removed from the test set (open question 7)."""
    s = table["season"].to_numpy()
    m = pd.to_datetime(table["day"]).dt.strftime("%Y-%m").to_numpy()
    return Fold("winter_without_" + month, s != "winter", (s == "winter") & (m != month))


def validation_days(
    table: pd.DataFrame, train: np.ndarray
) -> list[tuple[str, np.ndarray, np.ndarray]]:
    """Leave-one-day-out folds inside a training set: (day, fit mask, validation mask)."""
    days = sorted(table.loc[train, "day"].unique())
    d = table["day"].to_numpy()
    return [(str(x), train & (d != x), train & (d == x)) for x in days]


def spatial_folds(table: pd.DataFrame, boundary_lon: float = 80.0) -> list[Fold]:
    west = table["lon_mid"].to_numpy(float) < boundary_lon
    share = pd.Series(west).groupby(table["flight_id"].to_numpy()).mean()
    flight_west = table["flight_id"].map(share).to_numpy() >= 0.5
    out = []
    for name, tr_side in (("train_west_test_east", True), ("train_east_test_west", False)):
        own = flight_west == tr_side
        train = own & (west == tr_side)
        test = ~own & (west != tr_side)
        dropped = int(len(table) - train.sum() - test.sum())
        out.append(Fold(name, train, test, dropped))
    return out


def assert_no_leak(fold: Fold, groups: pd.Series, flights: pd.Series) -> None:
    """No leakage group and no flight on both sides of a fold."""
    g = groups.to_numpy()
    f = flights.to_numpy()
    tg, sg = set(g[fold.train]), set(g[fold.test])
    tf, sf = set(f[fold.train]), set(f[fold.test])
    if tf & sf:
        raise AssertionError(f"{fold.name}: {len(tf & sf)} flights on both sides")
    seasonal = fold.name in SEASONS or fold.name.startswith("winter_without")
    if seasonal and tg & sg:
        raise AssertionError(f"{fold.name}: {len(tg & sg)} leakage groups on both sides")
