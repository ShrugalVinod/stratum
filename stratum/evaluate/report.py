"""Evaluation report v1: Markdown + self-contained HTML (build prompt §6.7).

Written for Dr. Pant and an outside scientist: data summary, label counts, the baseline table
(every metric with its 95 % day-bootstrap interval, per held-out season and the spatial split),
reliability diagrams, the H1 result in one sentence with its breakdowns, sensitivity analyses,
and the full deviation log.
"""

from __future__ import annotations

import base64
import html
import io
from pathlib import Path
from typing import Any

import numpy as np

METRICS = [
    ("brier", "Brier"),
    ("bss_vs_B3", "BSS vs B3"),
    ("pod", "POD"),
    ("far", "FAR"),
    ("csi", "CSI"),
    ("auroc", "AUROC"),
]


def _f(v: dict[str, float] | None) -> str:
    if not v or not np.isfinite(v.get("value", np.nan)):
        return "—"
    lo, hi = v.get("lo", np.nan), v.get("hi", np.nan)
    ci = f" [{lo:.3f}, {hi:.3f}]" if np.isfinite(lo) and np.isfinite(hi) else ""
    return f"{v['value']:.3f}{ci}"


def _reliability_png(rel: dict[str, list[dict[str, Any]]]) -> str:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(5.2, 4.6))
    ax.plot([0, 1], [0, 1], color="#999999", lw=1, ls=":")
    colors = {
        "B0": "#6b7280",
        "B1": "#c0392b",
        "B2": "#e67e22",
        "B3": "#2c7fb8",
        "B1_cocip": "#8e44ad",
    }
    for m, rows in rel.items():
        if not rows:
            continue
        x = [r["mean_forecast"] for r in rows]
        y = [r["observed"] for r in rows]
        ax.plot(x, y, marker="o", ms=4, lw=1.4, color=colors.get(m, "k"), label=m)
    ax.set_xlabel("forecast probability (bin mean)")
    ax.set_ylabel("observed frequency")
    ax.set_xlim(0, 1)
    ax.set_ylim(
        0,
        max(0.05, max((r["observed"] for rows in rel.values() for r in rows), default=0.05) * 1.2),
    )
    ax.set_title("Reliability (10 equal-count bins, all held-out seasons)")
    ax.legend(frameon=False, fontsize=8)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150)
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()


def _table(headers: list[str], rows: list[list[str]]) -> tuple[str, str]:
    md = "| " + " | ".join(headers) + " |\n|" + "---|" * len(headers) + "\n"
    md += "".join("| " + " | ".join(r) + " |\n" for r in rows)
    h = (
        "<table><thead><tr>"
        + "".join(f"<th>{html.escape(x)}</th>" for x in headers)
        + "</tr></thead><tbody>"
    )
    h += (
        "".join("<tr>" + "".join(f"<td>{html.escape(c)}</td>" for c in r) + "</tr>" for r in rows)
        + "</tbody></table>"
    )
    return md, h


