# Lattice: AI-Powered Interview System

Lattice is a sophisticated, real-time AI interview preparation system featuring dynamic live questioning, real-time computer vision analysis (gaze, focus), voice evaluation (WPM, pacing), and comprehensive PDF performance dossiers.

## Prerequisites
Before you begin, ensure you have the following installed on your system:
- **Python 3.10** (via Miniconda or Anaconda)
- **Node.js** (v18+ recommended)
- **PostgreSQL** (v14+)
- **Cloudflared** CLI (for exposing local ports)
- **FFmpeg** (added to system PATH for video transcoding)

---

## 1. Local Database Setup (PostgreSQL)

Lattice utilizes a hybrid architecture: Supabase is used for Authentication, but **all profiles, resumes, and interview session data are stored on a local PostgreSQL database.**

1. Install and start your PostgreSQL server on port `4321`.
2. Create a database named `lattice`:
   ```sql
   CREATE DATABASE lattice;
   ```
3. Ensure your local Postgres credentials match the backend `.env`:
   - Host: `localhost` (or `127.0.0.1`)
   - Port: `4321`
   - User: `postgres`
   - Password: `your_password_here`

The SQLAlchemy ORM will automatically create the required tables (`profiles`, `interview_sessions`) on startup.

---

## 2. Environment Configuration

### Backend Environment (`/convFlow/.env` and `/.env`)
Ensure your backend environment contains the necessary keys:
```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:4321/lattice

# AI Models (via OmniKey Proxy)
GEMINI_API_KEY=omnikey-g-...

# Supabase Auth Secrets
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# LiveKit
LIVEKIT_URL=http://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

### Frontend Environment (`/frontend/.env.local`)
```env
NEXT_PUBLIC_CONVFLOW_URL=http://localhost:8000
NEXT_PUBLIC_VISION_URL=http://localhost:8001
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## 3. Cloudflare Tunnel Setup

Lattice utilizes `cloudflared` to route LiveKit and webhook traffic securely from the web to your local machine.

1. Ensure `cloudflared.exe` is installed and logged in (`cloudflared tunnel login`).
2. The permanent tunnel (`vision.univeons.online` / `convflow.univeons.online`) is defined in `config.yml` in the project root.
3. You do not need to run this manually; the `cloud.ps1` script handles it!

---

## 4. Booting the System

### Step A: Start the Backend & Tunnels
A convenient PowerShell script is provided to spin up all necessary backend microservices, the LiveKit server, and the Cloudflare tunnels simultaneously.

1. Open a PowerShell terminal in the project root.
2. Ensure your Conda environment is active:
   ```powershell
   conda activate pupil310
   ```
3. Run the master startup script:
   ```powershell
   .\cloud.ps1
   ```
*This will launch `vision_server.py` (port 8001), `convFlow/main.py` (port 8000), LiveKit (port 7880), and the Cloudflare tunnel daemon.*

### Step B: Start the Frontend
1. Open a separate terminal and navigate to the `frontend` directory.
2. Install dependencies (if you haven't already):
   ```bash
   npm install
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```

### Step C: Access the App
Open your browser and navigate to `http://localhost:3000`. You can log in via Supabase, upload a resume, and begin your AI Interview!

---

## Troubleshooting

- **Gaze/Camera Activity N/A:** Ensure your webcam is unblocked and `ffmpeg` is correctly added to your system's PATH.
- **Database Connection Refused:** Verify PostgreSQL is running on port `4321` and that your password in `DATABASE_URL` is correct.
- **WebSocket Disconnects:** Ensure the Cloudflare tunnel in `cloud.ps1` successfully initialized and bound to the required hostnames.