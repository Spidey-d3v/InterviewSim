<#
.SYNOPSIS
  LATTICE Cloud Deployment Launcher
  Starts Vision Server + ConvFlow Backend with LiveKit Cloud configuration.
  No Docker required  LiveKit Cloud replaces the self-hosted container.

.DESCRIPTION
  This script:
  1. Stops any self-hosted LiveKit Docker container (if running)
  2. Starts the Vision Server on port 8000
  3. Starts the ConvFlow Backend on port 8001 (connects to LiveKit Cloud)
  4. Optionally starts the frontend dev server on port 3000
#>

param(
    [string]$CondaEnv = "pupil310",
    [switch]$RunFrontend
)

$ErrorActionPreference = "Stop"
$ProjectRoot = "C:\Users\gaura\PRJ"

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
    $listening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $listening
}

# 
# Step 0: Stop self-hosted LiveKit (if running)
# 
Write-Host ""
Write-Host "" -ForegroundColor Magenta
Write-Host "  LATTICE  Cloud Deployment Launcher" -ForegroundColor Magenta
Write-Host "" -ForegroundColor Magenta
Write-Host ""

Write-Host "[0/3] Stopping self-hosted LiveKit - if running..." -ForegroundColor Yellow
try {
    $livekitContainer = docker ps -q --filter "name=interview-livekit" 2>$null
    if ($livekitContainer) {
        docker stop interview-livekit 2>$null | Out-Null
        Write-Host "  Stopped interview-livekit container." -ForegroundColor Green
    } else {
        Write-Host "  No self-hosted LiveKit container found. Skipping." -ForegroundColor DarkGray
    }

    $redisContainer = docker ps -q --filter "name=interview-redis" 2>$null
    if ($redisContainer) {
        docker stop interview-redis 2>$null | Out-Null
        Write-Host "  Stopped interview-redis container - not needed for cloud mode." -ForegroundColor Green
    }
} catch {
    Write-Host "  Docker is not running. Skipping container cleanup." -ForegroundColor DarkGray
}
# 
# Step 1: Start Vision Server (port 8000)
# 
Write-Host ""
Write-Host "[1/3] Starting Vision Server (port 8000)..." -ForegroundColor Cyan
if (Test-PortInUse -Port 8000) {
    Write-Host "  Vision Server already running on port 8000. Skipping." -ForegroundColor Yellow
} else {
    Start-ServiceWindow `
        -Title "Vision Server - Cloud" `
        -WorkingDirectory "$ProjectRoot\Vision" `
        -Command "conda run --no-capture-output -n $CondaEnv uvicorn vision_server:app --host 0.0.0.0 --port 8000"
}

Start-Sleep -Seconds 2

# 
# Step 2: Start ConvFlow Backend (port 8001)
# 
Write-Host "[2/3] Starting ConvFlow Backend (port 8001  LiveKit Cloud)..." -ForegroundColor Cyan
if (Test-PortInUse -Port 8001) {
    Write-Host "  ConvFlow already running on port 8001. Skipping." -ForegroundColor Yellow
} else {
    Start-ServiceWindow `
        -Title "ConvFlow Backend - Cloud" `
        -WorkingDirectory "$ProjectRoot\convFlow" `
        -Command "conda run --no-capture-output -n $CondaEnv uvicorn main:app --host 0.0.0.0 --port 8001"
}

Start-Sleep -Seconds 2

# 
# Step 3: Start Frontend Dev Server (port 3000)
# 
if ($RunFrontend) {
    Write-Host "[3/3] Starting Frontend Dev Server (port 3000)..." -ForegroundColor Cyan
    if (Test-PortInUse -Port 3000) {
        Write-Host "  Frontend already running on port 3000. Skipping." -ForegroundColor Yellow
    } else {
        Start-ServiceWindow `
            -Title "Frontend - Cloud" `
            -WorkingDirectory "$ProjectRoot\frontend" `
            -Command "npm run dev"
    }
} else {
    Write-Host "[3/3] Skipping frontend (default for cloud mode). Run with --RunFrontend to enable." -ForegroundColor DarkGray
}

# 
# Step 4: Start Cloudflare Tunnels & Extract URLs
# 
Write-Host ""
Write-Host "[4/4] Starting Cloudflare Tunnels..." -ForegroundColor Cyan

$VisionLog = "$ProjectRoot\vision_tunnel.log"
$ConvFlowLog = "$ProjectRoot\convflow_tunnel.log"

if (Test-Path $VisionLog) { Remove-Item $VisionLog -Force -ErrorAction SilentlyContinue }
if (Test-Path $ConvFlowLog) { Remove-Item $ConvFlowLog -Force -ErrorAction SilentlyContinue }

# We use Tee-Object so the user can still see the tunnel logs in the new windows, but we also save to file
Start-ServiceWindow `
    -Title "Cloudflare Tunnel - Lattice Persistent" `
    -WorkingDirectory "$ProjectRoot" `
    -Command ".\cloudflared.exe tunnel --config .\config.yml run bdaad7cb-8ca7-4422-bb9c-d86946477d45"

$VisionUrl = "https://vision.univeons.online"
$ConvFlowUrl = "https://convflow.univeons.online"

# 
# Summary
# 
Write-Host ""
Write-Host "" -ForegroundColor Green
Write-Host "  All services launched successfully!" -ForegroundColor Green
Write-Host "" -ForegroundColor Green
Write-Host ""
Write-Host "  Vision Server:  http://localhost:8000" -ForegroundColor White
Write-Host "  ConvFlow:       http://localhost:8001    LiveKit Cloud" -ForegroundColor White
if ($RunFrontend) {
    Write-Host "  Frontend:       http://localhost:3000" -ForegroundColor White
}
Write-Host ""
Write-Host "  LiveKit:        wss://lattice-p58iv0ef.livekit.cloud (CLOUD)" -ForegroundColor Magenta
Write-Host ""
Write-Host " Copy these into your Netlify Environment Variables:" -ForegroundColor Yellow
Write-Host '?? Copy these into your Netlify Environment Variables:' -ForegroundColor Yellow
if ($ConvFlowUrl) {
    Write-Host '   NEXT_PUBLIC_CONVFLOW_URL = ' -NoNewline; Write-Host $ConvFlowUrl -ForegroundColor Cyan
} else {
    Write-Host '   NEXT_PUBLIC_CONVFLOW_URL = (Failed)' -ForegroundColor Red
}
if ($VisionUrl) {
    Write-Host '   NEXT_PUBLIC_VISION_URL   = ' -NoNewline; Write-Host $VisionUrl -ForegroundColor Cyan
} else {
    Write-Host '   NEXT_PUBLIC_VISION_URL   = (Failed)' -ForegroundColor Red
}
Write-Host ''






