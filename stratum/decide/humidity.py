"""The learned humidity correction as a pycontrails humidity scaling (build prompt §7.4 (b)).

``BandHumidityScaling`` divides RHi by the scaling factor ``s`` of the point's latitude band
(RHi → RHi / s, i.e. specific humidity → q / s, the same convention as pycontrails'
``ConstantHumidityScaling(rhi_adj=s)``). CoCiP applies it to the flight waypoints and to the
meteorology the contrails evolve in, so the corrected EF follows from the corrected humidity.

Which ``s`` a day uses: the band cells of the outer fold whose held-out season contains that
day (fitted on the other seasons only), so no day's correction has seen that day's labels.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from stratum.evaluate.splits import season_of


def band_s(cells: pd.DataFrame, n_bands: int) -> list[float]:
    by = cells.set_index("band")["s"]
    return [float(by.loc[i]) for i in range(n_bands)]


def scaling(edges_deg: list[float], s_by_band: list[float]) -> Any:
    """A pycontrails HumidityScaling applying RHi / s by latitude band."""
    from pycontrails.models.humidity_scaling import HumidityScaling
    from pycontrails.physics import thermo

    edges = np.asarray(edges_deg, float)
    s_arr = np.asarray(s_by_band, float)

    class BandHumidityScaling(HumidityScaling):
        name = "stratum_band_scaling"
        long_name = "STRATUM learned RHi scaling per latitude band"
        formula = "rhi -> rhi / s(latitude band)"
        scaler_specific_keys = ("latitude",)

        def scale(
            self, specific_humidity: Any, air_temperature: Any, air_pressure: Any, **kwargs: Any
        ) -> tuple[Any, Any]:
            lat = np.asarray(kwargs["latitude"], float)
            k = np.clip(np.searchsorted(edges, lat, side="right") - 1, 0, len(s_arr) - 1)
            s: Any = s_arr[k]
            if (
                hasattr(specific_humidity, "dims")
                and np.ndim(s) == 1
                and s.size != np.size(specific_humidity)
            ):
                import xarray as xr

                s = xr.DataArray(s, dims=["latitude"], coords={"latitude": kwargs["latitude"]})
            q = specific_humidity / s
            return q, thermo.rhi(q, air_temperature, air_pressure)

    return BandHumidityScaling()


def edges(bands: list[tuple[float, float]]) -> list[float]:
    return [b[0] for b in bands] + [bands[-1][1]]


def fold_for_day(day: str) -> str:
    """The seasonal outer fold that holds ``day`` out."""
    return str(season_of(np.array([int(day[5:7])]))[0])


def correction_dir(root: Path) -> Path:
    """Option-2 humidity corrections (fitted with detection efficiency), one folder per fold."""
    return root / "interim" / "correction"


def scaling_for_day(
    cdir: Path, day: str, bands: list[tuple[float, float]]
) -> tuple[Any, list[float]]:
    """The correction of the seasonal fold that holds ``day`` out."""
    cells = pd.read_csv(cdir / fold_for_day(day) / "scaling_band.csv")
    s = band_s(cells, len(bands))
    return scaling(edges(bands), s), s


def bootstrap(
    t: pd.DataFrame, bands: list[tuple[float, float]], n: int, seed: int, with_de: bool = True
) -> tuple[np.ndarray, np.ndarray]:
    """Humidity (i) and detection-efficiency (ii) uncertainty for the Monte Carlo: on each
    day-bootstrap resample of the training rows, ε is recomputed and the band s refitted with it.
    Returns (``n`` × n_bands s draws, ``n`` ε draws)."""
    from stratum.model import scaling as sc

    rng = np.random.default_rng(seed)
    days = np.unique(t["day"].to_numpy())
    by_day = {d: g for d, g in t.groupby("day")}
    s_out = np.empty((n, len(bands)))
    de_out = np.ones(n)
    for i in range(n):
        pick = rng.choice(days, len(days), replace=True)
        r = pd.concat([by_day[d] for d in pick], ignore_index=True)
        de = sc.detection_efficiency(r) if with_de else 1.0
        cells = sc.fit_cells(r, bands, by_season=False, de=de)
        s_out[i] = band_s(cells, len(bands))
        de_out[i] = de
    return s_out, de_out
