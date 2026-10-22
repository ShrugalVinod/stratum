"""Learned contrail detector: a small U-Net (deviation D-005; needs ``uv sync --extra detector``).

1. **Pre-train** on OpenContrails (GOES-16; human masks). To bridge the pixel-size gap (ABI
   2 km, SEVIRI over India ≈ 3.5–5 km), every training tile is shrunk by a random factor
   0.45–0.9 before a 128 × 128 crop; flips and 90° turns, since contrails have no preferred
   direction.
2. **Fine-tune** on the DLR expert scenes (SEVIRI, the instrument of Meteosat-9): only the
   dataset's 51 training scenes.
3. Output: a per-pixel contrail probability. Line objects, their polylines and every later
   step are the existing detector's (``run.detect_slot(response=...)``), so matching, labels and
   scoring are unchanged and old and new detectors are compared on equal terms.

Loss: binary cross-entropy + soft Dice (contrail pixels are rare). AdamW, cosine schedule.

**v3** (``TrainConfig.for_v3``): 6 input channels; the network sees the image upsampled 2×
(contrails are 1–2 px wide) and its output is pooled back to the native grid; soft targets
(share of labellers per pixel), with shrunk OpenContrails tiles keeping a thin line's full
weight; training streams the shards in chunks; prediction averages an ensemble of models and
4 mirrored copies of the image (test-time augmentation).
Everything is seeded; results also depend on the GPU's floating-point order, so retraining
gives very close, not bit-identical, weights.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
import numpy.typing as npt

Array = npt.NDArray[np.float32]


@dataclass(frozen=True)
class TrainConfig:
    base_channels: int = 32
    tile: int = 128
    batch: int = 32
    pretrain_epochs: int = 15
    pretrain_lr: float = 1e-3
    finetune_epochs: int = 150
    finetune_crops_per_scene: int = 8
    finetune_lr: float = 3e-4
    weight_decay: float = 1e-4
    scale_min: float = 0.45
    scale_max: float = 0.9
    dice_weight: float = 1.0
    seed: int = 20261017
    in_channels: int = 3
    upscale: int = 1
    soft: bool = False
    shard_group: int = 20

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def for_v3(cls, **kw: Any) -> TrainConfig:
        base = {"in_channels": 6, "upscale": 2, "soft": True, "pretrain_epochs": 12}
        return cls(**{**base, **kw})


def _torch() -> Any:
    try:
        import torch
    except ImportError as e:  # pragma: no cover - environment guard
        raise RuntimeError("the learned detector needs PyTorch: uv sync --extra detector") from e
    return torch


def build_model(base: int = 32, in_channels: int = 3, upscale: int = 1) -> Any:
    torch = _torch()
    nn = torch.nn
    F = torch.nn.functional

    def block(cin: int, cout: int) -> Any:
        return nn.Sequential(
            nn.Conv2d(cin, cout, 3, padding=1, bias=False),
            nn.BatchNorm2d(cout),
            nn.ReLU(inplace=True),
            nn.Conv2d(cout, cout, 3, padding=1, bias=False),
            nn.BatchNorm2d(cout),
            nn.ReLU(inplace=True),
        )

    class UNet(nn.Module):  # type: ignore[misc,name-defined]
        def __init__(self) -> None:
            super().__init__()
            c = [base, base * 2, base * 4, base * 8, base * 8]
            self.enc = nn.ModuleList(
                [block(in_channels, c[0]), block(c[0], c[1]), block(c[1], c[2]), block(c[2], c[3])]
            )
            self.mid = block(c[3], c[4])
            self.up = nn.ModuleList(
                [nn.ConvTranspose2d(c[4], c[3], 2, 2), nn.ConvTranspose2d(c[3], c[2], 2, 2),
                 nn.ConvTranspose2d(c[2], c[1], 2, 2), nn.ConvTranspose2d(c[1], c[0], 2, 2)]
            )  # fmt: skip
            self.dec = nn.ModuleList([block(c[i] * 2, c[i]) for i in (3, 2, 1, 0)])
            self.head = nn.Conv2d(c[0], 1, 1)
            self.pool = nn.MaxPool2d(2)

        def forward(self, x: Any) -> Any:
            if upscale > 1:  # see thin lines at a finer grid, answer on the native one
                x = F.interpolate(x, scale_factor=upscale, mode="bilinear", align_corners=False)
            return self._unet(x) if upscale == 1 else F.avg_pool2d(self._unet(x), upscale)

        def _unet(self, x: Any) -> Any:
            skips = []
            for e in self.enc:
                x = e(x)
                skips.append(x)
                x = self.pool(x)
            x = self.mid(x)
            for up, dec, s in zip(self.up, self.dec, reversed(skips), strict=True):
                x = dec(torch.cat([up(x), s], dim=1))
            return self.head(x)

    return UNet()


def device() -> Any:
    torch = _torch()
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _augment(
    x: Any, y: Any, cfg: TrainConfig, rng: np.random.Generator, shrink: bool
) -> tuple[Any, Any]:
    """Random shrink (OpenContrails only), crop to ``cfg.tile``, flips, 90° turns. x [B,3,H,W]."""
    torch = _torch()
    F = torch.nn.functional
    if shrink:
        f = float(rng.uniform(cfg.scale_min, cfg.scale_max))
        size = [max(cfg.tile, round(s * f)) for s in x.shape[-2:]]
        x = F.interpolate(x, size=size, mode="area")
        ya = F.interpolate(y, size=size, mode="area")
        # thin lines survive: v1 thresholds; v3 (soft) rescales so a 1-px line keeps its weight
        y = (ya / f).clamp(0, 1) if cfg.soft else (ya > 0.25).float()
    h, w = x.shape[-2:]
    i, j = int(rng.integers(0, h - cfg.tile + 1)), int(rng.integers(0, w - cfg.tile + 1))
    x, y = x[..., i : i + cfg.tile, j : j + cfg.tile], y[..., i : i + cfg.tile, j : j + cfg.tile]
    if rng.random() < 0.5:
        x, y = x.flip(-1), y.flip(-1)
    k = int(rng.integers(0, 4))
    return torch.rot90(x, k, (-2, -1)), torch.rot90(y, k, (-2, -1))


def _loss(logits: Any, y: Any, dice_weight: float) -> Any:
    torch = _torch()
    bce = torch.nn.functional.binary_cross_entropy_with_logits(logits, y)
    p = torch.sigmoid(logits)
    inter = (p * y).sum()
    dice = 1 - (2 * inter + 1) / (p.sum() + y.sum() + 1)
    return bce + dice_weight * dice


class _Trainer:
    """One optimiser + schedule; ``step`` trains on one batch (augmenting on the GPU if any)."""

    def __init__(self, model: Any, steps: int, lr: float, cfg: TrainConfig, seed: int) -> None:
        torch = _torch()
        self.torch, self.cfg, self.dev = torch, cfg, device()
        torch.manual_seed(seed)
        self.rng = np.random.default_rng(seed)
        self.model = model.to(self.dev).train()
        self.opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=cfg.weight_decay)
        self.sched = torch.optim.lr_scheduler.OneCycleLR(
            self.opt, max_lr=lr, total_steps=max(1, steps), pct_start=0.1
        )
        self.amp = self.dev.type == "cuda"
        self.scaler = torch.amp.GradScaler("cuda", enabled=self.amp)

    def step(self, xb: Any, yb: Any, shrink: bool) -> float:
        torch = self.torch
        if self.dev.type == "cuda":  # augmentation on the GPU is much faster
            xb, yb = xb.to(self.dev), yb.to(self.dev)
        xb, yb = _augment(xb, yb, self.cfg, self.rng, shrink)  # CPU otherwise (works everywhere)
        xb, yb = xb.contiguous().to(self.dev), yb.contiguous().to(self.dev)
        with torch.autocast(device_type=self.dev.type, enabled=self.amp):
            loss = _loss(self.model(xb).float(), yb, self.cfg.dice_weight)
        self.opt.zero_grad(set_to_none=True)
        self.scaler.scale(loss).backward()
        self.scaler.step(self.opt)
        self.scaler.update()
        self.sched.step()
        return float(loss.detach())


def _batch(x: Any, y: Any, idx: Any, y_scale: float) -> tuple[Any, Any]:
    torch = _torch()
    xb = torch.from_numpy(np.asarray(x[idx], np.float32))
    yb = torch.from_numpy(np.asarray(y[idx], np.float32) * y_scale).unsqueeze(1)
    return xb, yb


def train(
    model: Any,
    x: Array,
    y: npt.NDArray[np.uint8],
    epochs: int,
    lr: float,
    cfg: TrainConfig,
    shrink: bool,
    crops_per_item: int = 1,
    log: Callable[[str], None] = print,
    seed_offset: int = 0,
    y_scale: float = 1.0,
) -> list[float]:
    """Train in place on images x [N,C,H,W] (float16 ok) with masks y [N,H,W] (× ``y_scale``:
    0.01 for soft labels stored as 0–100); returns the mean loss per epoch."""
    steps = max(1, math.ceil(len(x) * crops_per_item / cfg.batch)) * epochs
    tr_ = _Trainer(model, steps, lr, cfg, cfg.seed + seed_offset)
    losses = []
    for ep in range(epochs):
        order = np.tile(tr_.rng.permutation(len(x)), crops_per_item)
        t0, tot = time.time(), 0.0
        for b in range(0, len(order), cfg.batch):
            idx = np.sort(order[b : b + cfg.batch])
            tot += tr_.step(*_batch(x, y, idx, y_scale), shrink) * len(idx)
        losses.append(tot / max(1, len(order)))
        if ep == 0 or (ep + 1) % max(1, epochs // 10) == 0 or ep == epochs - 1:
            log(f"  epoch {ep + 1}/{epochs}: loss {losses[-1]:.4f} ({time.time() - t0:.0f} s)")
    return losses


def train_shards(
    model: Any,
    paths: list[Any],
    counts: list[int],
    epochs: int,
    lr: float,
    cfg: TrainConfig,
    log: Callable[[str], None] = print,
    target: str = "soft",
) -> list[float]:
    """Pre-train on many shards without holding them all in memory: each epoch visits the
    shards in a new random order, ``cfg.shard_group`` at a time, shuffled within the group."""
    steps = sum(math.ceil(c / cfg.batch) for c in counts) * epochs + len(paths) * epochs
    tr_ = _Trainer(model, steps, lr, cfg, cfg.seed)
    y_scale = 0.01 if target == "soft" else 1.0
    losses = []
    for ep in range(epochs):
        t0, tot, n = time.time(), 0.0, 0
        order = tr_.rng.permutation(len(paths))
        for g in range(0, len(order), cfg.shard_group):
            xs, ys = [], []
            for k in order[g : g + cfg.shard_group]:
                with np.load(paths[k]) as z:
                    xs.append(z["x"])
                    ys.append(z[target])
            x, y = np.concatenate(xs), np.concatenate(ys)
            perm = tr_.rng.permutation(len(x))
            for b in range(0, len(perm), cfg.batch):
                idx = np.sort(perm[b : b + cfg.batch])
                tot += tr_.step(*_batch(x, y, idx, y_scale), True) * len(idx)
                n += len(idx)
            del x, y, xs, ys
        losses.append(tot / max(1, n))
        dt = time.time() - t0
        log(f"  epoch {ep + 1}/{epochs}: loss {losses[-1]:.4f} ({dt:.0f} s, {n} tiles)")
    return losses


def predict(model: Any, x: Array, batch: int = 8, tta: bool = False) -> Array:
    """Contrail probability for images x [N,C,H,W] (any H, W; padded to a multiple of 16).
    ``tta``: average over the image and its 3 mirrored copies."""
    torch = _torch()
    dev = device()
    model.to(dev).eval()
    n, _, h, w = x.shape
    ph, pw = (-h) % 16, (-w) % 16
    flips: list[tuple[int, ...]] = [(), (-1,), (-2,), (-2, -1)] if tta else [()]
    out = np.empty((n, h, w), np.float32)
    with torch.no_grad():
        for b in range(0, n, batch):
            xb = torch.from_numpy(np.asarray(x[b : b + batch], np.float32)).to(dev)
            xb = torch.nn.functional.pad(xb, (0, pw, 0, ph), mode="reflect")
            acc: Any = 0
            for dims in flips:
                xi = xb.flip(dims) if dims else xb
                p = torch.sigmoid(model(xi))
                acc = acc + (p.flip(dims) if dims else p)
            out[b : b + batch] = (acc / len(flips))[:, 0, :h, :w].float().cpu().numpy()
    return out


def predict_ensemble(models: list[Any], x: Array, tta: bool = True, batch: int = 8) -> Array:
    """Mean probability over several models (each with test-time mirroring if ``tta``)."""
    return np.mean([predict(m, x, batch, tta) for m in models], axis=0).astype(np.float32)


def dice(prob: Array, y: npt.NDArray[np.uint8], th: float = 0.5) -> float:
    """Global pixel Dice (OpenContrails' own metric), for the pre-training sanity check."""
    p = prob >= th
    inter = float(np.logical_and(p, y > 0).sum())
    return 2 * inter / max(1.0, float(p.sum() + (y > 0).sum()))


def save(model: Any, path: Any, meta: dict[str, Any]) -> None:
    torch = _torch()
    torch.save({"state_dict": model.state_dict(), "meta": meta}, path)


def load(path: Any) -> tuple[Any, dict[str, Any]]:
    torch = _torch()
    ck = torch.load(path, map_location="cpu", weights_only=False)
    meta = ck["meta"]
    m = build_model(
        int(meta.get("base_channels", 32)),
        int(meta.get("in_channels", 3)),
        int(meta.get("upscale", 1)),
    )
    m.load_state_dict(ck["state_dict"])
    return m, meta
