# Lattice Project Deep-Dive (`README2`)

This document explains the **current codebase behavior** in practical terms so another engineer (or chatbot) can understand and reason about the project quickly.

---

## 1) What this project is

Lattice is an AI interview platform composed of multiple services:

- **Frontend (Next.js)** for auth/UI/interview controls
- **ConvFlow service (FastAPI)** for LiveKit token + interview conversation engine
- **Vision service (FastAPI + WS)** for video/audio chunk analysis (gaze/facial/voice)
- **Redis + Celery backend** for chunk/task orchestration metadata
- **LiveKit** for real-time room/media transport
- **Supabase** for auth + profile/resume storage

---

## 2) Service architecture (high-level)

```text
Browser (Next.js frontend)
  ├─ Supabase Auth (login/signup/session)
  ├─ ConvFlow API (:8001)
  │    ├─ /token (LiveKit token + room bootstrap)
  │    └─ /api/parse-resume (PDF parse + profile upsert)
  ├─ Vision API/WS (:8000)
  │    ├─ /upload_chunk (store media chunk)
  │    └─ /ws (process chunk + stream analytics)
  └─ LiveKit server (:7880)

Supporting services:
- Redis (:6379)
- Celery backend worker (metadata queueing)
- Supabase (external)
```

---

## 3) Major folders and responsibilities

## Root
- `README.md`: original project overview
- `docker-compose.yml`: spins up LiveKit + Redis only
- `livekit.yaml`: LiveKit server config
- `start-system.ps1`, `check-livekit.ps1`: local helper scripts
- `.env.example`: environment variable template

## `frontend/` (Next.js 16 App Router)
Key files:
- `middleware.ts`: auth/session guard logic
- `src/app/page.tsx`: root redirect based on server session
- `src/app/auth/login/page.tsx`: login UI + auth + soft session cookie
- `src/app/auth/signup/page.tsx`: signup flow + profile insert
- `src/app/front/homepage/page.tsx`: landing/home for authenticated user
- `src/app/front/interview/page.tsx`: interview entry page
- `src/app/component/InterviewRoom.tsx`: main interview runtime UI
- `src/app/component/ResumeUploadModal.tsx`: resume upload + parser call
- `src/app/hooks/useConvFlowRoom.ts`: connects to ConvFlow + LiveKit agent room
- `src/app/hooks/useVisionSession.ts`: WS session with Vision server
- `src/app/hooks/useChunkedRecorder.ts`: records and uploads media chunks
- `src/utils/supabase.ts`: browser Supabase client
- `src/utils/supabase-server.ts`: server Supabase client

## `convFlow/` (FastAPI conversation engine)
Key files:
- `main.py`: API entrypoint (`/token`, `/api/parse-resume`) + LiveKit agent loop
- `interview/engine.py`: interview context builder + node orchestration
- `interview/nodes/node_a_evaluate.py`: answer quality/behavior evaluation
- `interview/nodes/node_b_decide.py`: phase/intent/topic decision
- `interview/nodes/node_c_generate.py`: question generation (streaming)
- `interview/nodes/rolling_summarizer.py`: summary compression
- `llm/streaming_llm.py`, `llm/streaming_voice_agent.py`: LLM and voice generation glue
- `stt/*`, `turn_taking/*`: speech-to-text and turn detection stack

## `Vision/` (FastAPI + WS analysis)
Key files:
- `vision_server.py`: chunk upload + websocket processing loop
- `vision.py`: analyzers integration
- `realtime_inference.py`: model inference wiring

## `backend/` (Celery + Redis metadata)
- `worker.py`: Celery app bootstrap
- `tasks.py`: chunk/session task logic in Redis
- `redis_client.py`: Redis helpers

## `inference-service/`
- `main.py`: resume parse endpoint and model helper logic (overlaps ConvFlow parser role)

## `livekit-worker/`
- `agent.py`, `buffer.py`: passive LiveKit room/video chunk worker logic

---

## 4) Current auth/session behavior

### Login/signup
- Login page authenticates via Supabase password auth.
- Signup creates auth user and profile row.

### Route protection
Implemented in `frontend/middleware.ts`:
- Unauthenticated user trying `/front/*` → redirected to `/auth/login`
- Authenticated user visiting `/auth/*` → redirected to `/front/homepage`

