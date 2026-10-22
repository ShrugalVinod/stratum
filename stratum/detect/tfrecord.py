"""Read OpenContrails TFRecords without TensorFlow (deviation D-005, learned detector).

OpenContrails (Ng et al. 2024, IEEE TGRS 62; Google Research, **CC BY 4.0**; GOES-16 ABI data
have no use restrictions) is published as TFRecord files of ``tf.train.Example`` protos whose
image features are ``tf.io.serialize_tensor`` bytes (``TensorProto``). This module decodes the
three wire formats directly (TFRecord framing, Example, TensorProto), so the pipeline needs no
TensorFlow and can stream the public bucket over HTTPS:
``https://storage.googleapis.com/goes_contrails_dataset/20250305/tfrecords/``.

Feature layout (Google's example notebook): GOES-16 ABI bands 8–16 as
``upper_vapor, mid_vapor, low_vapor, cloud_top (8.4 µm), ozone, data_10um, data_11um (11.2 µm),
data_12um (12.3 µm), co2``, each a float64 tensor (H, W, T); ``human_pixel_masks`` int32
(H, W, 1) at time index ``n_times_before``.
"""

from __future__ import annotations

import struct
from collections.abc import Iterator
from typing import IO, Any

import numpy as np
import numpy.typing as npt

# TensorFlow DataType enum values used by OpenContrails
_DTYPES: dict[int, Any] = {1: np.float32, 2: np.float64, 3: np.int32, 9: np.int64}


def records(f: IO[bytes]) -> Iterator[bytes]:
    """TFRecord framing: uint64 length, uint32 CRC, payload, uint32 CRC (CRCs not checked)."""
    while True:
        head = f.read(12)
        if len(head) < 12:
            return
        (n,) = struct.unpack("<Q", head[:8])
        data = f.read(n)
        if len(data) < n or len(f.read(4)) < 4:
            return  # truncated tail (e.g. a partial HTTP range)
        yield data


def _varint(b: bytes, i: int) -> tuple[int, int]:
    shift = out = 0
    while True:
        c = b[i]
        i += 1
        out |= (c & 0x7F) << shift
        if c < 0x80:
            return out, i
        shift += 7


def _fields(b: bytes) -> Iterator[tuple[int, int, Any]]:
    """Protobuf wire format: (field number, wire type, value) for every field of a message."""
    i = 0
    while i < len(b):
        key, i = _varint(b, i)
        num, wt = key >> 3, key & 7
        v: Any
        if wt == 0:
            v, i = _varint(b, i)
        elif wt == 1:
            v, i = b[i : i + 8], i + 8
        elif wt == 2:
            n, i = _varint(b, i)
            v, i = b[i : i + n], i + n
        elif wt == 5:
            v, i = b[i : i + 4], i + 4
        else:
            raise ValueError(f"unsupported protobuf wire type {wt}")
        yield num, wt, v


def _packed_varints(b: bytes) -> list[int]:
    out, i = [], 0
    while i < len(b):
        v, i = _varint(b, i)
        out.append(v if v < 1 << 63 else v - (1 << 64))
    return out


def example(b: bytes) -> dict[str, Any]:
    """tf.train.Example → {key: list[bytes] | float32 array | list[int]}."""
    out: dict[str, Any] = {}
    for num, _, features in _fields(b):
        if num != 1:
            continue
        for fnum, _, entry in _fields(features):
            if fnum != 1:
                continue
            key, value = "", b""
            for enum_, _, v in _fields(entry):
                if enum_ == 1:
                    key = v.decode()
                elif enum_ == 2:
                    value = v
            for kind, _, lst in _fields(value):
                if kind == 1:  # BytesList
                    out[key] = [v for n, _, v in _fields(lst) if n == 1]
                elif kind == 2:  # FloatList (packed or not)
                    vals: list[float] = []
                    for n, wt, v in _fields(lst):
                        if n == 1 and wt == 2:
                            vals.extend(np.frombuffer(v, "<f4").tolist())
                        elif n == 1 and wt == 5:
                            vals.append(struct.unpack("<f", v)[0])
                    out[key] = np.asarray(vals, np.float32)
                elif kind == 3:  # Int64List
                    ints: list[int] = []
                    for n, wt, v in _fields(lst):
                        if n == 1 and wt == 2:
                            ints.extend(_packed_varints(v))
                        elif n == 1 and wt == 0:
                            ints.append(v if v < 1 << 63 else v - (1 << 64))
                    out[key] = ints
    return out


def tensor(b: bytes) -> npt.NDArray[Any]:
    """TensorProto bytes (``tf.io.serialize_tensor``) → numpy array."""
    dtype, shape, content = None, [], b""
    for num, _, v in _fields(b):
        if num == 1:
            dtype = v
        elif num == 2:
            for dnum, _, dim in _fields(v):
                if dnum == 2:
                    size = next((s for n, _, s in _fields(dim) if n == 1), 0)
                    shape.append(int(size))
        elif num == 4:
            content = v
    if dtype not in _DTYPES:
        raise ValueError(f"unsupported tensor dtype {dtype}")
    return np.frombuffer(content, _DTYPES[dtype]).reshape(shape)


def sample(rec: bytes, bands: tuple[str, ...]) -> dict[str, Any]:
    """One OpenContrails example: the requested bands at the labelled time, the human mask."""
    ex = example(rec)
    t = int(ex["n_times_before"][0])
    out: dict[str, Any] = {b: tensor(ex[b][0])[..., t].astype(np.float32) for b in bands}
    out["mask"] = tensor(ex["human_pixel_masks"][0])[..., 0].astype(np.uint8)
    out["timestamp"] = int(ex["timestamp"][0])
    if "human_individual_masks" in ex:  # (H, W, 1, K); -1 = this labeller did not label
        ind = tensor(ex["human_individual_masks"][0])[..., 0, :].astype(np.float32)
        valid = (ind >= 0).any(axis=(0, 1))
        k = int(valid.sum())
        out["soft"] = (
            (np.clip(ind[..., valid], 0, 1).sum(-1) / k) if k else out["mask"].astype(np.float32)
        )
    return out
