# 🎙️ convFlow: Real-Time AI Interview Voice Agent

## 🎯 Overall Project Objective
convFlow is a production-grade, low-latency AI technical interviewer designed to conduct realistic voice-based interviews. It leverages a sophisticated multi-stage pipeline—integrating WebRTC for transport, Silero for Voice Activity Detection (VAD), Whisper for Speech-to-Text (STT), a parallelized LangGraph-inspired reasoning engine, and high-quality Text-to-Speech (TTS)—to achieve sub-second response latency and human-like conversational flow.

---

## 📂 File-by-File Analysis

### 🚀 Core Orchestration
- **`main.py`**: The primary FastAPI application entry point. It handles LiveKit room connections, token generation, and the real-time audio processing loop for the browser-based interface.


### 👂 Audio Processing (`audio/`)
- **`audio/vad.py`**: Implements **Silero VAD** to detect voice activity in raw PCM streams, filtering out background noise.
- **`audio/buffer.py`**: Manages a rolling audio buffer to detect speech "turns" based on silence duration and speech length.
- **`audio/mic_input.py`**: Provides low-level access to local hardware microphones for non-WebRTC environments.
- **`audio/tts/`**: A factory-pattern implementation for multiple TTS engines:
    - `kokoro_tts.py`: Ultra-fast, high-quality synthesis (Default).
    - `piper_tts.py`: Optimized for local CPU execution.
    - `f5_tts.py`: High-fidelity diffusion-based synthesis.

### 🧠 Intelligence Layer (`interview/`)
- **`interview/engine.py`**: The brain of the system. It coordinates the parallel execution of reasoning nodes.
- **`interview/state.py`**: Maintains the "source of truth" for the interview, including rolling summaries, phase progression, and candidate scores.
- **`interview/nodes/`**:
    - `node_a_evaluate.py`: Scores candidate answers for technical depth, clarity, and behavioral red flags.
    - `node_b_decide.py`: Determines the next interview topic or phase transition (e.g., from Resume to Core CS).
    - `node_c_generate.py`: Crafts the interviewer's spoken response based on the previous nodes' instructions.
    - `rolling_summarizer.py`: Background worker that compresses conversation history to keep LLM prompts token-efficient.

### 🗣️ Speech & Language (`stt/` & `llm/`)
- **`stt/whisper_stt.py`**: Core transcription engine using OpenAI's Whisper model.
- **`stt/progressive_stt.py`**: Wraps Whisper to provide "incremental" transcripts, allowing the LLM to start reasoning before the user even finishes speaking.
- **`llm/streaming_llm.py`**: Interface for Gemini/LLM streaming, producing token-by-token responses.
- **`llm/streaming_voice_agent.py`**: Bridges the LLM and TTS, chunking text into sentences for immediate playback.

### 🔄 Turn-Taking (`turn_taking/`)
- **`turn_taking/smart_turn.py`**: Uses a specialized ONNX model (`smart-turn-v3.2-cpu.onnx`) to predict if a user has actually finished their thought, preventing premature interruptions.

---

## 🔌 Data Transfer & Connectivity

The system utilizes a hybrid transport model to minimize latency:

| Protocol | Purpose | Direction |
| :--- | :--- | :--- |
| **WebRTC (UDP)** | Low-latency Audio Stream | Browser ↔ LiveKit Server ↔ Agent |
| **WebSockets** | Signaling & Metadata | Browser ↔ FastAPI |
| **REST (HTTP)** | Token Auth & State Init | Browser → FastAPI |
| **gRPC/Streaming** | LLM & TTS data flow | Agent ↔ AI Models (Gemini/Local) |

### 🛠️ Port Mapping & DevOps

| Service | Port (Internal) | Port (External) | Description |
| :--- | :--- | :--- | :--- |
| **LiveKit Server** | `7880` | `7890` | WebRTC Signaling & API |
| **LiveKit Web** | `7881` | `7891` | WebRTC Transport |
| **LiveKit TURN** | `7882/udp` | `7892/udp` | STUN/TURN for NAT traversal |
| **FastAPI Backend**| `8001` | `8001` | Token Service & Agent Orchestration |
| **Frontend** | `5500` | `5500` | LiveServer (index.html) |

### 🚀 Deployment Requirements
1. **Containerization**: LiveKit runs via Docker to handle complex WebRTC networking.
2. **Environment**: Managed via Conda (`pupil310`) to satisfy deep learning dependencies (PyTorch, ONNX Runtime).
3. **Hardware**: Recommended GPU for `f5_tts` or `Whisper`, though `Kokoro` and `SmartTurn` are optimized for CPU.
