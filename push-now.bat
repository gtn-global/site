@echo off
cd /d "%~dp0"
git push gtn-global master
echo.
echo Push done. Press any key to close.
pause >nul
