@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title ContractReview - Project Stopper

echo ============================================
echo   ContractReview - Stopping Services...
echo ============================================
echo.

:: Stop backend - Python/uvicorn process
echo [1/2] Stopping Backend Server (Python/Uvicorn)...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8000" ^| find "LISTENING"') do (
    set PID=%%a
    echo       Killing PID: !PID!
    taskkill /F /PID !PID! >nul 2>&1
)

:: Alternative method - kill python processes running main.py
taskkill /F /FI "WINDOWTITLE eq ContractReview - Backend*" /IM python.exe >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq ContractReview - Backend*" /IM cmd.exe >nul 2>&1

echo.
echo [2/2] Stopping Frontend Server (Vite/Node)...

:: Kill node processes running vite
taskkill /F /FI "WINDOWTITLE eq ContractReview - Frontend*" /IM node.exe >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq ContractReview - Frontend*" /IM cmd.exe >nul 2>&1

:: Alternative - kill by port
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    set PID=%%a
    echo       Killing PID: !PID!
    taskkill /F /PID !PID! >nul 2>&1
)

echo.
echo ============================================
echo   All Services Stopped
echo ============================================
echo.

timeout /t 2 /nobreak >nul
