# 🧠 InterviewAR Frontend: How It Works

This document explains the architecture, directory structure, and data flow of the InterviewAR frontend application.

## 📁 Directory Structure

```text
frontend/src/
├── app/                  # Next.js App Router
│   ├── api/              # Backend bridge (LiveKit health & tokens)
│   ├── auth/             # Login & Signup flows (Supabase Auth)
│   ├── front/            # Protected user routes
│   │   ├── homepage/     # Discovery & Resume upload trigger
│   │   ├── interview/    # Main interview page (renders InterviewRoom)
│   │   └── profile/      # User settings & stats
│   ├── component/        # Core UI building blocks
│   │   ├── interview/    # MODULAR: Split logic for the main interview
│   │   ├── Calibration/  # Gaze tracking setup flow
│   │   └── Shared/       # Reusable UI (Modals, Panels)
│   ├── hooks/            # CUSTOM HOOKS: The engine of the app
│   │   ├── useConvFlowRoom.ts      # Unified LiveKit connection (Mic in, TTS out)
│   │   ├── useChunkedRecorder.ts   # Rolling 500ms video capture & event-driven flush
│   │   ├── useVisionSession.ts     # Real-time WebSocket bridge to Vision Server
│   │   └── useGazeTracking.ts      # Legacy real-time frame-by-frame gaze
│   └── utils/            # Shared logic (Supabase client, math, formatting)
```

## 🌊 The Data Pipeline Flow

### 1. The Entrance (Auth & Profile)
The user enters via `auth/login`. **Supabase Auth** handles the session. The `middleware.ts` ensures that only logged-in users can reach the `/front` routes. The `homepage` checks if a resume is parsed; if not, it triggers the `ResumeUploadModal`.

### 2. The Bridge (LiveKit Signaling)
When the interview starts, the `InterviewRoom` initializes the `useConvFlowRoom` hook.
- **Outbound:** Captures the candidate's mic and publishes it to the backend.
- **Inbound:** Receives the AI's **TTS (Text-to-Speech)** audio track and auto-attaches it to the browser's audio context.
- **Signals:** Listens for `turn_end` and `interview_end` data messages.

### 3. The Vision Analysis (Event-Driven)
The system uses an **event-driven chunking** strategy:
- `useChunkedRecorder` records video in 500ms slices into a rolling buffer.
- When `useConvFlowRoom` receives a `turn_end` signal from the AI, it tells the recorder to **flush**.
- The recorder snapshots the buffer, clears it, and POSTs the video file to the **Vision Server (8000)**.
- `useVisionSession` receives the ML scores (Confidence, Gaze, Emotion) via **WebSocket** and pushes them into the live UI state.

### 4. The Grand Finale (Report Generation)
When the AI agent sends `interview_end`:
- All phase-wise scores (Intro, Technical, Behavioral) are collected.
- **AI Advice** bullet points are received from the backend.
- `jsPDF` is used to aggregate the transcripts, questions, and scores into a professional PDF report.

## 🛠️ Key Technologies
- **Framework:** Next.js 15 (React 19)
- **Styling:** Tailwind CSS (Modern, utility-first)
- **Database/Auth:** Supabase
- **Transport:** LiveKit (WebRTC) & WebSockets
- **PDF Export:** jsPDF
- **Animations:** GSAP & Tailwind Animate
