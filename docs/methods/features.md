# Correction-model features (paper §4.6; build prompt §7.2)

The exactly pre-registered set (`configs/preregistered.yaml: correction_model.features`), taken
from the Phase 2 segment table (`interim/segments_met`, built by `stratum/met/features.py`). Every
value is ERA5 at the segment (log-pressure interpolation) or the flight's own position and time:
no detector output, no CoCiP output and nothing computed with the labels.

Monotone constraints (LightGBM, native): **+1 on `rhi_at_level`** (more humid → never less
likely) and **−1 on `temp_minus_TLM`** (warmer relative to the Schmidt–Appleman threshold →
never more likely). The other features are unconstrained.

| feature | column | unit | why it might matter |
|---|---|---|---|
| rhi_at_level | `rhi` | 1 | ice supersaturation (RHi ≥ 1) is what lets a contrail persist |
| rhi_level_above | `rhi_level_above` | 1 | a moist layer just above/below means the ISSR may be thicker or misplaced vertically |
| rhi_level_below | `rhi_level_below` | 1 | as above, for the level below |
| rhi_vertical_gradient | `rhi_vertical_gradient_per_km` | km⁻¹ | sharp humidity edges are where ERA5's vertical resolution misses thin ISSRs |
| temperature | `temperature_k` | K | colder air favours formation and ice growth |
| temp_minus_TLM | `temp_minus_TLM` | K | distance from the Schmidt–Appleman threshold: warmer than T_LM, no contrail |
| pressure | `pressure_pa` | Pa | flight level; ERA5 humidity bias depends on altitude |
| cloud_ice_water_content | `cloud_ice_water_content` | kg kg⁻¹ | natural cirrus already present: humid air, but contrails harder to see |
| high_cloud_fraction | `high_cloud_fraction` | 1 | ERA5 cirrus at and above the level: supersaturation without a visible contrast |
| vertical_velocity | `vertical_velocity_pa_s` | Pa s⁻¹ | rising air cools and moistens, creating ISSRs ERA5 may underplay |
| vertical_wind_shear | `vertical_wind_shear_ms_per_km` | m s⁻¹ km⁻¹ | shear spreads contrails into wider, more visible cirrus |
| distance_to_tropopause_wmo | `distance_to_tropopause_m` | m | ISSRs cluster just below the tropopause; ERA5 is driest there |
| latitude | `lat_mid` | °N | tropical vs subtropical regime |
| longitude | `lon_mid` | °E | west/east India (sea vs land, monsoon onset) |
| month_sin | `month_sin` | 1 | season, encoded cyclically |
| month_cos | `month_cos` | 1 | season, encoded cyclically |
| local_solar_time_sin | `local_solar_time_sin` | 1 | day/night: detection and humidity both vary with the diurnal cycle |
| local_solar_time_cos | `local_solar_time_cos` | 1 | day/night, encoded cyclically |

Notes
* `temp_minus_TLM` is the paper's "temperature margin relative to T_LM"; T_LC is not a separate
  feature (it moves with T_LM and RHw, which the model already sees).
* Month and local solar time enter only as sin/cos pairs. With seasons held out, the test
  season's months are never seen in training; trees then use the nearest seen values. This is a
  limitation of leave-one-season-out with 12 days, reported with the results.
* `distance_to_tropopause_m` is negative below the WMO lapse-rate tropopause.
