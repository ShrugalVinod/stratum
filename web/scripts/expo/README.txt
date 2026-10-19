STRATUM — offline expo build
============================

Runs the whole website from this folder with no internet.

  macOS:   double-click start-expo.command   (first time: right-click > Open, to allow it)
  Windows: double-click start-expo.bat       (needs Python 3 from python.org)
  Linux:   ./start-expo.sh

It opens http://127.0.0.1:8765/?booth=1 full-screen in Chrome. Booth mode tours the map, the top
avoidance alert, the results and the methods; it pauses when someone touches the screen and
resumes after one minute. Leave kiosk mode with Cmd+Q (macOS) or Alt+F4 (Windows).
Without booth mode: open http://127.0.0.1:8765/ instead.

Checklist: docs/expo_checklist.md in the STRATUM repository.
