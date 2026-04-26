@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "%~dp0update-site.ps1" (
    echo Cannot find update-site.ps1
    echo Please put run-update.bat and update-site.ps1 in the same folder.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-site.ps1"

pause