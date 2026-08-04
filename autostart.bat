@echo off
rem AI Passport - background launcher for Windows startup.
rem
rem Same servers as start.bat, but minimised and without opening a browser, so
rem it is unobtrusive when Windows runs it at login. Safe to run twice: a port
rem that is already listening is left alone rather than started again.
rem
rem To run at login: press Win+R, type  shell:startup  , and put a SHORTCUT to
rem this file in the folder that opens.
cd /d "%~dp0"

rem first run only - install dependencies
if not exist "backend\node_modules" (
  pushd backend
  call npm install
  popd
)
if not exist "frontend\node_modules" (
  pushd frontend
  call npm install
  popd
)

call :start_if_free 5001 backend  "AI Passport - backend"
call :start_if_free 5173 frontend "AI Passport - frontend"
exit /b

:start_if_free
rem %1 = port, %2 = folder, %3 = window title
netstat -ano | findstr /c:"LISTENING" | findstr /c:":%1 " >nul 2>&1
if not errorlevel 1 (
  echo Port %1 already in use - leaving it alone.
  exit /b
)
echo Starting %2 on port %1
start "%~3" /min /d "%~dp0%2" cmd /k npm run dev
exit /b
