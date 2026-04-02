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

Write-Host "[1/5] Starting Docker infrastructure..." -ForegroundColor Cyan
Set-Location "C:/Users/gaura/PRJ"
docker compose up -d

docker compose ps

Write-Host "[2/5] Starting inference service (port 8001)..." -ForegroundColor Cyan
if (Test-PortInUse -Port 8001) {
    Write-Host "Inference service already running on port 8001. Skipping launch." -ForegroundColor Yellow
} else {
    Start-ServiceWindow `
        -Title "Inference Service" `
        -WorkingDirectory "C:/Users/gaura/PRJ/inference-service" `
        -Command "conda run --no-capture-output -n $CondaEnv uvicorn main:app --host 0.0.0.0 --port 8001"
}

Start-Sleep -Seconds 2

Write-Host "[3/5] Starting Celery worker..." -ForegroundColor Cyan
Start-ServiceWindow `
    -Title "Celery Worker" `
    -WorkingDirectory "C:/Users/gaura/PRJ" `
    -Command "conda run --no-capture-output -n $CondaEnv celery -A backend.worker.celery_app worker -l info --queues 'control,chunk-control,chunk-inference,chunk-results'"

Start-Sleep -Seconds 2

Write-Host "[4/5] Starting vision server..." -ForegroundColor Cyan
Start-ServiceWindow `
    -Title "Vision Server" `
    -WorkingDirectory "C:/Users/gaura/PRJ" `
    -Command "conda run --no-capture-output -n $CondaEnv python Vision/vision_server.py"

Start-Sleep -Seconds 2

Write-Host "[5/5] Starting frontend dev server..." -ForegroundColor Cyan
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
Write-Host "Open: http://localhost:3000/interview" -ForegroundColor Green
Write-Host ""
Write-Host "If you need LiveKit token generation:" -ForegroundColor Yellow
$tokenCommand = @'
python -c "from livekit import api; t=api.AccessToken('devkey','APISECRETdevkey1234567890ABCDEFG').with_identity('candidate-1').with_name('Candidate').with_grants(api.VideoGrants(room='interview-room', room_join=True, can_publish=True, can_subscribe=True)); print(t.to_jwt())"
'@
Write-Host $tokenCommand
