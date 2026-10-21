"""Learned detector (D-005): TFRecord reader, input channels, probability hook, tiny training."""

import io
import struct

import numpy as np
import pytest

from stratum.detect import nn_data as nd
from stratum.detect import tfrecord as tr

# ── a minimal protobuf / TFRecord encoder, only for building test records ─────


def _varint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _ld(num: int, payload: bytes) -> bytes:  # length-delimited field
    return _varint(num << 3 | 2) + _varint(len(payload)) + payload


def _tensor(a: np.ndarray) -> bytes:
    dtype = {np.dtype("float64"): 2, np.dtype("int32"): 3}[a.dtype]
    shape = b"".join(_ld(2, _varint(1 << 3) + _varint(int(d))) for d in a.shape)
    return _varint(1 << 3) + _varint(dtype) + _ld(2, shape) + _ld(4, a.tobytes())


def _feature_bytes(v: bytes) -> bytes:
    return _ld(1, _ld(1, v))  # Feature.bytes_list.value


def _feature_int(v: int) -> bytes:
    return _ld(3, _ld(1, _varint(v)))  # Feature.int64_list.value (packed)


def _example(feats: dict[str, bytes]) -> bytes:
    entries = b"".join(_ld(1, _ld(1, k.encode()) + _ld(2, v)) for k, v in feats.items())
    return _ld(1, entries)


def _record(payload: bytes) -> bytes:
    return struct.pack("<Q", len(payload)) + b"\0" * 4 + payload + b"\0" * 4


def _oc_example(rng: np.random.Generator) -> tuple[bytes, dict[str, np.ndarray]]:
    bands = {b: rng.uniform(200, 300, (8, 6, 2)) for b in nd.OC_BANDS}
    mask = (rng.random((8, 6, 1)) > 0.8).astype(np.int32)
    feats = {b: _feature_bytes(_tensor(a)) for b, a in bands.items()}
    feats["human_pixel_masks"] = _feature_bytes(_tensor(mask))
    feats["n_times_before"] = _feature_int(1)
    feats["timestamp"] = _feature_int(1568431200)
    return _example(feats), {**bands, "mask": mask}


def test_tfrecord_round_trip() -> None:
    rng = np.random.default_rng(0)
    exs = [_oc_example(rng) for _ in range(3)]
    stream = io.BytesIO(b"".join(_record(e) for e, _ in exs) + b"\x05\x00")  # + truncated tail
    recs = list(tr.records(stream))
    assert len(recs) == 3
    for rec, (_, truth) in zip(recs, exs, strict=True):
        s = tr.sample(rec, nd.OC_BANDS)
        for b in nd.OC_BANDS:
            np.testing.assert_allclose(s[b], truth[b][..., 1].astype(np.float32))  # labelled time
        np.testing.assert_array_equal(s["mask"], truth["mask"][..., 0])
        assert s["timestamp"] == 1568431200


def test_channels_scaling_and_missing() -> None:
    t108 = np.array([[230.0, np.nan]])
    x = nd.channels(t108 - 2.0, t108, t108 - 4.0)
    assert x.shape == (3, 1, 2) and x.dtype == np.float32
    assert np.isclose(x[0, 0, 0], (4.0 - nd.BTD_OFF) / nd.BTD_SCALE)
    assert np.isclose(x[1, 0, 0], (230.0 - nd.T108_OFF) / nd.T108_SCALE)
    assert np.isclose(x[2, 0, 0], (-2.0 - nd.D87_OFF) / nd.D87_SCALE)
    assert (x[:, 0, 1] == 0).all()  # missing pixel → 0


def _scene(rng: np.random.Generator) -> tuple[np.ndarray, ...]:
    n = 96
    lat, lon = np.meshgrid(np.linspace(30, 20, n), np.linspace(70, 80, n), indexing="ij")
    t108 = 230 + rng.normal(0, 0.3, (n, n))
    t120 = t108 - 1.0 - rng.normal(0, 0.1, (n, n))
    rr = np.arange(20, 76)
    t120[rr, rr] -= 2.0  # a diagonal contrail: BTD +2 K
    t108[rr, rr] -= 1.5
    prob = np.zeros((n, n))
    prob[rr, rr] = 0.9
    return t108, t120, lat, lon, np.full((n, n), 30.0), prob


def test_detect_slot_with_probability() -> None:
    from stratum.detect.params import load_detector_params
    from stratum.detect.run import detect_slot

    t108, t120, lat, lon, vza, prob = _scene(np.random.default_rng(1))
    p = load_detector_params().model_copy(
        update={"hysteresis": (0.3, 0.6), "max_flank_asymmetry": 10.0}
    )
    df, _ = detect_slot(t108, t120, lat, lon, vza, p, None, "t", response=prob)
    assert len(df) >= 1
    assert df["length_px"].max() > 40
    assert np.allclose(df["confidence"], df["mean_response"])  # confidence = mean probability
    none, _ = detect_slot(t108, t120, lat, lon, vza, p, None, "t", response=np.zeros_like(prob))
    assert none.empty


@pytest.mark.slow
def test_unet_learns_a_line() -> None:
    pytest.importorskip("torch")
    from stratum.detect import nn

    rng = np.random.default_rng(0)
    x = rng.normal(size=(12, 3, 128, 128)).astype(np.float16)
    y = np.zeros((12, 128, 128), np.uint8)
    for i in range(12):
        r = int(rng.integers(20, 100))
        y[i, r : r + 2, 10:118] = 1
        x[i, 0, r : r + 2, 10:118] += 3
    m = nn.build_model(8)
    cfg = nn.TrainConfig(base_channels=8, batch=6, tile=96)
    losses = nn.train(m, x, y, 25, 3e-3, cfg, shrink=False, log=lambda _: None)
    assert losses[-1] < losses[0]
    p = nn.predict(m, x.astype(np.float32))
    assert p.shape == (12, 128, 128) and nn.dice(p, y) > 0.5
