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

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _torch() -> Any:
    try:
        import torch
    except ImportError as e:  # pragma: no cover - environment guard
        raise RuntimeError("the learned detector needs PyTorch: uv sync --extra detector") from e
    return torch


def build_model(base: int = 32) -> Any:
    torch = _torch()
    nn = torch.nn

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
                [block(3, c[0]), block(c[0], c[1]), block(c[1], c[2]), block(c[2], c[3])]
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
        y = (F.interpolate(y, size=size, mode="area") > 0.25).float()  # thin lines survive
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
) -> list[float]:
    """Train in place on images x [N,3,H,W] (float16 ok) with masks y [N,H,W]; returns losses."""
    torch = _torch()
    dev = device()
    torch.manual_seed(cfg.seed + seed_offset)
    rng = np.random.default_rng(cfg.seed + seed_offset)
    model.to(dev).train()
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=cfg.weight_decay)
    n = len(x) * crops_per_item
    steps = max(1, math.ceil(n / cfg.batch)) * epochs
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=steps, pct_start=0.1)
    use_amp = dev.type == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    losses = []
    for ep in range(epochs):
        order = np.tile(rng.permutation(len(x)), crops_per_item)
        t0, tot = time.time(), 0.0
        for b in range(0, len(order), cfg.batch):
            idx = np.sort(order[b : b + cfg.batch])
            xb = torch.from_numpy(np.asarray(x[idx], np.float32))
            yb = torch.from_numpy(np.asarray(y[idx], np.float32)).unsqueeze(1)
            xb, yb = _augment(xb, yb, cfg, rng, shrink)  # on the CPU (works on every device)
            xb, yb = xb.contiguous().to(dev), yb.contiguous().to(dev)
            with torch.autocast(device_type=dev.type, enabled=use_amp):
                loss = _loss(model(xb).float(), yb, cfg.dice_weight)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            sched.step()
            tot += float(loss.detach()) * len(idx)
        losses.append(tot / max(1, len(order)))
        if ep == 0 or (ep + 1) % max(1, epochs // 10) == 0 or ep == epochs - 1:
            log(f"  epoch {ep + 1}/{epochs}: loss {losses[-1]:.4f} ({time.time() - t0:.0f} s)")
    return losses


def predict(model: Any, x: Array, batch: int = 8) -> Array:
    """Contrail probability for images x [N,3,H,W] (any H, W; padded to a multiple of 16)."""
    torch = _torch()
    dev = device()
    model.to(dev).eval()
    n, _, h, w = x.shape
    ph, pw = (-h) % 16, (-w) % 16
    out = np.empty((n, h, w), np.float32)
    with torch.no_grad():
        for b in range(0, n, batch):
            xb = torch.from_numpy(np.asarray(x[b : b + batch], np.float32)).to(dev)
            xb = torch.nn.functional.pad(xb, (0, pw, 0, ph), mode="reflect")
            p = torch.sigmoid(model(xb))[:, 0, :h, :w]
            out[b : b + batch] = p.float().cpu().numpy()
    return out


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
    m = build_model(int(ck["meta"].get("base_channels", 32)))
    m.load_state_dict(ck["state_dict"])
    return m, ck["meta"]
