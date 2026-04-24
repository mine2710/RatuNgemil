@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo   RATU NGEMIL POS - LAPTOP MODE
echo ==========================================
echo.

if exist ".venv\Scripts\python.exe" (
    set "PY=.venv\Scripts\python.exe"
) else if exist "..\.venv\Scripts\python.exe" (
    set "PY=..\.venv\Scripts\python.exe"
) else (
    set "PY=python"
)

echo Using Python: %PY%
echo.

%PY% -c "import fastapi, uvicorn, sqlalchemy" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Dependency belum terpasang.
    echo Jalankan saat internet tersedia:
    echo   pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo Menjalankan server lokal laptop di http://127.0.0.1:8000
echo Tekan CTRL+C untuk berhenti.
echo.
%PY% -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

echo.
echo Server berhenti.
pause
