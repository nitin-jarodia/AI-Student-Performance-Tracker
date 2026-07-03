@echo off
REM ============================================================
REM AI Student Tracker - start both backend + frontend (Windows)
REM Opens two windows: backend (uvicorn 8000), frontend (vite 5173).
REM ============================================================
setlocal
pushd "%~dp0"

if not exist "backend\venv\Scripts\python.exe" (
    echo [ERROR] Backend venv not found. Run setup.bat first.
    popd
    exit /b 1
)

echo Launching backend on http://127.0.0.1:8000 ...
start "AIST Backend" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate.bat && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

REM Give uvicorn a moment to boot before we open the browser-facing tab.
timeout /t 3 /nobreak >nul

echo Launching frontend on http://localhost:5173 ...
start "AIST Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Backend:  http://127.0.0.1:8000   (docs: /docs)
echo Frontend: http://localhost:5173
echo.
echo Close the two spawned windows to stop the servers (or run stop.bat).
popd
endlocal
exit /b 0
