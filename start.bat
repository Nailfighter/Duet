@echo off
setlocal EnableDelayedExpansion

:: Enable ANSI colors by generating the ESC character
for /F "delims=#" %%E in ('"prompt #$E# & for %%E in (1) do rem"') do set "ESC=%%E"
set "GREEN=%ESC%[32m"
set "BLUE=%ESC%[34m"
set "YELLOW=%ESC%[33m"
set "RED=%ESC%[31m"
set "NC=%ESC%[0m"

echo %BLUE%=================================================================%NC%
echo %BLUE%   AudioBook Companion - Startup Script (Windows BAT)%NC%
echo %BLUE%=================================================================%NC%
echo.

set "SCRIPT_DIR=%~dp0"
set "PYTHON_DIR=%SCRIPT_DIR%agent-starter-python"
set "REACT_DIR=%SCRIPT_DIR%agent-starter-react"

:: Check directories
if not exist "%PYTHON_DIR%" (
    echo %RED%[Error] Python directory not found at %PYTHON_DIR%%NC%
    exit /b 1
)

if not exist "%REACT_DIR%" (
    echo %RED%[Error] React directory not found at %REACT_DIR%%NC%
    exit /b 1
)

:: Check .env.local
if not exist "%PYTHON_DIR%\.env.local" (
    echo %YELLOW%[Warning] .env.local not found in agent-starter-python%NC%
    echo %YELLOW%   Please create .env.local with your LiveKit credentials%NC%
    echo.
)

:: Start Python agent
echo %BLUE%Starting Python agent...%NC%
if not exist "%PYTHON_DIR%\.venv" (
    echo %RED%[Error] Python virtual environment not found in %PYTHON_DIR%\.venv%NC%
    echo %YELLOW%   Please set up the virtual environment first using uv%NC%
    exit /b 1
)

:: Python execution
set "PYTHON_EXE=%PYTHON_DIR%\.venv\Scripts\python.exe"
set "PYTHON_LOG=%TEMP%\audiobook-agent.log"
echo %YELLOW%[Python] Logging to %PYTHON_LOG%%NC%

:: Start python process in background/separate window
cd /d "%PYTHON_DIR%"
start "AudioBook Python Agent" /MIN cmd /c " "%PYTHON_EXE%" src\agent.py dev > "%PYTHON_LOG%" 2>&1 "
timeout /t 3 /nobreak >nul

echo %GREEN%Python agent started.%NC%
echo.

:: Start React frontend
echo %BLUE%Starting React frontend...%NC%
cd /d "%REACT_DIR%"

if not exist "node_modules" (
    echo %YELLOW%[Warning] node_modules not found, installing dependencies...%NC%
    call npm install
)

set "REACT_LOG=%TEMP%\audiobook-frontend.log"
echo %YELLOW%[React] Logging to %REACT_LOG%%NC%

:: Start react process in background/separate window
start "AudioBook React Frontend" /MIN cmd /c " npm run dev > "%REACT_LOG%" 2>&1 "
timeout /t 5 /nobreak >nul

echo %GREEN%React frontend started.%NC%
echo.

echo %GREEN%=================================================================%NC%
echo %GREEN%             All Services Running!%NC%
echo %GREEN%=================================================================%NC%
echo.
echo %BLUE%Frontend:%NC%  http://localhost:3000
echo %BLUE%Backend:%NC%   Running in dev mode
echo.
echo %YELLOW%Quick Commands:%NC%
echo    View agent logs:     type "%PYTHON_LOG%"
echo    View frontend logs:  type "%REACT_LOG%"
echo.
echo Close the newly opened minimized command prompt windows to stop the services.
echo Press any key to exit this launcher...
pause >nul
