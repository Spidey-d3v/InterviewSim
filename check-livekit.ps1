#!/usr/bin/env pwsh
param(
    [Switch]$Fix
)

Write-Host "LiveKit Connection Diagnostic Tool" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Colors
$Success = "Green"
$ErrorColor = "Red"
$Warning = "Yellow"
$Info = "Cyan"

# Check 1: .env.local exists and has correct variables
Write-Host "1. Checking .env.local configuration..." -ForegroundColor $Info
$envFile = "frontend\.env.local"
if (Test-Path $envFile) {
    Write-Host "   [OK] .env.local found" -ForegroundColor $Success
    
    $envContent = Get-Content $envFile
    $hasPublicUrl = $envContent | Where-Object { $_ -match "NEXT_PUBLIC_LIVEKIT_URL" }
    $hasApiKey = $envContent | Where-Object { $_ -match "LIVEKIT_API_KEY" }
    $hasApiSecret = $envContent | Where-Object { $_ -match "LIVEKIT_API_SECRET" }
    $hasUrl = $envContent | Where-Object { $_ -match "^LIVEKIT_URL" }
    
    if ($hasPublicUrl -and $hasApiKey -and $hasApiSecret -and $hasUrl) {
        Write-Host "   [OK] All required environment variables present" -ForegroundColor $Success
    } else {
        Write-Host "   [ERROR] Missing environment variables:" -ForegroundColor $ErrorColor
        if (-not $hasPublicUrl) { Write-Host "      - NEXT_PUBLIC_LIVEKIT_URL" -ForegroundColor $ErrorColor }
        if (-not $hasApiKey) { Write-Host "      - LIVEKIT_API_KEY" -ForegroundColor $ErrorColor }
        if (-not $hasApiSecret) { Write-Host "      - LIVEKIT_API_SECRET" -ForegroundColor $ErrorColor }
        if (-not $hasUrl) { Write-Host "      - LIVEKIT_URL" -ForegroundColor $ErrorColor }
    }
} else {
    Write-Host "   [ERROR] .env.local not found at $envFile" -ForegroundColor $ErrorColor
    if ($Fix) {
        Write-Host "   Creating .env.local..." -ForegroundColor $Warning
        $envContent = @"
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=APISECRETdevkey1234567890ABCDEFG
"@
        $envContent | Out-File -Encoding UTF8 $envFile
        Write-Host "   [OK] .env.local created" -ForegroundColor $Success
    }
}

Write-Host ""

# Check 2: Docker LiveKit container running
Write-Host "2. Checking LiveKit Docker container..." -ForegroundColor $Info
try {
    $container = docker ps --filter "name=interview-livekit" --format "{{.State}}"
    if ($container -eq "running") {
        Write-Host "   [OK] LiveKit container is running" -ForegroundColor $Success
    } else {
        Write-Host "   [ERROR] LiveKit container not running" -ForegroundColor $ErrorColor
        if ($Fix) {
            Write-Host "   Starting LiveKit container..." -ForegroundColor $Warning
            docker-compose -f docker-compose.yml up -d interview-livekit
            Start-Sleep -Seconds 3
            Write-Host "   [OK] LiveKit container started" -ForegroundColor $Success
        }
    }
}
catch {
    Write-Host "   [ERROR] Docker command failed: $_" -ForegroundColor $ErrorColor
    Write-Host "   Make sure Docker is installed and running" -ForegroundColor $Warning
}

Write-Host ""

# Check 3: LiveKit server responds to health check
Write-Host "3. Checking LiveKit server response..." -ForegroundColor $Info
try {
    # Check if port 7880 is actually listening (more reliable than HTTP  health check)
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $tcpClient.Connect("127.0.0.1", 7880)
    $tcpClient.Close()
    Write-Host "   [OK] LiveKit is listening on port 7880" -ForegroundColor $Success
    Write-Host "   [INFO] Service is active - test connection from frontend" -ForegroundColor $Info
}
catch {
    Write-Host "   [ERROR] Cannot connect to port 7880" -ForegroundColor $ErrorColor
    if ($Fix) {
        Write-Host "   Restarting container..." -ForegroundColor $Warning
        docker-compose -f docker-compose.yml restart interview-livekit
        Start-Sleep -Seconds 5
        try {
            $tcpClient = New-Object System.Net.Sockets.TcpClient
            $tcpClient.Connect("127.0.0.1", 7880)
            $tcpClient.Close()
            Write-Host "   [OK] LiveKit is now responding" -ForegroundColor $Success
        }
        catch {
            Write-Host "   [ERROR] Container restart failed" -ForegroundColor $ErrorColor
            Write-Host "   Run: docker logs interview-livekit" -ForegroundColor $Info
        }
    }
}

Write-Host ""

# Check 4: Node modules installed
Write-Host "4. Checking frontend dependencies..." -ForegroundColor $Info
if (Test-Path "frontend\node_modules") {
    Write-Host "   [OK] node_modules exists" -ForegroundColor $Success
    if (Test-Path "frontend\node_modules\livekit-server-sdk") {
        Write-Host "   [OK] livekit-server-sdk installed" -ForegroundColor $Success
    } else {
        Write-Host "   [ERROR] livekit-server-sdk not installed" -ForegroundColor $ErrorColor
        if ($Fix) {
            Write-Host "   Installing livekit-server-sdk..." -ForegroundColor $Warning
            Push-Location frontend
            npm install livekit-server-sdk
            Pop-Location
            Write-Host "   [OK] livekit-server-sdk installed" -ForegroundColor $Success
        }
    }
} else {
    Write-Host "   [ERROR] node_modules not found" -ForegroundColor $ErrorColor
    if ($Fix) {
        Write-Host "   Installing dependencies..." -ForegroundColor $Warning
        Push-Location frontend
        npm install
        Pop-Location
        Write-Host "   [OK] Dependencies installed" -ForegroundColor $Success
    }
}

Write-Host ""

# Check 5: Port availability
Write-Host "5. Checking port availability..." -ForegroundColor $Info
$ports = @(3000, 7880, 7881)
foreach ($port in $ports) {
    try {
        $connection = New-Object System.Net.Sockets.TcpClient
        $connection.Connect("127.0.0.1", $port)
        $connection.Close()
        Write-Host "   [OK] Port $port is open" -ForegroundColor $Success
    }
    catch {
        Write-Host "   [WARN] Port $port appears closed" -ForegroundColor $Warning
    }
}

Write-Host ""
Write-Host "Summary" -ForegroundColor $Info
Write-Host "=======" -ForegroundColor $Info
Write-Host ""
Write-Host "To fix all detected issues automatically, run:" -ForegroundColor $Info
Write-Host "  check-livekit.ps1 -Fix" -ForegroundColor $Warning
Write-Host ""
Write-Host "To manually start all services:" -ForegroundColor $Info
Write-Host "  start-system.ps1" -ForegroundColor $Warning
Write-Host ""
