@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo   RATU NGEMIL POS - TABLET MODE
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

echo Menjalankan server untuk tablet di jaringan lokal:
echo   http://IP_LAPTOP:8001
echo.
echo Cek IP laptop dengan perintah: ipconfig
echo Tekan CTRL+C untuk berhenti.
echo.
%PY% -m uvicorn backend.main:app --host 0.0.0.0 --port 8001

echo.
echo Server berhenti.
pause
