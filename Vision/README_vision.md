# Vision Module (`Vision/`)

This document explains the **current implementation** and the **older/legacy implementation paths** in the Vision stack.
It is based on:

- `Vision/vision_server.py`
- `Vision/vision.py`
- `Vision/realtime_inference.py`

---

## 1) What this module does

The Vision module provides backend analysis for interview video chunks:

1. **Gaze tracking** (MediaPipe + custom geometric logic)
2. **Video confidence scoring** (VideoMAE model)
3. **Facial expression scoring** (VideoMAE-based ranker checkpoint)
4. **Voice speaking-skill scoring** (wav2vec-based model from `Voice_Evaluation_PRJ3`)

It exposes:

- **WebSocket API** for real-time chunk processing and session control (`/ws`)
- **HTTP upload endpoint** for chunk/video transfer (`/upload_video`)
- **HTTP voice endpoint** for standalone voice analysis (`/analyze_voice`)
- basic health/root endpoints (`/health`, `/`)

---

## 2) High-level architecture

### Main server

- **Entry service:** `vision_server.py` (FastAPI)
- Preloads all analyzers during startup (`lifespan`):
  - `GazeAnalyzer` (delegates to `vision.analyze_video`)
  - `VideoInferenceAnalyzer` (VideoMAE confidence)
  - `FacialExpressionAnalyzer` (VideoMAE facial model)
  - `VoiceAnalyzer` (wav2vec speaking skill model)

### Analysis engines

- **`vision.py`**
  - Contains the full gaze pipeline.
  - Exposes `analyze_video(video_path, session_id, speed)` for batch/headless inference.
  - Also contains an interactive runtime (`_run_interactive`) with keyboard controls, optional chunk recording, debug rendering, and mouse-control features.

- **`realtime_inference.py`**
  - Standalone VideoMAE chunk monitor/inference runner.
  - Can monitor `Vision/data/` for new chunks or split and infer a full video offline.

---

## 3) Current runtime path (active flow)

The active pipeline in `vision_server.py` is **in-process per chunk** via WebSocket action `process_chunk`.

### Current frontend/backend sequence

1. Frontend records a chunk (~15s) and uploads it via `POST /upload_video`
2. Frontend sends WebSocket message:
   ```json
   {
     "action": "process_chunk",
     "video_path": "<server-local-upload-path>",
     "chunk_id": "...",
     "chunk_index": 0
   }
   ```
3. Server runs `_process_chunk(...)` under an `asyncio.Semaphore(1)`
4. Four analyzers run concurrently via `asyncio.gather(...)` in thread executors:
   - `gaze_analyzer.analyze(...)`
   - `voice_analyzer.analyze(...)`
   - `video_inference_analyzer.analyze(...)`
   - `facial_expression_analyzer.analyze(...)`
5. Server sends `chunk_processed` payload back over WS
6. Temporary chunk files are deleted in `_process_chunk` finally block

### `chunk_processed` response shape

`vision_server.py` sends:

- `type`: `"chunk_processed"`
- `chunk_id`
- `chunk_index`
- `gaze_data` (empty by default unless `VISION_SEND_RAW_GAZE_DATA=1`)
- `gaze_summary`
- `predictions` (VideoMAE confidence wrapped for frontend compatibility)
- `inference_summary`
- `voice_analysis`
- `facial_analysis`

### Reliability mechanisms in active flow

- `CHUNK_SEMAPHORE = asyncio.Semaphore(1)` (sequential chunk execution to reduce contention)
- `CHUNK_RESULT_CACHE` retains completed chunk payloads when websocket drops
- `replay_chunk_results` action replays cached payloads after reconnect
- stale upload cleanup on startup (`_cleanup_stale_uploads`, default 1 hour)

---

## 4) Legacy / older implementation still present in code

Several components represent an older architecture where subprocesses were central:

### A) Session subprocess model (`start_session` / `stop_session`)

`VisionSession` in `vision_server.py` still supports:

- `action: start_session` -> launches `vision.py` as subprocess in batch mode
- `action: stop_session` -> terminates subprocess, reads final logs/predictions, sends `session_ended`

This path depends on session files like:

- `data/gaze_log_<session_id>.txt`
- `data/predictions/<session_id>_predictions.json`

### B) `realtime_inference.py` monitor-based flow

`realtime_inference.py` supports:

- directory polling for `"<session_id>_chunk*.mp4"`
- stop-signal file (`<session_id>_stop.signal`)
- incremental JSON prediction writes

This reflects a previous design where chunk files were produced and a separate process inferred them continuously.

### C) Backward-compat data shaping

Even in current in-process mode, `vision_server.py` still wraps VideoMAE output into a `predictions` list and `inference_summary` to keep existing frontend contracts compatible.

---

## 5) Detailed file-level behavior

## `vision_server.py`

### Startup behavior

- Creates `FastAPI(lifespan=lifespan)`
- On startup:
  - initializes `CHUNK_SEMAPHORE`
  - removes stale uploads
  - preloads all models in parallel threads
  - checks ffmpeg availability

### Key classes

- `VoiceAnalyzer`
  - Imports `VoiceWav2VecModel` from `Voice_Evaluation_PRJ3/src/model/voice_wav2vec_model.py`
  - Loads `Voice_Evaluation_PRJ3/voice_wav2vec_model.pt`
  - For video input, extracts mono 16k WAV via ffmpeg
  - Returns score + sliding windows + energy + zero-crossing pitch proxy

