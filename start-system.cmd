@echo off
setlocal EnableDelayedExpansion

set "CONDA_ENV=pupil310"
set "PRJ_DIR=C:\Users\krish\OneDrive\Desktop\PRJ3\Lattice"

echo [0/5] Locating Anaconda installation...
:: This asks Conda exactly where it lives on your machine
FOR /F "tokens=*" %%i IN ('conda info --base') DO set CONDA_BASE=%%i
set "ACTIVATE_BAT=%CONDA_BASE%\Scripts\activate.bat"

if not exist "%ACTIVATE_BAT%" (
    echo [ERROR] Could not find Conda activate script. Make sure you run this from an Anaconda Prompt!
    pause
    exit /b 1
)

echo [1/5] Starting Docker infrastructure...
cd /d "%PRJ_DIR%"
docker compose up -d

timeout /t 2 /nobreak >nul

echo [2/5] Starting inference service (port 8001)...
:: Notice the 'call "%ACTIVATE_BAT%"' - This forces the new window to become an Anaconda terminal!
start "Inference Service" cmd /k "call "%ACTIVATE_BAT%" %CONDA_ENV% && cd /d "%PRJ_DIR%\inference-service" && python -m uvicorn main:app --host 0.0.0.0 --port 8001"

timeout /t 2 /nobreak >nul

echo [3/5] Starting Celery worker...
start "Celery Worker" cmd /k "call "%ACTIVATE_BAT%" %CONDA_ENV% && cd /d "%PRJ_DIR%" && celery -A backend.worker.celery_app worker -l info --queues control,chunk-control,chunk-inference,chunk-results"

timeout /t 2 /nobreak >nul

echo [4/5] Starting vision server...
start "Vision Server" cmd /k "call "%ACTIVATE_BAT%" %CONDA_ENV% && cd /d "%PRJ_DIR%" && python Vision/vision_server.py"

timeout /t 2 /nobreak >nul

echo [5/5] Starting frontend dev server...
start "Frontend" cmd /k "cd /d "%PRJ_DIR%\frontend" && npm run dev"

echo =======================================================
echo System launched! Check the 4 windows for logs.
echo Open: http://localhost:3000/interview
echo =======================================================
pause