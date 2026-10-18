"""H1: does uncorrected physics under-predict the contrails satellites see? (paper §6.4 Table 5;
build prompt §6.6; open question 1).

Ratio = (B1-predicted persistent-contrail occurrence) / (observed occurrence) over the labelled
(observable) segments, i.e. Σ B1 / Σ y. **Supported iff the whole 95 % day-bootstrap interval
is below 1** (pre-registered ``hypotheses.H1.supported_if: upper_ci < 1``).

* Primary (Q1): raw detectable occurrence, as labelled.
* Secondary (Q1, Q4): observed occurrence divided by the estimated detection efficiency, the
  share of CoCiP-persistent labelled segments that Driver et al.'s thresholds call detectable
  (τ ≥ 0.05 and width ≥ 1 pixel). Reported, does not decide H1.
* Breakdowns by season, west/east, VZA band, FL band and day/night: descriptive only.

Context reported next to the result (not part of the test): the wrong-day null says about a third
of y = 1 labels are chance matches (Phase 5), which inflates the observed occurrence and so
pushes the ratio *down*.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd

from stratum.evaluate.bootstrap import count_matrix, summarise

Array = npt.NDArray[np.float64]


def _per_day(table: pd.DataFrame, cols: list[str]) -> tuple[np.ndarray, Array]:
    g = table.groupby("day")[cols].sum()
    return g.index.to_numpy(), g.to_numpy(float)


def h1(table: pd.DataFrame, n_resamples: int, seed: int, level: float = 0.95) -> dict[str, Any]:
    t = table[np.isfinite(table["y"]) & np.isfinite(table["B1"])]
    days, s = _per_day(t, ["B1", "y"])
    w = count_matrix(len(days), n_resamples, seed)
    pred, obs = s[:, 0], s[:, 1]
    with np.errstate(divide="ignore", invalid="ignore"):
        boot = (w @ pred) / (w @ obs)
    ratio = pred.sum() / obs.sum() if obs.sum() else float("nan")
    r = summarise(ratio, boot, level)
    out: dict[str, Any] = {
        "definition": "primary: raw detectable (Q1)",
        "segments": len(t),
        "days": len(days),
        "predicted_B1": int(pred.sum()),
        "observed_y1": int(obs.sum()),
        "ratio": r,
        "supported": bool(np.isfinite(r["hi"]) and r["hi"] < 1.0),
    }
    if {"cocip_contrail", "detectable"} <= set(t.columns) and t["cocip_contrail"].notna().any():
        out["secondary"] = h1_efficiency_adjusted(t, w, days, level)
    return out


def h1_efficiency_adjusted(
    t: pd.DataFrame, w: Array, days: np.ndarray, level: float
) -> dict[str, Any]:
    c = t.assign(
        coc=t["cocip_contrail"].astype(float).fillna(0.0),
        det=(
            t["cocip_contrail"].astype(float).fillna(0.0)
            * t["detectable"].astype(float).fillna(0.0)
        ),
    )
    g = c.groupby("day")[["B1", "y", "coc", "det"]].sum().reindex(days).to_numpy(float)
    pred, obs, coc, det = g.T

    def ratio(p: Array, o: Array, cc: Array, dd: Array) -> Array:
        with np.errstate(divide="ignore", invalid="ignore"):
            eff = dd / cc
            out: Array = p / (o / eff)
        return out

    point = float(ratio(pred.sum(), obs.sum(), coc.sum(), det.sum()))
    boot = ratio(w @ pred, w @ obs, w @ coc, w @ det)
    eff = det.sum() / coc.sum() if coc.sum() else float("nan")
    return {
        "definition": "secondary: observed ÷ detection efficiency (Q1, Q4)",
        "detection_efficiency": round(float(eff), 4),
        "cocip_persistent_segments": int(coc.sum()),
        "ratio": summarise(point, boot, level),
    }


def breakdown(table: pd.DataFrame, by: str, n_resamples: int, seed: int) -> list[dict[str, Any]]:
    rows = []
    for k, g in table.groupby(by):
        r = h1(g, n_resamples, seed)
        rows.append({by: str(k), "segments": r["segments"], "days": r["days"],
                     "predicted_B1": r["predicted_B1"], "observed_y1": r["observed_y1"],
                     **{f"ratio_{x}": round(v, 3) for x, v in r["ratio"].items()}})  # fmt: skip
    return rows


def paper_sentence(r: dict[str, Any]) -> str:
    v = r["ratio"]
    verdict = "supported" if r["supported"] else "not supported"
    return (
        f"Across {r['segments']:,} observable labelled flight segments on {r['days']} days, "
        f"uncorrected ERA5 physics (B1) predicted {r['predicted_B1']:,} persistent contrails "
        f"against {r['observed_y1']:,} observed by Meteosat-9 (ratio {v['value']:.2f}, 95 % "
        f"day-bootstrap interval {v['lo']:.2f}–{v['hi']:.2f}); H1 is {verdict}."
    )


def _fmt(r: dict[str, float]) -> str:
    return f"{r['value']:.2f} (95 % CI {r['lo']:.2f}–{r['hi']:.2f})"


def paper_paragraph(res: dict[str, Any]) -> str:
    """Draft H1 paragraph for the paper, stating the outcome plainly whichever way it went."""
    h = res["h1"]
    r = h["ratio"]
    lines = [paper_sentence(h)]
    if h["supported"]:
        lines.append(
            "Uncorrected physics therefore under-predicts the persistent contrails that the "
            "satellite detects, as hypothesised."
        )
    elif r["lo"] > 1:
        lines.append(
            "The interval lies entirely above 1: uncorrected physics predicts *more* persistent "
            "contrails than the satellite detects, the opposite of the hypothesis."
        )
    else:
        lines.append(
            "The interval contains 1, so the data cannot tell whether physics under- or "
            "over-predicts."
        )
    if "secondary" in h:
        s = h["secondary"]
        lines.append(
            "Correcting the observations for detection efficiency "
            f"({s['detection_efficiency']:.2f}, "
            f"the share of CoCiP-persistent segments meeting Driver et al.'s thresholds) gives a "
            f"ratio of {_fmt(s['ratio'])}; this secondary definition does not decide H1."
        )
    sens = h.get("sensitivity_label_rule", {})
    if sens:
        verdicts = {k: v["supported"] for k, v in sens.items()}
        same = all(v == h["supported"] for v in verdicts.values())
        lines.append(
            "The verdict is "
            + ("unchanged" if same else "not robust")
            + " across the label-rule, age-window and tolerance variants ("
            + ", ".join(
                f"{k}: {'supported' if v else 'not supported'}" for k, v in verdicts.items()
            )
            + ")."
        )
    lines.append(
        "Two caveats bound the result: about a third of the satellite labels are expected to be "
        "chance matches (Phase 5 wrong-day check), which inflates the observed count, and almost "
        "no labels exist for June–October, when monsoon cloud hides contrails."
    )
    return " ".join(lines)
