@echo off
rem STRATUM expo (Windows): double-click. Needs Python 3 (python.org) installed before the expo.
cd /d "%~dp0"
where python >nul 2>nul || (echo Python 3 is needed: install it from python.org before the expo. & pause & exit /b 1)
start "STRATUM server" /min python serve.py
timeout /t 2 >nul
start "" chrome --kiosk --no-first-run "http://127.0.0.1:8765/?booth=1" || start "" "http://127.0.0.1:8765/?booth=1"
