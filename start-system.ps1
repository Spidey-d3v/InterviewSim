param(
    [string]$CondaEnv = "pupil310"
)

$ErrorActionPreference = "Stop"

function Start-ServiceWindow {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$Command
    )

    $psCommand = @"
Set-Location '$WorkingDirectory'
`$Host.UI.RawUI.WindowTitle = '$Title'
Write-Host "[$Title] starting..." -ForegroundColor Cyan
$Command
"@

    Start-Process powershell -ArgumentList "-NoExit", "-Command", $psCommand | Out-Null
}

function Test-PortInUse {
    param([int]$Port)
    # Treat the port as in-use only when actively listening.
    $listening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $listening
}

Write-Host "[1/4] Starting Docker infrastructure (LiveKit)..." -ForegroundColor Cyan
Set-Location "C:/Users/gaura/PRJ"
docker compose up -d

docker compose ps

Write-Host "[2/4] Starting Vision Server (port 8000)..." -ForegroundColor Cyan
if (Test-PortInUse -Port 8000) {
    Write-Host "Vision Server already running on port 8000. Skipping launch." -ForegroundColor Yellow
} else {
    Start-ServiceWindow `
        -Title "Vision Server" `
        -WorkingDirectory "C:/Users/gaura/PRJ/Vision" `
        -Command "conda run --no-capture-output -n $CondaEnv uvicorn vision_server:app --host 0.0.0.0 --port 8000"
}

Start-Sleep -Seconds 2

Write-Host "[3/4] Starting convFlow Backend (port 8001)..." -ForegroundColor Cyan
if (Test-PortInUse -Port 8001) {
    Write-Host "convFlow already running on port 8001. Skipping launch." -ForegroundColor Yellow
} else {
    Start-ServiceWindow `
        -Title "convFlow Backend" `
        -WorkingDirectory "C:/Users/gaura/PRJ/convFlow" `
        -Command "conda run --no-capture-output -n $CondaEnv uvicorn main:app --host 0.0.0.0 --port 8001"
}

Start-Sleep -Seconds 2

Write-Host "[4/4] Starting Frontend Dev Server..." -ForegroundColor Cyan
if (Test-PortInUse -Port 3000) {
    Write-Host "Frontend appears to be running on port 3000. Skipping launch." -ForegroundColor Yellow
} else {
    Start-ServiceWindow `
        -Title "Frontend" `
        -WorkingDirectory "C:/Users/gaura/PRJ/frontend" `
        -Command "npm run dev"
}

Write-Host "" 
Write-Host "All services were launched in separate PowerShell windows." -ForegroundColor Green
Write-Host "Open: http://localhost:3000/front/interview" -ForegroundColor Green
Write-Host ""
