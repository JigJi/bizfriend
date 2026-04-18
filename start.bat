@echo off
title Bizfriend Dev Server (port 8201)
cd /d "%~dp0"
echo.
echo ========================================
echo  Bizfriend - http://localhost:8201
echo ========================================
echo.
echo Press Ctrl+C to stop the server
echo.
python -m http.server 8201
pause
