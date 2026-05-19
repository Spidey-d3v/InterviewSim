<div align="center">

<br/>

```
██╗      █████╗ ████████╗████████╗██╗ ██████╗███████╗
██║     ██╔══██╗╚══██╔══╝╚══██╔══╝██║██╔════╝██╔════╝
██║     ███████║   ██║      ██║   ██║██║     █████╗
██║     ██╔══██║   ██║      ██║   ██║██║     ██╔══╝
███████╗██║  ██║   ██║      ██║   ██║╚██████╗███████╗
╚══════╝╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝ ╚═════╝╚══════╝
```

### **AI-Powered Interview Intelligence Platform**

*Multimodal • Real-time • Production-Grade*

<br/>

[![Stack](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Stack](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Stack](https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)](https://pytorch.org)
[![Stack](https://img.shields.io/badge/LiveKit-000000?style=for-the-badge&logo=webrtc&logoColor=white)](https://livekit.io)

[![AI](https://img.shields.io/badge/Whisper-412991?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/research/whisper)
[![AI](https://img.shields.io/badge/Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini)
[![AI](https://img.shields.io/badge/Wav2Vec2-FFD700?style=for-the-badge&logo=huggingface&logoColor=black)](https://huggingface.co)
[![AI](https://img.shields.io/badge/VideoMAE-FF6F00?style=for-the-badge&logo=pytorch&logoColor=white)](https://github.com/MCG-NJU/VideoMAE)

[![DB](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![DB](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](./LICENSE)

<br/>

</div>

---

## ✦ Overview

**Lattice** is a production-grade AI platform that conducts and evaluates technical interviews in real time. It unifies a low-latency **Voice Agent**, **Computer Vision**, and **Deep Audio Analysis** into a single end-to-end pipeline — turning a raw interview session into a structured, scored report.

> Candidates are assessed across **12 behavioral dimensions** using a tri-modal signal: what they *say*, how they *sound*, and how they *appear*.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         🌐  FRONTEND                             │
│          Next.js 16  ·  Gaze Hook  ·  Chunked Media Recorder     │
└───────────────────────┬──────────────────────────────────────────┘
                        │  WebRTC (LiveKit SFU)
          ┌─────────────▼──────────────┐
          │      📡  TRANSPORT         │
          │   LiveKit Server + Redis   │
          └──────┬───────────┬─────────┘
                 │           │
    ┌────────────▼──┐   ┌────▼──────────────────┐
    │  🧠  convFlow │   │   🔍  ANALYSIS ENGINES │
    │               │   │                        │
    │  Whisper STT  │   │  Vision  · VideoMAE    │
    │  LangGraph    │   │          · MediaPipe   │
    │  Gemini LLM   │   │  Voice   · Wav2Vec2    │
    │  Kokoro TTS   │   │          · BiLSTM      │
    └───────────────┘   └────────────────────────┘
                 │           │
          ┌──────▼───────────▼─────────┐
          │      💾  REDIS STORE        │
          │  Scores · Signals · State  │
          └────────────────────────────┘
```

---

## 🎙️ Module 1 — Conversational AI Pipeline (`convFlow`)

The voice agent that drives the interview — listening, reasoning, and responding in **under one second**.

<table>
<tr>
<td width="33%" valign="top">

**👂 Audio Input**
- `Silero VAD` — noise-robust speech detection
- `Smart-Turn v3.2` — ONNX turn-end prediction
- `Whisper STT` — progressive transcription

</td>
<td width="33%" valign="top">

**🧠 Intelligence**
- `Node A` — scores depth & red flags
- `Node B` — decides topic / phase
- `Node C` — generates response via Gemini
- `Summarizer` — rolling context compression

</td>
<td width="33%" valign="top">

**🗣️ Audio Output**
- `Kokoro TTS` — ultra-fast default
- `Piper TTS` — CPU-optimised local
- `F5-TTS` — diffusion-based expressive

</td>
</tr>
</table>

**Interview phases:** `Intro` → `Resume Deep-Dive` → `Core CS` → `Scenario / System Design`

---

## 👁️ Module 2 — Vision Intelligence

Real-time analysis of candidate body language and engagement using the webcam stream.

| Signal | Method | Output |
|---|---|---|
| **Gaze Tracking** | MediaPipe FaceMesh (5-point calibration) | On-screen focus score |
| **Confidence** | VideoMAE — 15-second video chunks | Percentile ranking |
| **Facial Expression** | Ranking-supervised latent model | Smile · Neutral · Stress |

---

## 🔊 Module 3 — Voice Evaluation (`Voice_Evaluation_PRJ3`)

A dedicated deep learning system for fine-grained speaking skill assessment.

```
Audio Input
    │
    ▼
┌──────────────────────────────────────┐
│  Wav2Vec2-Base  (feature extraction) │
└────────────────┬─────────────────────┘
                 │
    ┌────────────▼──────────────┐
    │  BiLSTM  +  Regression    │  ← Spearman Correlation Loss
    └────────────┬──────────────┘
                 │
    ┌────────────▼────────────────────────┐
    │ Energy (RMS) · Pitch (F0) · Fluency │
    │ Jitter · Pause Rate · ZCR           │
    └─────────────────────────────────────┘
```

> **Training objective:** Spearman Correlation Loss — optimised to preserve human ranking order, not just raw score accuracy.

---

## 📊 RecruitView Dataset

The backbone of all model training and evaluation.

<div align="center">

| 🎬 Videos | 🎯 Dimensions | 📐 Methodology |
|:---:|:---:|:---:|
| **2,011** | **12 Behavioral** | **Ranking-Supervised** |
| Q&A interview sessions | Confidence · Fluency · Professionalism · … | Human pairwise ranking |

</div>

---

## 🛠️ Tech Stack

<table>
<tr><td><b>Layer</b></td><td><b>Technology</b></td></tr>
<tr><td>Frontend</td><td>Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · GSAP</td></tr>
<tr><td>Backend</td><td>FastAPI · Celery · Redis</td></tr>
<tr><td>Media</td><td>LiveKit WebRTC SFU · Docker Compose</td></tr>
<tr><td>ML Runtime</td><td>PyTorch · OpenCV · MediaPipe · Hugging Face Transformers</td></tr>
<tr><td>Database</td><td>Supabase (Postgres) · Redis</td></tr>
<tr><td>DevOps</td><td>Docker · Windows PowerShell orchestration</td></tr>
</table>

---

## 🚀 Quick Start

### Prerequisites

- 🐳 **Docker Desktop** — running
- 🐍 **Conda** — `pupil310` environment active
- 🎞️ **FFmpeg** — on system `PATH`

### Launch

```powershell
# Clone the repo
git clone https://github.com/your-org/lattice.git
cd lattice

# Copy and configure environment variables
cp .env.example .env
# Open .env and fill in the required values

# Fire everything up
.\start-system.ps1
```

The orchestration script brings up all services automatically:

```
✔  Redis        — signaling store
✔  LiveKit      — WebRTC SFU
✔  Vision       — port 8000
✔  Inference    — port 8001
✔  Celery       — task workers
✔  Next.js      — port 3000  ← open this
```

> Visit **`http://localhost:3000`** to start an interview session.

---

## 📜 Development Timeline

All milestones, architectural pivots, and lessons learned are documented in [`TIMELINE.md`](./TIMELINE.md).

---

<div align="center">

<br/>

**Built with ❤️ by the Lattice Team**

*If this project helped you, drop a ⭐ — it means a lot.*

<br/>

[![MIT License](https://img.shields.io/badge/MIT-License-22c55e?style=flat-square)](./LICENSE)

</div>