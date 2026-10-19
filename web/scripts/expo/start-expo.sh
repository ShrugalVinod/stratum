#!/bin/sh
# STRATUM expo (Linux): ./start-expo.sh — local server + full-screen browser in booth mode.
cd "$(dirname "$0")"
python3 serve.py &
SERVER=$!
sleep 1.5
URL="http://127.0.0.1:8765/?booth=1"
OPENED=""
for B in google-chrome chromium chromium-browser; do
  if command -v "$B" >/dev/null 2>&1; then "$B" --kiosk --no-first-run "$URL" & OPENED=1; break; fi
done
[ -n "$OPENED" ] || xdg-open "$URL"
wait $SERVER
