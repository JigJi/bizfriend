@echo off
title FriendTa Dev Server (port 8201)
cd /d "%~dp0"
echo.
echo ========================================
echo  FriendTa - http://localhost:8201
echo ========================================
echo.
echo Press Ctrl+C to stop the server
echo.
python start.py
pause
