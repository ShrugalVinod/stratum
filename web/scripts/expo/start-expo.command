#!/bin/bash
# STRATUM expo (macOS): double-click. Starts the local server and opens the site full-screen in
# booth mode. Works with Wi-Fi off. Close the Terminal window to stop.
cd "$(dirname "$0")"
PY=$(command -v python3 || command -v python)
if [ -z "$PY" ]; then osascript -e 'display alert "STRATUM" message "Python 3 is needed (install it before the expo)."'; exit 1; fi
"$PY" serve.py &
SERVER=$!
sleep 1.5
URL="http://127.0.0.1:8765/?booth=1"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --kiosk --user-data-dir="$HOME/.stratum-expo-chrome" --no-first-run "$URL"
else
  open "$URL"
fi
wait $SERVER
