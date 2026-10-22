"""Train, tune and check the learned detector (deviation D-005; Colab 09a–09b).

Same discipline as the line-filter tuning (D-002, ``tuning.py``):

1. ``prepare``: OpenContrails shards (streamed) and the DLR scenes → ``npz`` on Drive.
2. ``train``: pre-train on OpenContrails; then **5-fold** fine-tuning on the 51 DLR training
   scenes gives out-of-fold probabilities, on which the object settings (hysteresis in
   probability units, two geometry limits) are chosen by object F1, exactly as the old
   detector's threshold was. A final fine-tune on all 51 scenes is the model. The 89 DLR
   evaluation scenes are not read.
3. ``evaluate``: **once**, on the 89 evaluation scenes, new and old detector side by side, with
   95 % scene-bootstrap intervals. Logged in ``<Drive>/_locks/detector_runs.jsonl``; a second
   run needs a written reason (like a final run).

**v3** (``version="v3"``, own folder ``interim/detector_nn_v3``): 6 channels, soft labels, 2×
upsampling, all OpenContrails shards streamed; the **5 fold models are the ensemble** (each
evaluation scene is unseen by all five), every prediction averaged over 4 mirrored copies.
Its check is the second look at the evaluation scenes, so it needs a written reason, and it
reports the old line filter, v1 and v3 side by side plus two measures declared before the run
(D-005 addendum): pixel Dice against the experts' majority, and recall of the pixels all three
experts marked (``unanimous_recall``).
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from stratum.detect import nn
from stratum.detect import nn_data as nd
from stratum.detect import tuning as tu
from stratum.detect.params import DetectorParams, load_detector_params
from stratum.detect.run import detect_slot
from stratum.labelling import dlr

FOLDS = 5
# probability units; a rare class can give low probabilities, so the search starts at 0.1
HYSTERESIS = [
    (lo, hi) for lo in (0.1, 0.2, 0.3, 0.4, 0.5) for hi in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8) if hi > lo
]
GEOMETRY = [(res, spread) for res in (1.2, 2.0) for spread in (15.0, 25.0)]


def nn_dir(root: Path, version: str = "v1") -> Path:
    return root / "interim" / ("detector_nn" if version == "v1" else f"detector_nn_{version}")


def runs_log(root: Path) -> Path:
    """On Drive next to final_runs.jsonl; copied into the repository like it."""
    return root / "_locks" / "detector_runs.jsonl"


# ── 1. data ───────────────────────────────────────────────────────────────────


def prepare(
    root: Path,
    dlr_dir: Path,
    train_shards: list[int],
    val_shards: list[int],
    log: Any = print,
    version: str = "v1",
) -> dict[str, Any]:
    kind = "c3" if version == "v1" else "c6"
    out = nn_dir(root, version) / "data"
    res: dict[str, Any] = {"oc_train": [], "oc_val": []}
    for split, ks in (("train", train_shards), ("validation", val_shards)):
        for k in ks:
            r = nd.oc_shard(split, k, out, kind)
            res["oc_train" if split == "train" else "oc_val"].append(r)
            done = " (done before)" if r["skipped"] else ""
            log(f"  OpenContrails {split} {k:03d}: {r['n']} examples{done}")
    res["dlr_train"] = nd.dlr_shard(dlr_dir, dlr.TRAINING, out / "dlr_train.npz", kind)
    res["dlr_eval"] = nd.dlr_shard(dlr_dir, dlr.EVALUATION, out / "dlr_eval.npz", kind)
    res["credit"] = [nd.CREDIT_OC, dlr.CREDIT]
    (out / "summary.json").write_text(json.dumps(res, indent=1))
    return res


def _load(paths: list[Path]) -> tuple[np.ndarray, np.ndarray]:
    xs, ys = [], []
    for p in paths:
        with np.load(p) as z:
            xs.append(z["x"])
            ys.append(z["y"])
    return np.concatenate(xs), np.concatenate(ys)


# ── 2. train and choose settings on the DLR training scenes only ─────────────


def nn_params(
    p: DetectorParams, hyst: tuple[float, float], geom: tuple[float, float]
) -> DetectorParams:
    return p.model_copy(
        update={
            "hysteresis": hyst,
            "max_line_residual_px": geom[0],
            "max_orientation_spread_deg": geom[1],
        }
    )


def detect_scene_nn(s: tu.Scene, prob: np.ndarray, p: DetectorParams) -> pd.DataFrame:
    a = s.arrays
    df, _ = detect_slot(
        a["IR108"], a["IR120"], a["latitude"], a["longitude"], s.vza, p, s.coast, s.k, response=prob
    )
    df["scene"] = s.k
    return df


def score(scenes: list[tu.Scene], probs: dict[int, np.ndarray], p: DetectorParams) -> pd.DataFrame:
    dets = pd.concat([detect_scene_nn(s, probs[s.k], p) for s in scenes], ignore_index=True)
    return tu.scene_counts(dets, scenes, dets["confidence"].to_numpy(float), 0.0)


def select(
    scenes: list[tu.Scene], probs: dict[int, np.ndarray], base: DetectorParams, log: Any = print
) -> dict[str, Any]:
    rows = []
    for geom in GEOMETRY:
        for hyst in HYSTERESIS:
            r = tu.prf(score(scenes, probs, nn_params(base, hyst, geom)))
            rows.append(
                {
                    "hysteresis": list(hyst),
                    "max_line_residual_px": geom[0],
                    "max_orientation_spread_deg": geom[1],
                    **{k: round(v, 4) for k, v in r.items()},
                }
            )
    grid = pd.DataFrame(rows).sort_values("f1", ascending=False)
    best = grid.iloc[0].to_dict()
    log(f"  best out-of-fold setting: {best}")
    return {"best": best, "grid": grid.to_dict(orient="records")}


def train(root: Path, dlr_dir: Path, cfg: nn.TrainConfig, log: Any = print) -> dict[str, Any]:
    d = nn_dir(root)
    data = d / "data"

    def done(pattern: str) -> list[Path]:  # a stopped 09a can leave a half-written *.tmp.npz
        return sorted(f for f in data.glob(pattern) if not f.name.endswith(".tmp.npz"))

    oc_tr, oc_va = done("oc_train_*.npz"), done("oc_validation_*.npz")
    x, y = _load(oc_tr)
    log(f"Pre-training on {len(x)} OpenContrails examples ({len(oc_tr)} shards)")
    base_model = nn.build_model(cfg.base_channels)
    nn.train(base_model, x, y, cfg.pretrain_epochs, cfg.pretrain_lr, cfg, shrink=True, log=log)
    del x, y
    xv, yv = _load(oc_va)
    oc_dice = nn.dice(nn.predict(base_model, xv.astype(np.float32)), yv)
    log(f"OpenContrails validation Dice (2 km, before fine-tuning): {oc_dice:.3f}")
    del xv, yv
    state0 = {k: v.detach().clone() for k, v in base_model.state_dict().items()}

    with np.load(data / "dlr_train.npz") as z:
        xt, yt, sid = z["x"], z["y"], z["scene"].tolist()
    rng = np.random.default_rng(cfg.seed)
    fold = rng.permutation(len(sid)) % FOLDS
    oof: dict[int, np.ndarray] = {}
    for f in range(FOLDS):
        m = nn.build_model(cfg.base_channels)
        m.load_state_dict(state0)
        tr = np.flatnonzero(fold != f)
        log(f"Fine-tune fold {f + 1}/{FOLDS} on {len(tr)} DLR training scenes")
        quiet = lambda _: None  # noqa: E731
        nn.train(
            m,
            xt[tr],
            yt[tr],
            cfg.finetune_epochs,
            cfg.finetune_lr,
            cfg,
            shrink=False,
            crops_per_item=cfg.finetune_crops_per_scene,
            log=quiet,
            seed_offset=f + 1,
        )
        te = np.flatnonzero(fold == f)
        for i, p in zip(te, nn.predict(m, xt[te].astype(np.float32)), strict=True):
            oof[sid[i]] = p
    scenes = [tu.load_scene(dlr_dir, k) for k in sid]
    sel = select(scenes, oof, load_detector_params(), log)

    final = nn.build_model(cfg.base_channels)
    final.load_state_dict(state0)
    log(f"Final fine-tune on all {len(sid)} DLR training scenes")
    nn.train(
        final,
        xt,
        yt,
        cfg.finetune_epochs,
        cfg.finetune_lr,
        cfg,
        shrink=False,
        crops_per_item=cfg.finetune_crops_per_scene,
        log=log,
        seed_offset=99,
    )
    b = sel["best"]
    meta = {
        **cfg.as_dict(),
        "hysteresis": b["hysteresis"],
        "max_line_residual_px": b["max_line_residual_px"],
        "max_orientation_spread_deg": b["max_orientation_spread_deg"],
        "oof_train": {k: b[k] for k in ("precision", "recall", "f1", "recall_lenient")},
        "oc_validation_dice": round(oc_dice, 4),
        "oc_train_examples": int(sum(np.load(p)["y"].shape[0] for p in oc_tr)),
        "dlr_train_scenes": sid,
        "created_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "credit": [nd.CREDIT_OC, dlr.CREDIT],
    }
    d.mkdir(parents=True, exist_ok=True)
    nn.save(final, d / "model.pt", meta)
    meta["model_sha256"] = hashlib.sha256((d / "model.pt").read_bytes()).hexdigest()
    (d / "train_summary.json").write_text(
        json.dumps({**meta, "selection_grid": sel["grid"]}, indent=1)
    )
    return meta


# ── 3. one-shot check on the 89 evaluation scenes ─────────────────────────────


def evaluate(
    root: Path, dlr_dir: Path, rerun_reason: str | None = None, log: Any = print
) -> dict[str, Any]:
    d = nn_dir(root)
    sha = hashlib.sha256((d / "model.pt").read_bytes()).hexdigest()
    logf = runs_log(root)
    prior = (
        [json.loads(x) for x in logf.read_text().splitlines() if x.strip()] if logf.exists() else []
    )
    if any(r.get("model_sha256") == sha for r in prior) and not rerun_reason:
        raise RuntimeError(
            "This model was already evaluated on the DLR evaluation scenes; "
            "a second evaluation needs --rerun-reason."
        )
    model, meta = nn.load(d / "model.pt")
    with np.load(d / "data" / "dlr_eval.npz") as z:
        xe, sid = z["x"], z["scene"].tolist()
    probs = dict(zip(sid, nn.predict(model, xe.astype(np.float32)), strict=True))
    scenes = [tu.load_scene(dlr_dir, k) for k in sid]
    base = load_detector_params()
    p_new = nn_params(
        base,
        tuple(meta["hysteresis"]),
        (meta["max_line_residual_px"], meta["max_orientation_spread_deg"]),
    )
    c_new = score(scenes, probs, p_new)
    old = pd.concat([tu.detect_scene(s, base) for s in scenes], ignore_index=True)
    c_old = tu.scene_counts(
        old, scenes, old["confidence"].to_numpy(float), base.operating_threshold
    )
    seed = 20261017
    res: dict[str, Any] = {
        "new": {
            **{k: round(v, 4) for k, v in tu.prf(c_new).items()},
            "ci95": tu.bootstrap_ci(c_new, seed),
        },
        "old": {
            **{k: round(v, 4) for k, v in tu.prf(c_old).items()},
            "ci95": tu.bootstrap_ci(c_old, seed),
        },
        "scenes": len(sid),
        "expert_lines": int(c_new["exp"].sum()),
        "pixel_dice_new": round(
            nn.dice(
                np.stack([probs[k] for k in sid]),
                np.stack([s.arrays["ground_truth"] > 0.5 for s in scenes]).astype(np.uint8),
            ),
            4,
        ),
    }
    entry = {
        "time_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "model_sha256": sha,
        "rerun_reason": rerun_reason,
        "new_f1": res["new"]["f1"],
        "old_f1": res["old"]["f1"],
    }
    logf.parent.mkdir(parents=True, exist_ok=True)
    with logf.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    out = d / "eval_summary.json"
    full = {
        **res,
        "log_entry": entry,
        "per_scene_new": c_new.to_dict(orient="records"),
        "per_scene_old": c_old.to_dict(orient="records"),
    }
    out.write_text(json.dumps(full, indent=1))
    return res


# ── v3: ensemble of soft-label, 6-channel, 2×-upsampled models ───────────────


def _done(data: Path, pattern: str) -> list[Path]:
    return sorted(f for f in data.glob(pattern) if not f.name.endswith(".tmp.npz"))


def _counts(paths: list[Path]) -> list[int]:
    out = []
    for p in paths:
        with np.load(p) as z:
            out.append(int(z["y"].shape[0]))
    return out


def train_v3(root: Path, dlr_dir: Path, cfg: nn.TrainConfig, log: Any = print) -> dict[str, Any]:
    """Pre-train (streamed), 5-fold fine-tune on the DLR training scenes with soft labels, choose
    the object settings on out-of-fold probabilities; the 5 fold models are the ensemble."""
    d = nn_dir(root, "v3")
    data = d / "data"
    oc_tr, oc_va = _done(data, "oc_train_*.npz"), _done(data, "oc_validation_*.npz")
    counts = _counts(oc_tr)
    log(f"Pre-training v3 on {sum(counts)} OpenContrails examples ({len(oc_tr)} shards, streamed)")
    base_model = nn.build_model(cfg.base_channels, cfg.in_channels, cfg.upscale)
    nn.train_shards(base_model, oc_tr, counts, cfg.pretrain_epochs, cfg.pretrain_lr, cfg, log=log)
    xv, yv = _load(oc_va)
    oc_dice = nn.dice(nn.predict(base_model, xv.astype(np.float32), tta=True), yv)
    log(f"OpenContrails validation Dice (2 km, before fine-tuning): {oc_dice:.3f}")
    del xv, yv
    state0 = {k: v.detach().clone() for k, v in base_model.state_dict().items()}

    with np.load(data / "dlr_train.npz") as z:
        xt, soft, sid = z["x"], z["soft"], z["scene"].tolist()
    rng = np.random.default_rng(cfg.seed)
    fold = rng.permutation(len(sid)) % FOLDS
    oof: dict[int, np.ndarray] = {}
    names = []
    d.mkdir(parents=True, exist_ok=True)
    for f in range(FOLDS):
        m = nn.build_model(cfg.base_channels, cfg.in_channels, cfg.upscale)
        m.load_state_dict(state0)
        tr = np.flatnonzero(fold != f)
        log(f"Fine-tune fold {f + 1}/{FOLDS} on {len(tr)} DLR training scenes (soft labels)")
        nn.train(m, xt[tr], soft[tr], cfg.finetune_epochs, cfg.finetune_lr, cfg, shrink=False,
                 crops_per_item=cfg.finetune_crops_per_scene, log=lambda _: None,
                 seed_offset=f + 1, y_scale=0.01)  # fmt: skip
        te = np.flatnonzero(fold == f)
        for i, p in zip(te, nn.predict(m, xt[te].astype(np.float32), tta=True), strict=True):
            oof[sid[i]] = p
        name = f"model_fold{f + 1}.pt"
        nn.save(m, d / name, {**cfg.as_dict(), "fold": f + 1})
        names.append(name)
    scenes = [tu.load_scene(dlr_dir, k) for k in sid]
    sel = select(scenes, oof, load_detector_params(), log)
    b = sel["best"]
    sha = hashlib.sha256(b"".join((d / n).read_bytes() for n in names)).hexdigest()
    meta = {
        **cfg.as_dict(),
        "version": "v3",
        "inputs": "c6",
        "models": names,
        "tta": True,
        "hysteresis": b["hysteresis"],
        "max_line_residual_px": b["max_line_residual_px"],
        "max_orientation_spread_deg": b["max_orientation_spread_deg"],
        "oof_train": {k: b[k] for k in ("precision", "recall", "f1", "recall_lenient")},
        "oc_validation_dice": round(oc_dice, 4),
        "oc_train_examples": int(sum(counts)),
        "dlr_train_scenes": sid,
        "created_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "credit": [nd.CREDIT_OC, dlr.CREDIT],
        "model_sha256": sha,
    }
    (d / "meta.json").write_text(json.dumps(meta, indent=1))
    (d / "train_summary.json").write_text(
        json.dumps({**meta, "selection_grid": sel["grid"]}, indent=1)
    )
    return meta


def load_detector(root: Path, version: str) -> tuple[Any, dict[str, Any]]:
    """(predict function on [N, C, H, W] inputs, meta) for the v1 model or the v3 ensemble."""
    d = nn_dir(root, version)
    if version == "v1":
        model, meta = nn.load(d / "model.pt")
        return (lambda x: nn.predict(model, x)), {**meta, "inputs": "c3"}
    meta = json.loads((d / "meta.json").read_text())
    models = [nn.load(d / name)[0] for name in meta["models"]]
    return (lambda x: nn.predict_ensemble(models, x, tta=bool(meta.get("tta", True)))), meta


def _pixel_scores(prob: np.ndarray, majority: np.ndarray, cert: np.ndarray) -> dict[str, float]:
    p = prob >= 0.5
    inter = float(np.logical_and(p, majority > 0).sum())
    unanimous = cert >= 3
    return {
        "pixel_dice": round(2 * inter / max(1.0, float(p.sum() + (majority > 0).sum())), 4),
        "unanimous_recall": round(
            float(p[unanimous].mean()) if unanimous.any() else float("nan"), 4
        ),
    }


def evaluate_v3(
    root: Path, dlr_dir: Path, rerun_reason: str | None, log: Any = print
) -> dict[str, Any]:
    """The v3 check on the 89 evaluation scenes: line filter, v1 and v3 side by side."""
    logf = runs_log(root)
    prior = (
        [json.loads(x) for x in logf.read_text().splitlines() if x.strip()] if logf.exists() else []
    )
    if prior and not rerun_reason:
        raise RuntimeError(
            "The DLR evaluation scenes were already used (see _locks/detector_runs.jsonl); "
            "this check needs --rerun-reason."
        )
    d3 = nn_dir(root, "v3")
    pred3, meta3 = load_detector(root, "v3")
    with np.load(d3 / "data" / "dlr_eval.npz") as z:
        x6, sid, cert = z["x"], z["scene"].tolist(), z["certainty"]
    with np.load(nn_dir(root, "v1") / "data" / "dlr_eval.npz") as z:
        x3 = z["x"]
    scenes = [tu.load_scene(dlr_dir, k) for k in sid]
    majority = np.stack([(np.nan_to_num(s.arrays["ground_truth"]) > 0.5) for s in scenes]).astype(
        np.uint8
    )
    base = load_detector_params()
    seed = 20261017
    out: dict[str, Any] = {"scenes": len(sid)}
    for name, prob, meta in (
        ("v3", pred3(x6.astype(np.float32)), meta3),
        ("v1", *_v1_eval_probs(root, x3)),
    ):
        p = nn_params(
            base,
            tuple(meta["hysteresis"]),
            (meta["max_line_residual_px"], meta["max_orientation_spread_deg"]),
        )
        c = score(scenes, dict(zip(sid, prob, strict=True)), p)
        out[name] = {
            **{k: round(v, 4) for k, v in tu.prf(c).items()},
            "ci95": tu.bootstrap_ci(c, seed),
            **_pixel_scores(prob, majority, cert),
        }
        out[f"per_scene_{name}"] = c.to_dict(orient="records")
    old = pd.concat([tu.detect_scene(s, base) for s in scenes], ignore_index=True)
    c_old = tu.scene_counts(
        old, scenes, old["confidence"].to_numpy(float), base.operating_threshold
    )
    out["old"] = {
        **{k: round(v, 4) for k, v in tu.prf(c_old).items()},
        "ci95": tu.bootstrap_ci(c_old, seed),
    }
    out["expert_lines"] = int(c_old["exp"].sum())
    entry = {
        "time_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "version": "v3",
        "model_sha256": meta3["model_sha256"],
        "rerun_reason": rerun_reason,
        "v3_f1": out["v3"]["f1"],
        "v1_f1": out["v1"]["f1"],
        "old_f1": out["old"]["f1"],
        "v3_pixel_dice": out["v3"]["pixel_dice"],
        "v3_unanimous_recall": out["v3"]["unanimous_recall"],
    }
    logf.parent.mkdir(parents=True, exist_ok=True)
    with logf.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    (d3 / "eval_summary.json").write_text(
        json.dumps({**out, "log_entry": entry}, indent=1, default=str)
    )
    return out


def _v1_eval_probs(root: Path, x3: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    pred1, meta1 = load_detector(root, "v1")
    return pred1(x3.astype(np.float32)), meta1
