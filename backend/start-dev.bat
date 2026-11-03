@echo off
REM Development start script for M-Pesa backend (Windows)

echo.
echo =======================================================
echo   Starting VYRO POS M-Pesa Backend (Development Mode)
echo =======================================================
echo.

REM Check if .env exists
if not exist .env (
    echo WARNING: .env file not found!
    echo Creating .env from .env.example...
    copy .env.example .env
    echo.
    echo .env file created. Please edit it with your credentials:
    echo    - SUPABASE_URL
    echo    - SUPABASE_SERVICE_ROLE_KEY
    echo.
    echo Then run this script again.
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting server...
echo.
call npm run dev