- `_BaseVideoAnalyzer` + subclasses
  - `VideoInferenceAnalyzer` -> `Atempt2/checkpoints/videoMAE_confidence_ranker_epoch6.pth`
  - `FacialExpressionAnalyzer` -> `Atempt2/checkpoints/best_facial_expression_model.pth`
  - Uses `AutoImageProcessor.from_pretrained("MCG-NJU/videomae-base")`
  - Uniformly samples 16 frames, predicts scalar score

- `GazeAnalyzer`
  - Imports `analyze_video` from `vision.py`
  - Transcodes `.webm` to H.264 `.mp4` for more reliable MediaPipe detection
  - Runs gaze analysis and returns timestamped statuses

- `VisionSession` (legacy/session mode)
  - Launches `vision.py` subprocess
  - Tracks logs and prediction files
  - Handles stop and cleanup

### Endpoints

- `WS /ws`
  - Actions:
    - `start_session` (legacy session subprocess path)
    - `stop_session`
    - `process_chunk` (current main path)
    - `replay_chunk_results`
    - `get_status`

- `POST /upload_video`
  - Saves uploaded file into `Vision/data/uploads/`
  - Returns `{ status, video_path }`

- `POST /analyze_voice`
  - Uploads audio/video, runs voice analyzer in executor, returns analysis

- `GET /health` -> `{ "status": "healthy" }`
- `GET /` -> server status and active session count

---

## `vision.py`

### Two modes in one file

1. **Batch/import mode:** `analyze_video(...)`
   - Thread-safe, no GUI windows, no pyautogui usage
   - Uses MediaPipe FaceMesh
   - Samples roughly at target gaze FPS (27)
   - Auto-calibrates eye spheres after initial delay
   - Performs:
     - head-pose based gaze classification
     - eye-only deviation override (`Looking Away (Eyes Only)`)
   - Writes/returns gaze logs

2. **Interactive mode:** `_run_interactive(args)` (script entrypoint)
   - Optional webcam or file source
   - OpenCV windows + debug orbit scene
   - Keyboard controls for calibration and debug camera
   - Optional chunk recording every 15s (`.mp4`, optional `.wav`)
   - Writes stop signal file when recording ends

### Notable gaze outputs

The pipeline may emit statuses such as:

- `Looking Forward`
- `Looking Left`
- `Looking Right`
- `Looking Away`
- `Looking Away (Eyes Only)`

### Data files used by `vision.py`

- `Vision/data/gaze_log_<session_id>.txt`
- `Vision/data/screen_position.txt`
- chunk files in `Vision/data/` during interactive recording
- stop signal: `Vision/data/<session_id>_stop.signal`

---

## `realtime_inference.py`

### Purpose

Standalone VideoMAE confidence runner for chunked videos.

### Modes

- **Monitor mode** (default): watch a data directory for session chunk files
- **Offline mode** (`--video`): split one full video into N-second chunks (default 15s), infer each chunk

### Output

Writes:

- `Vision/data/predictions/<session_id>_predictions.json`

Containing:

- `session_id`
- `predictions[]`
- aggregate summary (`count`, mean/min/max confidence)

---

## 6) Data paths and artifacts

Main runtime directories under `Vision/data/`:

- `uploads/` - uploaded video chunks/files from HTTP API
- `predictions/` - JSON outputs from realtime inference paths
- `gaze_log_<id>.txt` - gaze status logs per session/chunk
- `screen_position.txt` - latest mapped screen point from interactive mode
- `<session_id>_stop.signal` - stop marker for monitor-based inference

Temporary files:

- `voice_tmp_<chunk_id>.wav`
- `gaze_tmp_<session_id>.mp4` (webm transcode for gaze)

---

## 7) Model dependencies

### Gaze

- MediaPipe FaceMesh (`mediapipe`)
- OpenCV (`cv2`)
- geometric transforms and smoothing logic in `vision.py`

### Video confidence / facial expression

- `Atempt2/src/model/video_model.py` (`VideoModel`)
- `transformers.AutoImageProcessor` (`MCG-NJU/videomae-base`)
- checkpoints:
  - `Atempt2/checkpoints/videoMAE_confidence_ranker_epoch6.pth`
  - `Atempt2/checkpoints/best_facial_expression_model.pth`

### Voice

- `Voice_Evaluation_PRJ3/src/model/voice_wav2vec_model.py`
- checkpoint: `Voice_Evaluation_PRJ3/voice_wav2vec_model.pt`
- ffmpeg required for video->wav extraction

---

## 8) Dataset usage (current state)

Inside `Vision/` there is **no dataset loader/training dataset definition**.

The Vision code is inference-oriented and consumes:

- uploaded runtime video/audio files (`Vision/data/uploads/...`)
- model checkpoints from sibling folders (`Atempt2/`, `Voice_Evaluation_PRJ3/`)

So for Vision specifically, the effective “dataset” is runtime interview media chunks, not a static dataset packaged in this folder.

---

## 9) Operational notes

- CORS in `vision_server.py` currently allows `http://localhost:3000`
- `FFMPEG_PATH` env var can override ffmpeg executable path
- `VISION_SEND_RAW_GAZE_DATA=1` enables raw gaze records in chunk response
- model loading handles meta tensors (`to_empty`) before checkpoint load

---

## 10) Current vs past summary

### Current (recommended)

- Use `POST /upload_video` + `WS action=process_chunk`
- In-process concurrent analyzers return a single chunk payload
- Supports replay on WS reconnect via `CHUNK_RESULT_CACHE`

### Past / compatibility path

- `start_session` / `stop_session` session orchestration
- `vision.py` subprocess lifecycle and file-based handoff
- `realtime_inference.py` monitor + stop-signal pattern

Both coexist in code, but the chunk-based in-process pipeline is the present real-time path.
