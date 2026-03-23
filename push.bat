@echo off
cd /d "%~dp0"
git add .
set /p msg="Commit message (or press Enter for 'Update'): "
if "%msg%"=="" set msg=Update
git commit -m "%msg%"
git push
echo.
echo Done! Cloudflare will deploy in ~30 seconds.
pause
