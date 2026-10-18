"""Evaluation report v2 parts (build prompt §7.8): model validation (training rows only) and H2.
H3, H4, the model card and the decision-layer summary are added in later Phase 7 steps."""

from __future__ import annotations

import base64
import html
from pathlib import Path
from typing import Any

from stratum.evaluate.report import _f, _table

H2_METRICS = [
    ("brier", "Brier"),
    ("bss_vs_B3", "BSS vs B3"),
    ("bss_vs_B0", "BSS vs B0"),
    ("auroc", "AUROC"),
    ("pod", "POD"),
    ("csi", "CSI"),
]
STYLE = (
    "body{font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:980px;margin:32px auto;"  # noqa: E501
    "padding:0 16px;color:#111}table{border-collapse:collapse;margin:8px 0 18px;font-size:13px}"
    "td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#f3f3f3}"
    "pre{white-space:pre-wrap;font-size:12px;background:#f8f8f8;padding:12px}img{max-width:100%}"
)


class Doc:
    def __init__(self) -> None:
        self.md: list[str] = []
        self.h: list[str] = []

    def head(self, t: str, lvl: int = 2) -> None:
        self.md.append("#" * lvl + " " + t + "\n")
        self.h.append(f"<h{lvl}>{html.escape(t)}</h{lvl}>")

    def para(self, t: str) -> None:
        self.md.append(t + "\n")
        self.h.append(f"<p>{html.escape(t)}</p>")

    def table(self, headers: list[str], rows: list[list[str]]) -> None:
        a, b = _table(headers, rows)
        self.md.append(a)
        self.h.append(b)

    def image(self, f: Path, alt: str) -> None:
        self.md.append(f"![{alt}]({f.name})\n")
        b64 = base64.b64encode(f.read_bytes()).decode()
        self.h.append(f'<img alt="{html.escape(alt)}" src="data:image/png;base64,{b64}">')

    def write(self, out: Path, stem: str, title: str) -> dict[str, str]:
        (out / f"{stem}.md").write_text("\n".join(self.md))
        page = (
            f"<!doctype html><html><head><meta charset='utf-8'><title>{html.escape(title)}</title>"
            f"<style>{STYLE}</style></head><body>{''.join(self.h)}</body></html>"
        )
        (out / f"{stem}.html").write_text(page)
        return {"md": str(out / f"{stem}.md"), "html": str(out / f"{stem}.html")}


def validation_report(
    res: dict[str, Any], out: Path, run: dict[str, Any], figures: list[Path]
) -> dict[str, str]:
    d = Doc()
    d.head("STRATUM Phase 7 — correction model validation (training seasons only)", 1)
    d.para(
        f"Run {run['run_id']} · commit {run['commit']} · {res['n_trials']} Optuna trials per "
        f"fold · seed {res['seed']}. No held-out season or held-out side was scored."
    )
    d.head("Validation Brier score (leave-one-day-out inside each fold's training rows)")
    rows = []
    for f, v in res["folds"].items():
        rows.append(
            [
                f,
                f"{v['train_rows']:,}",
                str(v["train_pos"]),
                str(v["train_days"]),
                f"{v['brier_climatology']:.5f}",
                f"{v['brier_logistic_rhi']:.5f}",
                f"{v['brier_gbm_raw']:.5f}",
                f"{v['brier_gbm_calibrated']:.5f}",
                f"{v['brier_scaling_b']:.5f}",
            ]
        )
    d.table(
        [
            "fold (held out)",
            "train rows",
            "y = 1",
            "days",
            "constant rate",
            "logistic RHi",
            "GBM raw",
            "GBM calibrated",
            "(b) scaling",
        ],
        rows,
    )
    d.head("AUROC on validation days")
    d.table(
        ["fold", "logistic RHi", "GBM raw", "GBM calibrated", "(b) scaling"],
        [
            [
                f,
                *(
                    f"{v['auroc'][k]:.3f}"
                    for k in ("logistic_rhi", "gbm_raw", "gbm_calibrated", "scaling_b")
                ),
            ]
            for f, v in res["folds"].items()
        ],
    )
    ab = res["a_vs_b"]
    d.head("Option (a) vs (b)")
    d.para(
        f"Rule (pre-stated): {ab['rule']}. Mean validation Brier over the four seasonal folds: "
        f"(a) {ab['mean_validation_brier_a']:.5f}, (b) {ab['mean_validation_brier_b']:.5f}; "
        f"(b) − (a) = {ab['difference_b_minus_a']:+.5f} → choice: ({ab['choice']})."
    )
    d.head(
        "Monotonicity (calibrated model, real training rows swept over each constrained feature)"
    )
    d.table(
        ["fold", "feature", "rows", "rows with a wrong-way step"],
        [
            [f, k, str(m["rows"]), str(m["violations"])]
            for f, v in res["folds"].items()
            for k, m in v["monotonicity"].items()
        ],
    )
    d.head("RHi scaling factor s per latitude band (option b; RHi_scaled = RHi / s)")
    d.table(
        ["fold", "band", "s", "τ", "rows", "y = 1", "s on a bound"],
        [
            [
                f,
                c["band_deg"],
                f"{c['s']:.3f}",
                f"{c['tau']:.3f}",
                f"{c['n']:,}",
                str(c["pos"]),
                "yes" if c["s_at_bound"] else "no",
            ]
            for f, v in res["folds"].items()
            for c in v["scaling_cells_band"]
        ],
    )
    d.head("Chosen settings per fold")
    d.table(
        ["fold", "settings"],
        [
            [
                f,
                ", ".join(
                    f"{k}={x:.4g}" if isinstance(x, float) else f"{k}={x}"
                    for k, x in v["best_params"].items()
                ),
            ]
            for f, v in res["folds"].items()
        ],
    )
    d.head("Figures")
    for f in figures:
        d.image(f, f.stem.replace("_", " "))
    d.para(f"Model files hash (interim/model): {res['model_hash']}")
    return d.write(out, "model_validation", "STRATUM model validation")


