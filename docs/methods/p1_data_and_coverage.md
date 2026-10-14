# Where our data come from — and how we check they are good enough

*Phase 1 explainer (≤ 5-minute read). Figure: `reports/phase1/era5_250hPa_2026-01-15T06.png`.*

**Three kinds of data, all free for research.**

1. **Weather — ERA5.** ECMWF's "reanalysis": a best guess of the whole atmosphere every hour on
   a 25 km grid, made by combining a weather model with millions of observations. We take
   temperature, humidity, wind, cloud and radiation between roughly 5 and 16 km altitude over a
   box a little bigger than India (contrails drift, so we need margin). One year is about
   38 GB. We downloaded it from the Copernicus Climate Data Store, and checked that Google's
   copy of ERA5 gives the *same numbers* (differences only in the 6th significant digit).
2. **Flights — ADS-B.** Planes broadcast their position, altitude and callsign every second or
   so. Volunteer receivers collect these. ADS-B Exchange gives the complete record for the 1st
   of every month for free: in just 5 minutes on 1 Jan 2026, 34 aircraft were cruising in the
   Delhi–Mumbai corridor. OpenSky could give every day; our access request is pending.
3. **Satellite — Meteosat-9.** A European weather satellite parked 35,786 km above the
   Indian Ocean takes an infrared picture every 15 minutes. Ice absorbs a bit more at 12 µm
   than at 10.8 µm, so a contrail shows up as a thin bright line in the *difference* of those
   two channels — by day *and* by night. We checked our pixel positions by drawing the
   coastline on a night-time image: it sits exactly on the land/sea edge.

**Why "viewing angle" matters.** The satellite is west of India, so it sees the east at a
slant: about 38° at Mumbai, 48° at Delhi, 59° at Guwahati. Beyond 60° (9 % of our box, the far
north-east) pixels are too stretched to see contrails, so those scenes count as *unknown*.

**The coverage audit (the first real test).** Before using any flight source we count, for
sample days, how many scheduled Delhi–Mumbai flights it captures with a continuous cruise
track (no gap over 10 minutes). We fixed the rule *before* looking (paper §3.3): OpenSky if it
gets at least half; otherwise the 12 free ADS-B Exchange days. Result: **pending** — it needs
the scheduled-flight list our team is compiling.

**Honest limits.** Only 12 free flight days means few days per season and wide uncertainty
ranges. ERA5 is known to be too dry near cruise altitude — that is exactly what STRATUM
measures.
