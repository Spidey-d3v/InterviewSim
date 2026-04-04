# InterviewAR Project Overview

InterviewAR is a multi-service AI-powered interview intelligence platform. It provides real-time and asynchronous analysis of interview sessions, focusing on visual cues (gaze, facial expressions), vocal performance (speaking skills), and candidate background (resume parsing).

## Overall Objective
The goal of the project is to provide a comprehensive, automated evaluation of a candidate's performance during a video interview. It combines real-time WebRTC media streaming with chunk-based ML inference to give immediate feedback and detailed post-session reports.

---

## System Architecture

The project follows a distributed microservices architecture:

1.  **Frontend (Next.js)**: The user interface for both candidates and interviewers. It handles media capture, real-time gaze tracking (via WebSockets), and chunked video recording.
2.  **Vision Server (FastAPI)**: The "brain" of the visual and vocal analysis. It hosts multiple ML models and processes video chunks.
3.  **Inference Service (FastAPI)**: Specialized service for LLM-based tasks like resume parsing and potentially larger-scale model orchestration.
4.  **Backend (Celery/Redis)**: An asynchronous task queue system for handling long-running analysis jobs that don't need to be real-time.
5.  **LiveKit Server**: A WebRTC media server that handles high-performance audio/video signaling and transport.
6.  **LiveKit Worker**: A specialized agent that can join LiveKit rooms to process media streams directly.

---

## Detailed Component Functionality

### 1. Frontend (`/frontend`)
*   **Tech Stack**: Next.js, React, TypeScript, LiveKit Client SDK.
*   **Core Logic**:
    *   `src/app/interview/page.tsx`: The main interview interface.
    *   `hooks/useChunkedRecorder.ts`: Captures 15-second video chunks from the webcam and uploads them to the Vision Server.
    *   `hooks/useVisionSession.ts`: Manages a WebSocket connection to the Vision Server for real-time gaze and chunk results.
    *   `component/CalibrationFlow.tsx`: Guides the user through a 5-point calibration process for accurate gaze tracking.
*   **Importance**: Orchestrates the entire user experience and coordinates data flow between the user's browser and the various backend services.

### 2. Vision Server (`/Vision`)
*   **Port**: `8000` (WebSocket: `ws://localhost:8000/ws`)
*   **Tech Stack**: FastAPI, PyTorch, MediaPipe, OpenCV, Transformers (VideoMAE).
*   **Models Included**:
    *   **Gaze Tracking**: Uses MediaPipe FaceMesh to track iris movement and head pose.
    *   **Voice Analyzer**: Uses a Wav2Vec2-based model (`VoiceWav2VecModel`) to score speaking skills (energy, pitch, fluency).
    *   **VideoMAE Confidence**: Analyzes video chunks to predict a "confidence" score based on the candidate's visual presence.
    *   **Facial Expressions**: Scores facial expressions (e.g., smiling, neutral) using a specialized ranking model.
*   **Importance**: Performs the heavy lifting of ML inference on video and audio data.

### 3. Inference Service (`/inference-service`)
*   **Port**: `8001`
*   **Tech Stack**: FastAPI, PyMuPDF (fitz), Gemini API.
*   **Core Logic**:
    *   `/api/parse-resume`: Accepts a PDF resume, extracts text, and uses Google Gemini (2.5 Flash Lite) to extract structured skills and experience JSON.
*   **Importance**: Handles NLP and LLM-based analysis of candidate metadata.

### 4. Backend & DevOps (`/backend`, root)
*   **Redis (Port 6379)**: Acts as both the LiveKit signaling backend and the Celery task broker.
*   **Celery Worker**: Processes background tasks like `run_chunk_inference`.
*   **LiveKit (Port 7880)**: Manages WebRTC rooms. Media is transported via UDP (ports 50000-50100).
*   **Orchestration**: `start-system.ps1` launches all services in parallel PowerShell windows.

---

## Data Transfer & Ports

| Service | Port | Description |
| :--- | :--- | :--- |
| **Frontend** | 3000 | Next.js Web UI |
| **Vision Server** | 8000 | ML Inference (WebSocket + HTTP) |
| **Inference Service**| 8001 | Resume Parsing (HTTP) |
| **Redis** | 6379 | Task Queue & LiveKit Signaling |
| **LiveKit API** | 7880 | WebRTC Signaling |
| **LiveKit TURN** | 7881 | STUN/TURN (if configured) |
| **LiveKit Media** | 50000-50100 | UDP Media Transport (WebRTC) |

### Key Data Flows:
1.  **Gaze Data**: Browser (WebSocket) <-> Vision Server. Real-time head pose and iris coordinates.
2.  **Video Chunks**: Browser --(POST)--> Vision Server (`/upload_video`) --(WS)--> `process_chunk`.
3.  **Resume Data**: Browser --(POST)--> Inference Service --(Upsert)--> Supabase Database.
4.  **Live Media**: Browser <-> LiveKit Server (WebRTC).

---

## Research & Development Modules

*   **`Atempt2/`**: Contains the training pipeline for the VideoMAE confidence and facial expression models. Includes dataset loaders for the RecruitView dataset.
*   **`Voice_Evaluation_PRJ3/`**: Dedicated project for the Wav2Vec2 speaking skills model. Includes standalone evaluation scripts and training logic.

---

## Operational Notes
*   **Conda Environment**: Most Python services expect the `pupil310` environment.
*   **Hardware**: ML models (VideoMAE, Wav2Vec2) are optimized for CUDA but fallback to CPU.
*   **Dependencies**: Requires `ffmpeg` on the system PATH for audio extraction from video chunks.
