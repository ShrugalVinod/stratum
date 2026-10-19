# Expo checklist — Innovation Summit, Houston (21–24 Apr 2027)

The booth runs the whole website **offline** from a folder (build prompt §8.2).

## Build the folder (a week before, and again the day before you fly)
```bash
npm --prefix web run build:expo
```
This writes `web/expo-build/` (≈ 10–60 MB): the site, the current data build, `serve.py` and the
start scripts. Copy the **whole folder** to:
- [ ] the booth laptop (Desktop),
- [ ] the backup laptop,
- [ ] two USB sticks (one in hand luggage, one with the posters).

## Test with Wi-Fi OFF (on every laptop, at home)
Done on Shrugal's Mac, 19 Oct 2026 (build ca9e684+ / data v1-d126083): all checks below passed.
Repeat on the backup laptop and, if it is Windows, with Python 3 installed.
- [x] Turn Wi-Fi off (and unplug Ethernet).
- [x] macOS: double-click `start-expo.command` (first time: right-click → Open). Windows: `start-expo.bat`.
- [x] Chrome opens full-screen on `http://127.0.0.1:8765/?booth=1` and the tour starts.
- [x] The tour reaches the map, opens an avoidance card, then Results and Methods, and loops.
- [x] Touch/click anything: the tour pauses ("Tour paused…"); after 1 minute it resumes.
- [x] Map: switch Physics / Published fix / STRATUM; change hour and flight level; open a card.
- [x] Results page shows H1–H4 with numbers and figures; Methods shows the model card.
- [x] Leave kiosk mode: Cmd+Q (macOS) / Alt+F4 (Windows).
- [ ] Python 3 is installed on the Windows laptop (python.org) — macOS has it.
- [ ] Chrome is installed (the scripts fall back to the default browser, without kiosk mode).

## Hardware
- [ ] Booth laptop + charger, backup laptop + charger.
- [ ] US plug adapters (type A/B) ×2, a power strip.
- [ ] HDMI/USB-C adapter for a monitor or TV, a mouse.
- [ ] Phone hotspot only as a fallback (the site does not need it).

## At the booth
- [ ] Printed poster with a QR code to the live site: https://stratum.aerospaceonyx.workers.dev
- [ ] Printed one-page summary of H1–H4 (from the Results page) and the "what didn't work" list.
- [ ] `docs/demo_script.md` and `docs/hard_questions.md` printed for the presenters.
- [ ] Every number said aloud is on the site (Results / Methods / Progress).

## If something breaks
- Site does not open: close the Terminal/command window, run the start script again.
- Port busy: set `STRATUM_PORT=8766` and run `python3 serve.py` in the folder, then open
  `http://127.0.0.1:8766/?booth=1`.
- Laptop dies: backup laptop, same folder. No laptop: the live site on a phone, or the posters.
