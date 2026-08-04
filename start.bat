@echo off
rem AI Passport - one-click dev launcher (Team Soda)
rem Double-click this file to start backend + frontend and open the app.
cd /d "%~dp0"

if not exist "backend\node_modules" (
  echo Installing backend dependencies ^(first run only^)...
  pushd backend
  call npm install
  popd
)

if not exist "frontend\node_modules" (
  echo Installing frontend dependencies ^(first run only^)...
  pushd frontend
  call npm install
  popd
)

rem A port that is already serving is left alone - otherwise the backend would
rem die on EADDRINUSE and Vite would silently move to 5173+1, which breaks the
rem dashboard links the extension builds from config.js dashboardBase.
call :start_if_free 5001 backend  "AI Passport - backend"
call :start_if_free 5173 frontend "AI Passport - frontend"

rem give Vite a moment to bind the port, then open the browser
ping -n 6 127.0.0.1 >nul
start "" http://localhost:5173

echo.
echo Both servers run in their own windows. Close those windows to stop them.
exit /b

:start_if_free
rem %1 = port, %2 = folder, %3 = window title
netstat -ano | findstr /c:"LISTENING" | findstr /c:":%1 " >nul 2>&1
if not errorlevel 1 (
  echo Port %1 already running - reusing it.
  exit /b
)
echo Starting %2  http://localhost:%1
start "%~3" /d "%~dp0%2" cmd /k npm run dev
exit /b
