@echo off
chcp 65001 >nul
title ContractReview - Project Starter

echo ============================================
echo   ContractReview Project Starter
echo ============================================
echo.

:: Get script directory
set SCRIPT_DIR=%~dp0
set BACKEND_DIR=%SCRIPT_DIR%backend
set FRONTEND_DIR=%SCRIPT_DIR%frontend

:: Conda path
set CONDA_ROOT=D:\sorfware_install\python3.8_install
set CONDA_ENV=%CONDA_ROOT%\envs\contractreview

echo [1/3] Starting Backend Server...
echo       - Conda Env: %CONDA_ENV%
echo       - Port: 8000
echo.

:: Start backend in a new window
start "ContractReview - Backend (Port 8000)" cmd /k "cd /d G:\ComtractReview\backend && D:\sorfware_install\python3.8_install\envs\contractreview\python.exe main.py"

timeout /t 3 /nobreak >nul

echo [2/3] Starting Frontend Server...
echo       - Port: 3000
echo.

:: Start frontend in a new window
start "ContractReview - Frontend (Port 3000)" cmd /k "cd /d %FRONTEND_DIR% && node node_modules/vite/bin/vite.js --port 3000"

echo.
echo ============================================
echo   Project Started!
echo ============================================
echo.
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3000
echo.
echo   To stop the project, run: stop.bat
echo.
echo ============================================
