@echo off
REM ============================================================
REM AI Student Tracker - stop backend + frontend processes
REM Kills any uvicorn (python) listening on 8000 and the vite
REM dev server (node) listening on 5173.
REM ============================================================
setlocal

echo Stopping backend on :8000 ...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%P >nul 2>&1
)

echo Stopping frontend on :5173 ...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%P >nul 2>&1
)

REM Belt & braces: kill any leftover named windows we opened.
taskkill /FI "WINDOWTITLE eq AIST Backend*"  /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq AIST Frontend*" /F >nul 2>&1

echo Done.
endlocal
exit /b 0
