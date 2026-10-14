"""Physical constants used across STRATUM, each with its source.

What it does
------------
One place for every physical constant (build prompt §10: "Physical constants live in one
module with citations"). The Schmidt–Appleman constants (EI_H2O, c_p, ε, Q) are
*pre-registered*, so production code reads them from ``configs/preregistered.yaml`` via
:meth:`stratum.physics.sac.SACConstants.from_preregistered`. The defaults below equal those
values (a test checks this) and exist for quick interactive use and for tests.
"""

from __future__ import annotations

from typing import Final

# ── Schmidt–Appleman (paper §2.1 and Appendix A; Schumann 1996) ───────────────
EI_H2O: Final = 1.23  # kg kg⁻¹, water-vapour emission index of kerosene
C_P: Final = 1004.0  # J kg⁻¹ K⁻¹, specific heat of air at constant pressure
EPSILON: Final = 0.622  # ratio of molar masses, water / dry air
Q_FUEL: Final = 43.2e6  # J kg⁻¹, specific combustion heat of kerosene

# ── ICAO Standard Atmosphere (ICAO Doc 7488/3, 1993) ─────────────────────────
ISA_P0: Final = 101325.0  # Pa, sea-level pressure
ISA_T0: Final = 288.15  # K, sea-level temperature
ISA_LAPSE: Final = 0.0065  # K m⁻¹, tropospheric lapse rate
ISA_H_TROPOPAUSE: Final = 11000.0  # m, altitude of the ISA tropopause
ISA_T_TROPOPAUSE: Final = ISA_T0 - ISA_LAPSE * ISA_H_TROPOPAUSE  # 216.65 K
G0: Final = 9.80665  # m s⁻², standard gravity
R_DRY: Final = 287.05287  # J kg⁻¹ K⁻¹, specific gas constant of dry air (ICAO value)

# ── Unit conversions (exact by definition) ───────────────────────────────────
FT_TO_M: Final = 0.3048
KT_TO_MS: Final = 1852.0 / 3600.0
FPM_TO_MS: Final = FT_TO_M / 60.0
ZERO_CELSIUS: Final = 273.15  # K
