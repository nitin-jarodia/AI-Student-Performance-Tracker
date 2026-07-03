@echo off
REM ============================================================
REM AI Student Tracker - one-shot setup (Windows)
REM  * creates backend venv + installs Python deps
REM  * copies .env.example -> .env if missing
REM  * runs `alembic upgrade head`
REM  * installs frontend npm packages
REM Usage: double-click or run from repo root: setup.bat
REM ============================================================
setlocal enableextensions enabledelayedexpansion
pushd "%~dp0"

echo.
echo === [1/5] Backend venv ===================================================
if not exist "backend\venv\Scripts\python.exe" (
    py -3 -m venv backend\venv || (echo [FAIL] python venv && goto :fail)
) else (
    echo venv already exists, skipping.
)

echo.
echo === [2/5] Python dependencies ===========================================
call backend\venv\Scripts\activate.bat
python -m pip install --upgrade pip >nul
pip install -r backend\requirements.txt || goto :fail

echo.
echo === [3/5] backend\.env ===================================================
if not exist "backend\.env" (
    copy /Y "backend\.env.example" "backend\.env" >nul
    echo Created backend\.env from template. Edit DATABASE_URL and SECRET_KEY before first start.
) else (
    echo backend\.env already present, leaving untouched.
)

echo.
echo === [4/5] Database migrations ===========================================
pushd backend
alembic upgrade head || (
    echo [WARN] alembic upgrade failed - check DATABASE_URL in backend\.env
)
popd

echo.
echo === [5/5] Frontend dependencies =========================================
if not exist "frontend\.env" if exist "frontend\.env.example" copy /Y "frontend\.env.example" "frontend\.env" >nul
pushd frontend
call npm install || goto :fail
popd

echo.
echo ============================================================
echo Setup complete. Run start.bat to launch the app.
echo ============================================================
popd
endlocal
exit /b 0

:fail
echo.
echo [ERROR] Setup failed. See messages above.
popd
endlocal
exit /b 1