def h2_report(
    res: dict[str, Any],
    out: Path,
    run: dict[str, Any],
    val: dict[str, Any] | None,
    deviations_md: str,
) -> dict[str, str]:
    d = Doc()
    d.head("STRATUM evaluation report v2 — part 1: H2 (correction model vs B3)", 1)
    d.para(
        f"Run {run['run_id']} · commit {run['commit']} · {'FINAL run' if run.get('final') else 'non-final run'} · "  # noqa: E501
        f"{run['n_resamples']} day-bootstrap resamples (seed {run['seed']}) · models frozen in "
        f"interim/model (hash {run.get('model_hash', '—')})."
    )
    d.head("H2 in one sentence")
    d.para(res["h2"]["sentence"])
    d.head("Mean skill over the four held-out seasons")
    refs = ["B3", "B0", "LOGIT", "B1", "B2"]
    d.table(
        ["model", *(f"BSS vs {r}" for r in refs)],
        [
            [m, *(_f(v.get(f"bss_vs_{r}")) for r in refs)]
            for m, v in res["mean_over_seasons"].items()
        ],
    )
    d.head("By held-out fold")
    for fname, f in res["folds"].items():
        d.head(
            f"{fname} — {f['test_rows']:,} segments, {f.get('test_days', 0)} days, {f.get('test_y1', 0)} observed",  # noqa: E501
            3,
        )
        if "models" not in f:
            d.para("No labelled test rows.")
            continue
        d.table(
            ["model", *(n for _, n in H2_METRICS)],
            [
                [
                    m,
                    *(
                        [r["note"]] + [""] * (len(H2_METRICS) - 1)
                        if "note" in r
                        else [_f(r.get(k)) for k, _ in H2_METRICS]
                    ),
                ]
                for m, r in f["models"].items()
            ],
        )
    d.para(
        "STRATUM = calibrated boosted model (a); STRATUM_raw = before calibration; STRATUM_b = "
        "RHi scaling factor per latitude band (b); LOGIT = logistic regression on RHi only. "
        "Spatial folds use models trained on the other side only."
    )
    if val:
        ab = val["a_vs_b"]
        d.para(
            f"Option (a) vs (b), decided on validation days before this run: ({ab['choice']}); "
            f"validation Brier (a) {ab['mean_validation_brier_a']:.5f}, (b) {ab['mean_validation_brier_b']:.5f}."  # noqa: E501
        )
    d.head("B4")
    d.para(res["b4"]["reason"])
    d.head("Deviations from the pre-registration (docs/deviations.md, verbatim)")
    d.md.append(deviations_md + "\n")
    d.h.append(f"<pre>{html.escape(deviations_md)}</pre>")
    return d.write(out, "evaluation_report_v2_h2", "STRATUM evaluation report v2 (H2)")
