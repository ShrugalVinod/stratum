"""The website's JSON must parse in a browser: no NaN / Infinity tokens."""

import json
import math

import numpy as np
import pytest

from stratum.export.web_export import finite, web_json


def test_non_finite_become_null() -> None:
    obj = {
        "a": math.nan,
        "b": [1.0, np.float64("inf"), {"c": -math.inf}],
        "d": np.int64(3),
        "e": "x",
    }
    s = web_json(obj)
    assert "NaN" not in s and "Infinity" not in s
    assert json.loads(s) == {"a": None, "b": [1.0, None, {"c": None}], "d": 3, "e": "x"}
    assert finite((1.0, math.nan)) == [1.0, None]


def test_plain_dumps_would_have_failed_in_a_browser() -> None:
    with pytest.raises(ValueError):
        json.dumps({"a": math.nan}, allow_nan=False)
