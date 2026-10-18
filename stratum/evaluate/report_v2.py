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
    "body{font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:980px;margin:32px auto;"
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
        f"Run {run['run_id']} · commit {run['commit']} · {'FINAL run' if run.get('final') else 'non-final run'} · "
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
            f"{fname} — {f['test_rows']:,} segments, {f.get('test_days', 0)} days, {f.get('test_y1', 0)} observed",
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
            f"validation Brier (a) {ab['mean_validation_brier_a']:.5f}, (b) {ab['mean_validation_brier_b']:.5f}."
        )
    d.head("B4")
    d.para(res["b4"]["reason"])
    d.head("Deviations from the pre-registration (docs/deviations.md, verbatim)")
    d.md.append(deviations_md + "\n")
    d.h.append(f"<pre>{html.escape(deviations_md)}</pre>")
    return d.write(out, "evaluation_report_v2_h2", "STRATUM evaluation report v2 (H2)")


MODEL_CARD = [
    (
        "Model",
        "STRATUM correction: monotone gradient-boosted trees (LightGBM) on 18 ERA5 and "
        "position/time features, isotonic calibration; one model per held-out season and per side "
        "of the west/east split. Feedback into the physics: a humidity scaling factor per latitude "
        "band, fitted with detection efficiency (option b).",
    ),
    (
        "Intended use",
        "Research: estimating where ERA5-based contrail physics is wrong over India, "
        "and ranking flight segments by the lower bound of net warming avoided by a ±2,000/±4,000 ft "
        "change, with uncertainty ranges, for discussion with airlines and air traffic experts.",
    ),
    (
        "Out of scope",
        "Operational flight planning or air traffic control instructions; any use "
        "outside 6–37°N, 68–98°E, below FL250, or for seasons and conditions the labels do not cover "
        "(the confidence note says 'extrapolating'); estimates of aviation's total climate impact.",
    ),
    (
        "Data",
        "12 ADS-B days (Mar 2025–Feb 2026), ERA5, Meteosat-9 (IODC) contrail labels from an "
        "automatic detector matched to advected flight segments (D-004: ≥ 2 matched images). About a "
        "third of positive labels are expected to be chance matches; almost no monsoon labels.",
    ),
    (
        "Metrics",
        "Brier score and Brier skill score vs B3 (pre-registered primary), vs B0 and the "
        "RHi-only logistic; AUROC, POD, FAR, CSI; reliability diagrams; 1,000 day-bootstrap resamples.",
    ),
    (
        "Limitations",
        "Few days per season (2–4); labels are noisy and detection-limited; the "
        "detection efficiency comes from CoCiP itself; fuel from OpenAP at constant Mach over the same "
        "track; ATC feasibility, traffic and airline constraints are not modelled; contrail–contrail "
        "interactions are not modelled.",
    ),
    (
        "Ethical considerations",
        "Alerts can burn fuel for no benefit if wrong, so an alert needs a "
        "positive lower bound under both horizons. Public outputs show commercial flights only with "
        "hashed identities. Labels for India were drafted with AI assistance and reviewed by the "
        "team (D-003).",
    ),
]


def lorenz_png(h3: dict[str, Any], out: Path) -> Path:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    c = h3["curve"]
    fig, ax = plt.subplots(figsize=(5.2, 4.4))
    ax.plot(c["distance_share"], c["ef_share"], color="#c0392b", lw=1.8, label="corrected EF")
    ax.plot([0, 1], [0, 1], color="#888888", ls=":", lw=1, label="no concentration")
    ax.axhline(0.8, color="k", lw=0.6)
    ax.axvline(0.10, color="k", lw=0.6, ls="--")
    s = h3["share"]
    ax.set_title(
        f"H3: {s['value'] * 100:.1f} % of cruise distance carries 80 % of warming", fontsize=10
    )
    ax.set_xlabel("share of cruise flight distance (largest EF first)")
    ax.set_ylabel("share of positive energy forcing")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.02)
    ax.legend(frameon=False, fontsize=8, loc="lower right")
    fig.tight_layout()
    f = out / "h3_concentration.png"
    fig.savefig(f, dpi=150)
    plt.close(fig)
    return f


def _ci(r: dict[str, float] | None, pct: bool = False) -> str:
    if not r:
        return "—"
    k = 100.0 if pct else 1.0
    u = " %" if pct else ""
    return f"{r['value'] * k:.3g}{u} [{r['lo'] * k:.3g}, {r['hi'] * k:.3g}]"