def write(
    res: dict[str, Any],
    out_dir: Path,
    run: dict[str, Any],
    deviations_md: str,
    phase5: dict[str, Any] | None = None,
) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    md: list[str] = []
    hb: list[str] = []

    def para(t: str) -> None:
        md.append(t + "\n")
        hb.append(f"<p>{html.escape(t)}</p>")

    def head(t: str, lvl: int = 2) -> None:
        md.append("#" * lvl + " " + t + "\n")
        hb.append(f"<h{lvl}>{html.escape(t)}</h{lvl}>")

    def table(headers: list[str], rows: list[list[str]]) -> None:
        a, b = _table(headers, rows)
        md.append(a)
        hb.append(b)

    head("STRATUM evaluation report v1 — baselines B0–B3 and H1", 1)
    para(f"Run {run['run_id']} · commit {run['commit']} · {'FINAL run' if run.get('final') else 'non-final run'} · "  # noqa: E501
         f"{run['n_resamples']} day-bootstrap resamples (seed {run['seed']}).")  # fmt: skip
    head("H1 in one sentence")
    para(res["h1"]["sentence"])
    if "secondary" in res["h1"]:
        s = res["h1"]["secondary"]
        para(f"Secondary (efficiency-adjusted, does not decide H1): detection efficiency {s['detection_efficiency']:.3f} "  # noqa: E501
             f"from {s['cocip_persistent_segments']:,} CoCiP-persistent segments; ratio {_f(s['ratio'])}.")  # fmt: skip  # noqa: E501
    para("Context: in Phase 5 a wrong-day check estimated that about a third of y = 1 labels are chance matches, "  # noqa: E501
         "which inflates observed occurrence and pushes the ratio down.")  # fmt: skip
    if "paragraph" in res["h1"]:
        head("Draft H1 paragraph for the paper")
        para(res["h1"]["paragraph"])
        (out_dir / "h1_paragraph.md").write_text(res["h1"]["paragraph"] + "\n")
    head("Data")
    d = res["data"]
    para(f"{d['rows_labelled_primary']:,} labelled segments (y known under the primary rule, D-004) on {d['days']} days; "  # noqa: E501
         f"{d['y1']:,} observed (y = 1).")  # fmt: skip
    table(
        ["season", "labelled segments", "y = 1"],
        [[k, f"{v['size']:,}", f"{v['sum']:,}"] for k, v in d["by_season"].items()],
    )
    if phase5:
        para(f"Phase 5 label summary: {phase5.get('y1_events', '—')} contrail events; chance share "
             f"{(phase5.get('wrong_day_null') or {}).get('share_of_y1_explained_by_chance', '—')}.")  # fmt: skip  # noqa: E501
    head("Primary metric: Brier skill score vs B3, mean over held-out seasons")
    table(
        ["model", "seasons", "BSS vs B3 [95 % CI]"],
        [[m, str(v["seasons"]), _f(v)] for m, v in res["primary"].items()],
    )
    head("Baselines by held-out fold")
    for fname, f in res["folds"].items():
        head(f"{fname} — {f['test_rows']:,} segments, {f.get('test_days', 0)} days, {f.get('test_y1', 0)} observed"  # noqa: E501
             + (f", {f['dropped']} dropped (flight on the other side)" if f.get("dropped") else ""), 3)  # fmt: skip  # noqa: E501
        if "models" not in f:
            para("No labelled test rows.")
            continue
        rows = []
        for m, r in f["models"].items():
            if "note" in r:
                rows.append([m, r["note"]] + [""] * (len(METRICS) - 1))
            else:
                rows.append([m] + [_f(r.get(k)) for k, _ in METRICS])
        table(["model"] + [n for _, n in METRICS], rows)
    head("Reliability")
    png = _reliability_png(res["reliability"])
    (out_dir / "reliability.png").write_bytes(base64.b64decode(png))
    md.append("![reliability](reliability.png)\n")
    hb.append(
        f'<img alt="Reliability diagram" src="data:image/png;base64,{png}" style="max-width:520px">'
    )
    para(
        "B1–B3 are 0/1 forecasts, so their reliability collapses to two points; B0 is a probability."  # noqa: E501
    )
    head("H1 breakdowns (descriptive, not tests)")
    for by, rows in res["h1"]["breakdowns"].items():
        head(by, 3)
        table([by, "segments", "days", "B1 predicted", "observed", "ratio [95 % CI]"],
              [[str(r[by]), f"{r['segments']:,}", str(r["days"]), f"{r['predicted_B1']:,}", f"{r['observed_y1']:,}",  # noqa: E501
                _f({"value": r["ratio_value"], "lo": r["ratio_lo"], "hi": r["ratio_hi"]})] for r in rows])  # fmt: skip  # noqa: E501
    head("Sensitivity analyses")
    rows = [[k, f"{v['segments']:,}", f"{v['observed_y1']:,}", _f(v["ratio"]), "yes" if v["supported"] else "no"]  # noqa: E501
            for k, v in res["h1"]["sensitivity_label_rule"].items()]  # fmt: skip
    wj = res["h1"]["without_january_2026"]
    rows.append(
        [
            "without Jan 2026 (dev month)",
            f"{wj['segments']:,}",
            "",
            _f(wj["ratio"]),
            "yes" if wj["supported"] else "no",
        ]
    )
    table(["H1 variant", "segments", "observed", "ratio [95 % CI]", "supported"], rows)
    para("Label rule: y_k1 = original pre-registered rule (any 1 matched image), y_k3 = 3 images. "
         "Age window: y_age_20_90 and y_age_40_120 use only images in that contrail-age window "
         "(primary: 20–120 min). Matching tolerances: y_tol_dist1p5 / dist3 (distance 1.5 / 3 px, "
         "primary 2 px) and y_tol_ang15 / ang30 (angle 15° / 30°, primary 20°), each a full "
         "re-match; rows missing from this table were not run.")  # fmt: skip
    head("B4")
    para(res["b4"]["reason"])
    head("Deviations from the pre-registration (docs/deviations.md, verbatim)")
    md.append(deviations_md + "\n")
    hb.append(f"<pre>{html.escape(deviations_md)}</pre>")

    md_text = "\n".join(md)
    style = ("body{font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:980px;margin:32px auto;"  # noqa: E501
             "padding:0 16px;color:#111}table{border-collapse:collapse;margin:8px 0 18px;font-size:13px}"  # noqa: E501
             "td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#f3f3f3}"
             "pre{white-space:pre-wrap;font-size:12px;background:#f8f8f8;padding:12px}")  # fmt: skip  # noqa: E501
    html_text = f"<!doctype html><html><head><meta charset='utf-8'><title>STRATUM evaluation report v1</title><style>{style}</style></head><body>{''.join(hb)}</body></html>"  # noqa: E501
    (out_dir / "evaluation_report_v1.md").write_text(md_text)
    (out_dir / "evaluation_report_v1.html").write_text(html_text)
    return {
        "md": str(out_dir / "evaluation_report_v1.md"),
        "html": str(out_dir / "evaluation_report_v1.html"),
    }