### Soft session timeout (dev-friendly)
- On successful login, frontend sets `app_session_expires_at` cookie.
- Middleware checks this cookie:
  - Missing/invalid/expired + route is `/` or `/front/*` → redirect to `/auth/login`
- This is **app-level timeout**, not full Supabase token invalidation.

---

## 5) Resume flow (current)

### Upload + parse
1. User opens upload modal (`ResumeUploadModal`).
2. Frontend posts PDF to `http://127.0.0.1:8001/api/parse-resume` with:
   - `user_id`, `user_email`, `user_full_name`, `file`
3. Active parser service on `:8001`:
   - extracts PDF text
   - calls Gemini model
   - upserts `profiles` with `resume_text`, `resume_json`, metadata

Note:
- The repo contains parse logic in both `convFlow/main.py` and `inference-service/main.py`.
- In practice, **the service currently bound to `localhost:8001`** handles parsing.
- In your recent runtime logs, this has been `inference-service/main.py`.

### Interview gate (new behavior)
In homepage:
- Frontend checks current user’s `profiles.resume_text/resume_json`.
- If no resume, `Start Interview` opens upload modal instead of navigating.
- After successful upload, state flips to allow interview start.

---

## 6) Interview runtime flow

1. User enters `/front/interview`.
2. `InterviewRoom` starts camera/mic and chunk recording.
3. `useVisionSession` opens WS to Vision server (`ws://localhost:8000/ws`).
4. `useChunkedRecorder` uploads chunks to Vision server.
5. `useConvFlowRoom` fetches token from ConvFlow (`:8001/token`) and connects to LiveKit.
6. ConvFlow agent listens to audio, runs turn-taking + STT + LLM + TTS.
7. ConvFlow sends `turn_end` data message in LiveKit room.
8. Frontend receives `turn_end`, flushes current chunk.
9. Vision processes chunk and sends analytics back over WS.

---

## 7) Resume context injection into ConvFlow (new behavior)

Minimal implementation added (separate from parse-service ownership):

1. Frontend (`useConvFlowRoom.ts`) now requests token as:
   - `/token?user_id=<supabase_user_id>`
2. ConvFlow `main.py` token endpoint accepts optional `user_id`.
3. It fetches `profiles.resume_text/resume_json` from Supabase.
4. It builds a compact `resume_context` string.
5. `InterviewEngine` now accepts `resume_context` and appends it in generated context prompt.

Fallback:
- If user_id missing or profile not found, resume context is empty and interview still works.

---

## 8) Important environment variables

### Frontend (`frontend/.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### ConvFlow / inference python service
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `GEMINI_API_KEY`

### Vision
- model/checkpoint paths as required by `vision_server.py`
- ffmpeg availability on PATH

### Infra
- LiveKit API key/secret + URL
- Redis URL(s) for Celery/backend

---

## 9) Ports and endpoints

- Frontend: `http://localhost:3000`
- Vision service: `http://localhost:8000`
  - WS: `ws://localhost:8000/ws`
- ConvFlow: `http://localhost:8001`
  - `GET /token`
  - `POST /api/parse-resume`
- LiveKit: `ws://localhost:7880`
- Redis: `localhost:6379`

---

## 10) Known caveats / gotchas

- There are multiple services with overlap around resume parse (`convFlow/main.py` and `inference-service/main.py`).
- Local scripts may contain hardcoded paths in some setups; verify on your machine.
- Frontend route consistency must remain `/front/homepage` and `/front/interview` in UI buttons.
- Soft session timeout cookie is intentionally app-level and can desync from true Supabase token lifetime.
- If Next.js starts from wrong root (workspace lockfile warning), run from `frontend/` explicitly.

---

## 11) Minimal startup (local dev)

1. Start infra (LiveKit + Redis)
2. Start Vision service (`:8000`)
3. Start ConvFlow service (`:8001`)
4. Start frontend (`frontend/npm run dev`)
5. Login/signup, upload resume, start interview

---

## 12) Recent additions summary (for handoff)

- Added Supabase server-side session checks with middleware.
- Added dev soft session timeout cookie handling.
- Added homepage interview gating when resume is missing.
- Added resume-context injection into ConvFlow LLM context path via `/token?user_id=...`.

---

If you hand this file to another chatbot/engineer, they should be able to:
- understand architecture,
- locate auth/resume/interview logic,
- trace runtime data flow,
- and modify the right components safely.
