@echo off
rem Double-click to start the 45 Days workout app on this PC.
title 45 Days - workout tracker
cd /d "%~dp0"
where python >nul 2>nul && (python serve.py & goto :end)
where py >nul 2>nul && (py serve.py & goto :end)
echo Python was not found. Install it from https://www.python.org/ and try again.
pause
:end
