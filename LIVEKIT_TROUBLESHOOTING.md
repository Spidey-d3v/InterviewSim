# LiveKit Connection Troubleshooting Guide

## ✅ Full Proof Solution

This guide helps diagnose and fix LiveKit connection issues completely.

---

## 🚀 Quick Start (Automatic Fix)

Run this to automatically check and fix all issues:

```powershell
cd C:\Users\gaura\PRJ
.\check-livekit.ps1 -Fix
```

Then restart your system:

```powershell
.\start-system.ps1
```

---

## 📋 Manual Troubleshooting Steps

### Step 1: Verify Environment Configuration

**Check**: `frontend/.env.local` contains:

```env
# Public — safe to expose to the browser
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880

# Server-side only — never exposed to the browser
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=APISECRETdevkey1234567890ABCDEFG
```

**If missing**, create/update the file:

```powershell
cd C:\Users\gaura\PRJ\frontend
echo @"
# Public — safe to expose to the browser
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880

# Server-side only — never exposed to the browser
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=APISECRETdevkey1234567890ABCDEFG
"@ | Out-File -Encoding UTF8 .env.local
```

---

### Step 2: Start LiveKit Server

**Check** if Docker is running:

```powershell
docker ps
```

**Start LiveKit container**:

```powershell
cd C:\Users\gaura\PRJ
docker-compose up -d interview-livekit
```

**Verify it's running**:

```powershell
docker ps | findstr interview-livekit
```

**Check logs if it fails**:

```powershell
docker logs interview-livekit -f
```

---

### Step 3: Verify LiveKit Server Responds

Test the health endpoint:

```powershell
Invoke-WebRequest -Uri "http://localhost:7880/json/config" -Method Get
```

Should return status `200 OK` with JSON config.

---

### Step 4: Install Frontend Dependencies

```powershell
cd C:\Users\gaura\PRJ\frontend
npm install
npm install livekit-server-sdk  # Important!
```

---

### Step 5: Start Frontend Dev Server

```powershell
cd C:\Users\gaura\PRJ\frontend
npm run dev
```

Should start at `http://localhost:3000`

---

### Step 6: Test LiveKit Connection

1. **Open browser**: `http://localhost:3000/interview`
2. **Look for debug button**: Green button in bottom-right corner labeled "🔧 LiveKit Debug"
3. **Click it** to see:
   - ✅ LiveKit Server status
   - ✅ Token API status
   - ❌ Any errors

---

## 🔍 Common Error Messages & Fixes

### Error: "Failed to connect to LiveKit"

**Cause**: Server not running or wrong URL

**Fix**:
```powershell
# 1. Check if server is running
docker ps | findstr interview-livekit

# 2. If not, start it
docker-compose up -d interview-livekit

# 3. Verify it responds
Invoke-WebRequest -Uri "http://localhost:7880/json/config"

# 4. Check the URL in browser console - should be ws://localhost:7880
```

---

### Error: "LIVEKIT_API_SECRET not configured"

**Cause**: Environment variable missing

**Fix**:
```powershell
# Add to frontend/.env.local
LIVEKIT_API_SECRET=APISECRETdevkey1234567890ABCDEFG

# Then restart frontend
npm run dev
```

---

### Error: "WebSocket connection failed"

**Cause**: Port 7880 not open or firewall blocking

**Fix**:
```powershell
# Check if port 7880 is open
netstat -ano | findstr :7880

# If not, check Docker logs
docker logs interview-livekit

# Restart Docker
docker-compose down
docker-compose up -d interview-livekit
```

---

### Error: "Invalid token"

**Cause**: Token API not returning valid JWT

**Fix**:
```powershell
# Test token API directly
Invoke-WebRequest -Uri "http://localhost:3000/api/livekit-token" | ForEach-Object { $_.Content }

# If error, check:
# 1. LIVEKIT_API_SECRET is set in .env.local
# 2. livekit-server-sdk is installed: npm list livekit-server-sdk
# 3. Restart frontend: npm run dev
```

