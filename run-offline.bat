@echo off
setlocal

REM Always run from this script location
cd /d "%~dp0"

echo ==========================================
echo   RATU NGEMIL POS - OFFLINE START
echo ==========================================
echo.

REM Prefer local venv in project, fallback to parent venv
if exist ".venv\Scripts\python.exe" (
    set "PY=.venv\Scripts\python.exe"
) else if exist "..\.venv\Scripts\python.exe" (
    set "PY=..\.venv\Scripts\python.exe"
) else (
    set "PY=python"
)

echo Using Python: %PY%
echo.

echo Checking required packages...
%PY% -c "import fastapi, uvicorn, sqlalchemy" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Dependency belum terpasang.
    echo Jalankan ini saat internet tersedia:
    echo   pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo Starting server at http://127.0.0.1:8000
echo Tekan CTRL+C untuk berhenti.
echo.
%PY% -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

echo.
echo Server berhenti.
pause
