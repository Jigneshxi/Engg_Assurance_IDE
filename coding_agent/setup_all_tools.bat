@echo off
cd /d "%~dp0"
call "%~dp0openclaw.bat" --setup
:: Canonical Python bootstrap: scripts\setup_python.mjs
