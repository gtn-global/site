@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8000

echo.
echo  海鑫汇 Gateway To New - 本地预览
echo  ---------------------------------
echo  地址: http://localhost:%PORT%/index.html
echo  关闭本窗口即可停止服务。
echo.

rem 2 秒后自动打开浏览器（此时服务已起来）
start "" cmd /c "timeout /t 2 >nul & start "" "http://localhost:%PORT%/index.html""

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT%
  goto :eof
)

py -m http.server %PORT%
if %errorlevel%==0 goto :eof

echo.
echo  未找到 Python。请安装 Python，或在 PowerShell 里执行：
echo    npx --yes serve -l %PORT%
echo.
pause