---

### Error: Port 7880/3000 already in use

**Cause**: Another service using the port

**Fix**:
```powershell
# Find process using port 7880
netstat -ano | findstr :7880

# Kill the process (replace PID with the number from output)
taskkill /PID <PID> /F

# Or change ports:
# Edit docker-compose.yml and .env.local with new ports
```

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│ Frontend (Next.js) - http://localhost:3000          │
├─────────────────────────────────────────────────────┤
│ /api/livekit-token       → Generates JWT tokens     │
│ /api/livekit-health      → Checks LiveKit health    │
│ /interview               → Main interview UI        │
└──────────────┬──────────────────────────────────────┘
               │ WebSocket (ws://)
               ↓
┌─────────────────────────────────────────────────────┐
│ LiveKit Server - ws://localhost:7880                │
├─────────────────────────────────────────────────────┤
│ - Manages video/audio rooms                         │
│ - Running in Docker (interview-livekit)             │
│ - Uses devkey/APISECRETdevkey1234567890ABCDEFG      │
└─────────────────────────────────────────────────────┘
```

---

## 📊 Diagnostic Information

When reporting issues, include output from:

```powershell
# 1. Check environment
Get-Content frontend\.env.local

# 2. Check Docker status
docker ps
docker logs interview-livekit -n 50

# 3. Check ports
netstat -ano | findstr :7880
netstat -ano | findstr :3000

# 4. Check dependencies
cd frontend; npm list livekit-server-sdk livekit-client

# 5. Browser console logs (F12 in browser)
```

---

## ✨ New Features Added

All these features are now automatically included:

1. **Health Check Endpoint** (`/api/livekit-health`)
   - Tests if LiveKit server is running
   - Validates WebSocket connectivity

2. **Debug Panel** (on interview page)
   - Real-time status of LiveKit connection
   - Token API validation
   - One-click retry button

3. **Better Error Messages**
   - Specific error descriptions in UI
   - Hints for fixing common issues
   - Server-side logging for debugging

4. **Automatic Retry Logic**
   - Exponential backoff (2s, 4s, 8s)
   - Up to 3 reconnection attempts
   - User-friendly status updates

5. **Improved Logging**
   - Console logs for debugging
   - Token information (partial)
   - Connection state changes
   - Track publishing events

---

## 🎯 Success Checklist

Before using the interview, verify:

- [ ] `frontend/.env.local` has all required variables
- [ ] Docker is running: `docker ps`
- [ ] LiveKit container is running: `docker ps | findstr interview-livekit`
- [ ] LiveKit responds: `curl http://localhost:7880/json/config`
- [ ] Frontend dependencies installed: `npm list livekit-server-sdk`
- [ ] Frontend dev server running: `http://localhost:3000`
- [ ] Debug panel shows ✅ for both Server and Token API
- [ ] Browser console (F12) shows no errors

---

## 📞 Advanced Debugging

If issues persist, check:

1. **LiveKit Logs**:
   ```powershell
   docker logs interview-livekit -f
   ```

2. **Browser Console** (F12):
   - Look for WebSocket errors
   - Check network tab for API requests
   - Look for "[LiveKit]" console logs

3. **Next.js DevServer Logs**:
   - Terminal where `npm run dev` is running
   - Look for API route errors

4. **Port Conflicts**:
   ```powershell
   # List all open ports
   netstat -ano | findstr LISTENING
   ```

---

## 💡 Pro Tips

1. **Always use the debug panel** - it shows real-time status
2. **Check `frontend/.env.local`** - most issues are config-related
3. **Use `check-livekit.ps1 -Fix`** - automatically fixes common issues
4. **Restart the whole system** if you make env var changes: `.\start-system.ps1`
5. **Check browser console** (F12) for detailed client-side errors

---

For more information, see:
- [LiveKit Documentation](https://docs.livekit.io)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
