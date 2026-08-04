@echo off
rem AI Passport - stop whatever is listening on the dev ports (5001 backend, 5173 frontend)
setlocal
set FOUND=

for %%P in (5001 5173) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /c:"LISTENING" ^| findstr /c:":%%P "') do (
    rem a PID can listen on both IPv4 and IPv6 - only report/kill it once
    if not defined SEEN_%%A (
      set SEEN_%%A=1
      set FOUND=1
      echo Stopping port %%P  ^(PID %%A^)
      taskkill /PID %%A /F >nul 2>&1
    )
  )
)

rem close the launcher windows start.bat opened, if they are still around
taskkill /FI "WINDOWTITLE eq AI Passport - backend*" /F /T >nul 2>&1
taskkill /FI "WINDOWTITLE eq AI Passport - frontend*" /F /T >nul 2>&1

if not defined FOUND echo Nothing running on ports 5001 or 5173.
echo.
rem short pause so the window is readable when double-clicked
ping -n 3 127.0.0.1 >nul
