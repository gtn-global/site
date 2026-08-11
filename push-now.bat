@echo off
cd /d "%~dp0"
git push gtn-global master > push-result.txt 2>&1
echo EXIT=%ERRORLEVEL% >> push-result.txt
