# LATTICE — Public Deployment Implementation Plan
> CloudFlare Tunnel + LiveKit Cloud + Vercel Frontend

---

## Pre-Flight Checks

Before starting any phase, verify the following:

- [ ] Outbound port **443** is not blocked on your network (Cloudflare Tunnel)
- [ ] Outbound port **7443** is not blocked (LiveKit Cloud WebRTC signaling)
- [ ] You have a domain name available (free via Cloudflare Registrar, or use `trycloudflare.com` for testing — note: URL changes on every restart with the latter)
- [ ] `uvicorn`, `redis`, and `celery` are all confirmed running locally before starting tunnel setup
- [ ] Vercel project is already deployed and reading API URLs from environment variables

---

## Phase 1 — LiveKit Cloud Setup

### 1.1 Create Account and Project

1. Go to [cloud.livekit.io](https://cloud.livekit.io) and sign up — no credit card required on free tier
2. Create a new project
3. From the project dashboard, copy the following three credentials:

```
LIVEKIT_URL       = wss://your-project.livekit.cloud
LIVEKIT_API_KEY   = your_api_key
LIVEKIT_API_SECRET = your_api_secret
```

### 1.2 Update Backend Environment

In your FastAPI backend `.env` file, replace any existing self-hosted LiveKit values:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
```

No code changes needed — `livekit-server-sdk-python` reads these env vars and the API surface is identical regardless of self-hosted vs cloud.

### 1.3 Remove Self-Hosted LiveKit

If you have LiveKit running as a Docker container or local process, stop and remove it:

```bash
# If Docker
docker stop livekit && docker rm livekit

# If running as a process, just stop it
```

### 1.4 Update Vercel Frontend Env Var

In Vercel dashboard → Project Settings → Environment Variables:

```
NEXT_PUBLIC_LIVEKIT_URL = wss://your-project.livekit.cloud
```

**Free tier ceiling:** 100 concurrent participants, 100 GB/month bandwidth. Sufficient for demos and capstone evaluation.

---

## Phase 2 — Cloudflare Tunnel for FastAPI

### 2.1 Install cloudflared

```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Verify installation
cloudflared --version
```

### 2.2 Authenticate with Cloudflare

```bash
cloudflared tunnel login
# Opens browser — log in with your Cloudflare account
```

### 2.3 Create Named Tunnel

```bash
cloudflared tunnel create lattice-backend
# Note the tunnel ID printed in output — you will need it
```

### 2.4 Create Config File

Create the file at `~/.cloudflared/config.yml`:

```yaml
tunnel: lattice-backend
credentials-file: /home/<your-username>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
```

Replace `<your-username>`, `<tunnel-id>`, and `api.yourdomain.com` with actual values.

### 2.5 Route DNS

```bash
cloudflared tunnel route dns lattice-backend api.yourdomain.com
```

This creates a CNAME record in your Cloudflare DNS automatically. Cloudflare also provisions HTTPS for this subdomain — no certificate management needed.

### 2.6 Run the Tunnel

```bash
cloudflared tunnel run lattice-backend
```

FastAPI is now publicly reachable at `https://api.yourdomain.com`. Cloudflare handles TLS termination — `getUserMedia` (mic/camera) will work in all browsers without any cert warnings.

### 2.7 Enable Auto-Start on Boot

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Verify
sudo systemctl status cloudflared
```

---

## Phase 3 — FastAPI Configuration

### 3.1 Update CORS Origins

Ensure your FastAPI app allows requests from your Vercel domain:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-app.vercel.app",
        "https://yourcustomdomain.com",  # if you have one
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Do not use `allow_origins=["*"]` in production — it bypasses all origin checks.

### 3.2 Confirm Uvicorn is Binding Correctly

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

The tunnel connects to `localhost:8000` internally — Cloudflare handles all external exposure.

---

## Phase 4 — Vercel Environment Variables

In Vercel dashboard → Project Settings → Environment Variables, set:

```
NEXT_PUBLIC_API_URL       = https://api.yourdomain.com
NEXT_PUBLIC_LIVEKIT_URL   = wss://your-project.livekit.cloud
```

Trigger a redeployment after saving. No code changes needed if env vars are already wired into your Next.js config.

---

## Final Architecture

```
User's Browser
  ├── Loads frontend bundle ──────────► Vercel (static hosting)
  ├── WebRTC audio/video ─────────────► LiveKit Cloud SFU
  └── REST / WebSocket API calls ─────► Cloudflare Edge
                                              │
                                              ▼
                                     Your Laptop (FastAPI :8000)
                                       ├── Celery Workers (ML)
                                       ├── Redis (internal)
                                       └── LiveKit SDK (outbound only)
```

**What runs where:**

| Component | Location |
|---|---|
| Next.js Frontend | Vercel |
| WebRTC SFU | LiveKit Cloud |
| FastAPI | Laptop (via Cloudflare Tunnel) |
| Celery + Redis | Laptop (internal, not exposed) |
| Supabase | Cloud (no change) |
| Whisper / Wav2Vec2 / VideoMAE / BiLSTM | Laptop |

---

## Known Operational Constraints

| Risk | Impact | Mitigation |
|---|---|---|
| Laptop goes to sleep | Tunnel dies, all sessions fail | Disable suspend: `sudo systemctl mask sleep.target` |
| University network blocks outbound ports | Tunnel fails silently | Test with `curl https://api.yourdomain.com` from another device before any demo |
| Cloudflare 100MB request limit | Fails for large audio chunk uploads via FastAPI | Keep audio chunks under 5MB; route large media through LiveKit, not FastAPI |
| LiveKit Cloud 100GB/month ceiling | Session failures after limit hit | Monitor usage in LiveKit dashboard; 100GB is ~thousands of interview-minutes |
| Local IP changes (if tunnel restarts) | Config.yml points to localhost, so this is irrelevant | No action needed — tunnel always connects to localhost:8000 |

---

## Quick Validation Checklist (run before any demo)

```bash
# 1. Tunnel is running
sudo systemctl status cloudflared

# 2. FastAPI is up
curl https://api.yourdomain.com/health

# 3. Redis is running
redis-cli ping  # should return PONG

# 4. Celery workers are up
celery -A your_app inspect active

# 5. Test from a device on a different network (mobile hotspot)
# Open your Vercel URL and attempt a session
```