def full_report(
    h2: dict[str, Any],
    h34: dict[str, Any],
    decisions: dict[str, Any],
    validation: dict[str, Any],
    correction: dict[str, Any],
    runs: dict[str, str],
    deviations_md: str,
    out: Path,
) -> dict[str, str]:
    """Evaluation report v2: H2–H4, model card, decision-layer summary (build prompt §7.8)."""
    out.mkdir(parents=True, exist_ok=True)
    d = Doc()
    d.head(
        "STRATUM evaluation report v2 — correction model (H2), concentration (H3), night (H4), decisions",
        1,
    )
    d.para(
        "Final runs: "
        + ", ".join(f"{k} {v}" for k, v in runs.items())
        + ". All logged in _locks/final_runs.jsonl."
    )
    d.head("Results in one line each")
    v2 = h2["h2"]
    d.table(
        ["hypothesis", "pre-registered test", "result [95 % CI]", "verdict"],
        [
            [
                "H2",
                "mean BSS vs B3 over held-out seasons ≥ 0.10 and lower bound > 0",
                _ci(v2["bss"]),
                "supported" if v2["supported"] else "not supported",
            ],
            [
                "H3",
                "share of cruise distance carrying 80 % of positive EF ≤ 10 %",
                _ci(h34["h3"]["share"], True),
                "supported" if h34["h3"]["supported"] else "not supported",
            ],
            [
                "H4",
                "night EF share − night distance share, lower bound > 0",
                _ci(h34["h4"]["difference"]),
                "supported" if h34["h4"]["supported"] else "not supported",
            ],
        ],
    )
    d.para(v2["sentence"])
    d.head("H2 — skill over the held-out seasons")
    refs = ["B3", "B0", "LOGIT", "B1", "B2"]
    d.table(
        ["model", *(f"BSS vs {r}" for r in refs)],
        [
            [m, *(_f(v.get(f"bss_vs_{r}")) for r in refs)]
            for m, v in h2["mean_over_seasons"].items()
        ],
    )
    d.head("Validation (training seasons only) and the feedback choice")
    d.table(
        ["fold", "constant", "logistic RHi", "GBM raw", "GBM calibrated", "(b) with ε"],
        [
            [
                f,
                f"{v['brier_climatology']:.5f}",
                f"{v['brier_logistic_rhi']:.5f}",
                f"{v['brier_gbm_raw']:.5f}",
                f"{v['brier_gbm_calibrated']:.5f}",
                f"{correction['folds'].get(f, {}).get('brier_scaling_b_de', float('nan')):.5f}",
            ]
            for f, v in validation["folds"].items()
        ],
    )
    ab = correction.get("a_vs_b", {})
    if ab:
        d.para(
            f"(a)-vs-(b) rule: {ab['rule']} → ({ab['choice']}); mean validation Brier (a) "
            f"{ab['mean_validation_brier_a']:.5f}, (b) {ab['mean_validation_brier_b']:.5f}."
        )
    d.table(
        [
            "held-out season",
            "detection efficiency ε",
            "s per band (with ε)",
            "s per band (literal, ε = 1)",
        ],
        [
            [
                f,
                f"{v['detection_efficiency']:.3f}",
                ", ".join(f"{c['band_deg']} {c['s']:.3f}" for c in v["s_band"]),
                ", ".join(f"{c['band_deg']} {c['s']:.3f}" for c in v["s_band_literal"]),
            ]
            for f, v in correction["folds"].items()
        ],
    )
    d.head("H3 — concentration of contrail warming")
    h3 = h34["h3"]
    d.para(
        f"{h3['segments_positive_ef']:,} of {h3['segments']:,} cruise segments have positive corrected EF; "
        f"{h3['share']['value'] * 100:.2f} % of {h3['distance_km']:,.0f} km of cruise distance carries 80 % of it "
        f"(day-bootstrap 95 % interval {h3['share']['lo'] * 100:.2f}–{h3['share']['hi'] * 100:.2f} %, descriptive)."
    )
    d.image(lorenz_png(h3, out), "H3 concentration curve")
    d.head("H4 — night flights")
    h4 = h34["h4"]
    d.para(
        f"Night (18:00–06:00 local solar time) carries {h4['night_share_positive_ef'] * 100:.1f} % of positive EF "
        f"and {h4['night_share_distance'] * 100:.1f} % of cruise distance; difference {_ci(h4['difference'])}."
    )
    d.head("Decision layer")
    if decisions.get("portions"):
        d.table(["item", "value"], [[k.replace("_", " "), str(v)] for k, v in decisions.items()])
    else:
        d.para("No flagged warming contrails on the held-out days.")
    d.para(
        "An alert needs the 5th percentile of net warming avoided to be positive under both the 20- and "
        "100-year horizons. 'Without fuel credit' counts the alerts that remain when a fuel saving at the "
        "new level is not counted. ATC feasibility is not modelled."
    )
    d.head("Model card")
    d.table(["", ""], [[k, v] for k, v in MODEL_CARD])
    d.head("Deviations from the pre-registration (docs/deviations.md, verbatim)")
    d.md.append(deviations_md + "\n")
    d.h.append(f"<pre>{html.escape(deviations_md)}</pre>")
    return d.write(out, "evaluation_report_v2", "STRATUM evaluation report v2")
