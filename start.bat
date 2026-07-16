@echo off
title Sharpline Dev

echo Starting backend (FastAPI)...
start "Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak > nul

echo Starting frontend (Vite)...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers are starting...
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo   Network:  http://192.168.0.167:5173
echo.
echo Press any key to close this window (servers keep running in their own windows).
pause > nul
