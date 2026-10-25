@echo off
setlocal enabledelayedexpansion
title OpenClaw AI Coding Agent IDE

if exist "C:\Program Files\nodejs" set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

echo =======================================================
echo          OpenClaw AI Coding Agent IDE
echo =======================================================

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js was not found in PATH or at C:\Program Files\nodejs.
    echo Please install Node.js 22.12+ (https://nodejs.org/) and try again.
    pause
    exit /b 1
)

:: Check if manual setup requested or dependencies missing
set "DO_SETUP=0"
if /i "%~1"=="--setup" set "DO_SETUP=1"
if /i "%~1"=="setup" set "DO_SETUP=1"
if not exist "%~dp0node_modules" set "DO_SETUP=1"
if not exist "%~dp0server\node_modules" set "DO_SETUP=1"

if "%DO_SETUP%"=="1" (
    echo.
    echo [INFO] First-time setup or dependency installation detected...
    echo.
    echo [1/3] Installing Frontend Dependencies (React 19 / Monaco / Vite)...
    call npm.cmd install
    if errorlevel 1 (
        echo [ERROR] Frontend npm install failed.
        pause
        exit /b %errorlevel%
    )

    echo.
    echo [2/3] Installing Backend Dependencies (Express / Axios)...
    cd /d "%~dp0server"
    call npm.cmd install
    cd /d "%~dp0"
    if errorlevel 1 (
        echo [ERROR] Backend npm install failed.
        pause
        exit /b %errorlevel%
    )

    echo.
    echo [3/3] Verifying Python Environment...
    if exist "%~dp0.venv-ide\Scripts\python.exe" (
        echo [OK] Python environment verified (.venv-ide).
    ) else if exist "%~dp0packages\python-engine\.venv\Scripts\python.exe" (
        echo [OK] Python environment verified (packages\python-engine\.venv).
    ) else if exist "%~dp0python_engine\.venv\Scripts\python.exe" (
        echo [OK] Python environment verified (python_engine\.venv).
    ) else (
        echo [NOTICE] Setting up Python IDE environment...
        where python >nul 2>&1
        if !ERRORLEVEL! equ 0 (
            node "scripts\setup_python.mjs" "python"
        ) else if exist "%LocalAppData%\Programs\Python\Python312\python.exe" (
            node "scripts\setup_python.mjs" "%LocalAppData%\Programs\Python\Python312\python.exe"
        ) else (
            echo [WARNING] Python not found. Python-based validation tools may be limited.
        )
    )
    echo.
    echo [SUCCESS] Setup completed successfully!
    echo =======================================================
)

:: Launch the IDE
echo.
echo Launching OpenClaw IDE servers...
start "OpenClaw IDE" cmd /k "cd /d ""%~dp0"" && npm.cmd run dev"

:: Wait for servers to spin up and open default browser
timeout /t 4 /nobreak >nul
start "" "http://localhost:5174"

echo.
echo OpenClaw IDE is running:
echo   - Frontend UI: http://localhost:5174
echo   - Backend API: http://localhost:3001
echo.
