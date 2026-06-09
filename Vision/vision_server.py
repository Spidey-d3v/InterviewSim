"""
Vision Gaze Tracking WebSocket Server

This server manages vision.py sessions and communicates with the Next.js frontend.
- Accepts uploaded video files via POST /upload_video
- Receives uploaded video chunks or paths
- Spawns vision.py to perform local gaze tracking via l2cs-net
- Streams live gaze data, and final gaze summary back to frontend via WebSockets

New model (offline/batch):
  Frontend uploads video  →  POST /upload_video  →  receives video_path
  Frontend sends start_session(video_path)  →  FastAPI launches vision.py
  vision.py processes video offline  →  exits at EOF
"""

import asyncio
import csv
import json
import math
import os
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

try:
    import mediapipe as _mp
    _MEDIAPIPE_AVAILABLE = True
except ImportError:
    _mp = None
    _MEDIAPIPE_AVAILABLE = False
import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoImageProcessor

# ---------------------------------------------------------------------------
# Voice module and Atempt2 module have been removed
# ---------------------------------------------------------------------------


def _model_has_meta_tensors(model: torch.nn.Module) -> bool:
    """Return True if any model parameter or buffer is a meta tensor."""
    return any(t.is_meta for t in model.parameters()) or any(t.is_meta for t in model.buffers())

# app is created after lifespan is defined below

# ---------------------------------------------------------------------------
# VoiceAnalyzer — wraps the wav2vec speaking-skills model
# ---------------------------------------------------------------------------

class VoiceAnalyzer:
    """Wrapper around VoiceWav2VecModel.

    Model is loaded ONCE at server startup (eager) and shared across all
    concurrent chunk requests. A threading.Lock prevents duplicate loads
    if startup somehow races.
    """

    def __init__(self):
        self._model = None
        self._device = None
        self._lock = threading.Lock()  # prevents concurrent load attempts



# ---------------------------------------------------------------------------
# GazeAnalyzer — thin wrapper around vision.analyze_video (full model)
# ---------------------------------------------------------------------------

class GazeAnalyzer:
    """Delegates gaze analysis to vision.analyze_video (the full model).

    analyze_video() creates its own FaceMesh context per call, so multiple
    thread-pool workers can run concurrently without shared state.
    """

    def __init__(self):
        self._available: bool = False
        self._lock = threading.Lock()
        self._analyzer = None

    def load(self) -> bool:
        if self._available:
            return True
        with self._lock:
            if self._available:
                return True
            try:
                from l2cs_gaze import L2CSGazeAnalyzer
                # Use absolute path to avoid cwd issues
                weights_path = Path(__file__).parent / "models" / "L2CSNet_gaze360.pkl"
                self._analyzer = L2CSGazeAnalyzer(weights_path=weights_path)
                self._analyzer.load()
                self._available = True
                print("[GazeAnalyzer] Using L2CS-Net gaze analyzer")
                return True
            except Exception as exc:
                print(f"[GazeAnalyzer] l2cs_gaze import failed — gaze tracking disabled: {exc}")
                return False

    @staticmethod
    def _transcode_to_mp4(input_path: str, session_id: str) -> str | None:
        """Transcode input video to a reliable mp4 (H.264) for L2CS."""
        out_path = str(Path(input_path).parent / f"gaze_tmp_{session_id}.mp4")
        _ffmpeg = os.environ.get("FFMPEG_PATH", "ffmpeg")
        cmd = [
            _ffmpeg, "-y", "-i", input_path,
            "-vf", "fps=27",
            "-r", "27",
            "-vcodec", "libx264", "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-acodec", "aac", "-strict", "experimental",
            out_path
        ]
        try:
            result = subprocess.run(
                cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120
            )
            if result.returncode == 0 and os.path.exists(out_path):
                return out_path
        except Exception as exc:
            print(f"[GazeAnalyzer:{session_id}] ffmpeg transcode failed: {exc}")
        return None

    def analyze(self, video_path: str, session_id: str = "tmp") -> list:
        """Process a video file and return gaze log entries."""
        if not self._available:
            if not self.load():
                return []

        # Transcode webm → mp4 so opencv gets reliable H.264 frames
        transcoded_path = None
        analysis_path = video_path
        if video_path.lower().endswith(".webm"):
            transcoded_path = self._transcode_to_mp4(video_path, session_id)
            if transcoded_path:
                analysis_path = transcoded_path
            else:
                print(f"[GazeAnalyzer:{session_id}] Transcode failed — trying original webm")

        try:
            return self._analyzer.analyze_video(analysis_path)
        except Exception as exc:
            print(f"[GazeAnalyzer:{session_id}] ERROR: {exc}")
            return []
        finally:
            if transcoded_path and os.path.exists(transcoded_path):
                try:
                    os.remove(transcoded_path)
                except Exception:
                    pass


gaze_analyzer = GazeAnalyzer()

# ---------------------------------------------------------------------------
# Stale-upload cleanup — removes uploads older than 1 hour
# ---------------------------------------------------------------------------

def _cleanup_stale_uploads(max_age_seconds: int = 3600) -> None:
    """Remove leftover upload files from previously crashed sessions."""
    upload_dir = Path(__file__).parent / "data" / "uploads"
    if not upload_dir.exists():
        return
    cutoff  = time.time() - max_age_seconds
    removed = 0
    for fpath in upload_dir.iterdir():
        try:
            if fpath.is_file() and fpath.stat().st_mtime < cutoff:
                fpath.unlink()
                removed += 1
        except Exception as exc:
            print(f"[Cleanup] Could not remove {fpath}: {exc}")
    if removed:
        print(f"[Startup] Cleaned up {removed} stale upload file(s) from {upload_dir}")


# ---------------------------------------------------------------------------
# FastAPI lifespan — eager-load all four models once at startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app_: FastAPI):
    """Load all ML models in thread-pool workers at startup."""
    global CHUNK_SEMAPHORE
    CHUNK_SEMAPHORE = asyncio.Semaphore(1)
    loop = asyncio.get_running_loop()

    # Remove stale uploads left over from any previous crashed sessions
    _cleanup_stale_uploads()

    print("[Startup] Pre-loading all models…")
    await asyncio.gather(
        loop.run_in_executor(None, gaze_analyzer.load),
    )
    print("[Startup] All models ready.")
    # Check ffmpeg availability (required for voice analysis audio extraction)
    _ffmpeg_exe = os.environ.get("FFMPEG_PATH", "ffmpeg")
    try:
        subprocess.run(
            [_ffmpeg_exe, "-version"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
        )
        print(f"[Startup] ffmpeg OK ({_ffmpeg_exe})")
    except (FileNotFoundError, subprocess.CalledProcessError):
        print(
            f"[Startup] WARNING: ffmpeg not found at '{_ffmpeg_exe}'. "
            "Voice analysis will fail for video chunks. "
            "Install ffmpeg, add it to PATH, or set FFMPEG_PATH env variable."
        )
    yield  # server runs here

# Create app here so we can pass lifespan
app = FastAPI(lifespan=lifespan)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (Vercel, local IPs, etc.)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Store active sessions
# ---------------------------------------------------------------------------
active_sessions = {}

# Cache completed chunk payloads so transient WebSocket disconnects do not
# drop already-computed results.
CHUNK_RESULT_CACHE = {}

# Default to summary-first payloads to reduce websocket size; enable raw gaze
# only when explicitly needed for debugging.
SEND_RAW_GAZE_DATA = os.getenv("VISION_SEND_RAW_GAZE_DATA", "0") == "1"

# Sequential processing (1 at a time) ensures each chunk finishes as fast as possible
# without resource contention, providing a better "real-time" experience.
CHUNK_SEMAPHORE = None  # Initialized in lifespan as Semaphore(1)

# app is created after lifespan is defined below


class VisionSession:
    def __init__(self, session_id: str,
                 video_path: str,
                 loop: bool = False,
                 speed: float = 1.0):
        self.session_id = session_id
        self.headless = True  # Always headless: offline batch mode, no OpenCV windows
        self.video_path = video_path  # Path to uploaded video file (required)
        self.loop = loop
        self.speed = speed
        self.vision_process: Optional[subprocess.Popen] = None
        self.log_file_path = Path(__file__).parent / "data" / f"gaze_log_{session_id}.txt"
        self.vision_log = Path(__file__).parent / "data" / f"vision_output_{session_id}.log"
        self.start_time = datetime.now()
        self.is_running = False
        self.last_prediction_count = 0
        
    def start(self):
        """Start vision.py subprocess for offline batch processing"""
        # Ensure data directory exists
        self.log_file_path.parent.mkdir(exist_ok=True)
        self.predictions_file.parent.mkdir(exist_ok=True)

        # video_path is required — no webcam fallback
        if not self.video_path:
            print("ERROR: video_path is required — no webcam fallback")
            self.is_running = False
            return
        if not os.path.exists(self.video_path):
            print(f"ERROR: Video file not found: {self.video_path}")
            self.is_running = False
            return

        # Use sys.executable to ensure we use the same Python (from conda env)
        python_exe = sys.executable
        vision_script = Path(__file__).parent / "vision.py"

        print(f"Starting vision system with:")
        print(f"   Python: {python_exe}")
        print(f"   Vision Script: {vision_script}")
        print(f"   Session ID: {self.session_id}")
        print(f"   Mode: offline batch (headless)")
        print(f"   Video file: {self.video_path}")
        print(f"   Loop: {self.loop} | Speed: {self.speed}x")

        # Build command arguments for vision.py
        # Always headless; --video is required (no webcam)
        vision_cmd = [
            python_exe, str(vision_script),
            "--session-id", self.session_id,
            "--headless",
            "--video", self.video_path,
        ]
        if self.loop:
            vision_cmd.append("--loop")
        if self.speed != 1.0:
            vision_cmd.extend(["--speed", str(self.speed)])
        
        # Start vision.py with output logging
        try:
            self._vision_log_file = open(self.vision_log, 'w', encoding='utf-8')
            # PYTHONIOENCODING ensures emoji/unicode in vision.py print() go to the log cleanly
            child_env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
            if os.name == 'nt':  # Windows
                self.vision_process = subprocess.Popen(
                    vision_cmd,
                    cwd=Path(__file__).parent,
                    stdout=self._vision_log_file,
                    stderr=subprocess.STDOUT,
                    env=child_env,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            else:  # Linux/Mac
                self.vision_process = subprocess.Popen(
                    vision_cmd,
                    cwd=Path(__file__).parent,
                    stdout=self._vision_log_file,
                    stderr=subprocess.STDOUT,
                    env=child_env,
                )
            print(f"Started vision.py (PID: {self.vision_process.pid})")
            print(f"   Output log: {self.vision_log}")
        except Exception as e:
            print(f"ERROR: starting vision.py: {e}")
            self.is_running = False
            return
        
        self.is_running = True
        
        # Check if processes are still running
        time.sleep(0.5)
        if self.vision_process.poll() is not None:
            print(f"ERROR: vision.py crashed immediately (exit code: {self.vision_process.returncode})")
            self.is_running = False
            return
        
        print(f"Session started: {self.session_id}")
        print(f"   Log file: {self.log_file_path}")
        
    def stop(self):
        """Stop vision.py subprocess gracefully"""
        # Stop vision.py first
        if self.vision_process:
            try:
                # Try graceful shutdown first
                self.vision_process.terminate()
                self.vision_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                # Force kill if doesn't terminate
                self.vision_process.kill()
                self.vision_process.wait()
            finally:
                # Close the stdout log file handle to prevent leaking the fd
                if getattr(self, '_vision_log_file', None):
                    try:
                        self._vision_log_file.close()
                    except Exception:
                        pass
                    self._vision_log_file = None
            
            print(f"Stopped vision.py")
        
        self.is_running = False
        print(f"Stopped session: {self.session_id}")
            
    def get_log_data(self) -> list:
        """Read and return log data from this session"""
        if not self.log_file_path.exists():
            return []
        
        with open(self.log_file_path, 'r') as f:
            lines = f.readlines()
        
        # Parse log entries
        log_entries = []
        for line in lines:
            line = line.strip()
            if ': ' in line:
                timestamp_str, status = line.split(': ', 1)
                log_entries.append({
                    'timestamp': timestamp_str,
                    'status': status
                })
        
        return log_entries
    
    def get_predictions(self) -> dict:
        """Read and return prediction data from this session"""
        if not self.predictions_file.exists():
            return {'predictions': [], 'summary': {}}
        
        try:
            with open(self.predictions_file, 'r') as f:
                data = json.load(f)
            return data
        except (json.JSONDecodeError, IOError):
            return {'predictions': [], 'summary': {}}
    
    def get_new_predictions(self) -> list:
        """Get predictions that haven't been sent yet"""
        data = self.get_predictions()
        predictions = data.get('predictions', [])
        
        # Get only new predictions since last check
        new_predictions = predictions[self.last_prediction_count:]
        self.last_prediction_count = len(predictions)
        
        return new_predictions
    
    def cleanup(self):
        """Clean up session resources"""
        self.stop()


# ---------------------------------------------------------------------------
# Chunk processing — called for each 15-s video chunk from the frontend
# ---------------------------------------------------------------------------

async def _process_chunk(
    websocket: WebSocket,
    chunk_id: str,
    chunk_index: int,
    video_path: str,
    chunk_result_cache: dict,
) -> None:
    """Process a single 15-s video chunk through the analysis modules.

    LATE FUSION STRATEGY (Update: 2026-05-03):
    - We combine the Iris Tracking score with the VideoMAE NN score.
    - Iris Tracking (Looking Forward %) is the DOMINANT signal (alpha=0.85).
    - The VideoMAE NN score acts as a weak background signal (1-alpha=0.15).
    - The Facial Expression model has been removed from this pipeline to focus
      exclusively on gaze-driven confidence and general composure.
    
    Formula: final_score = (0.85 * iris_score) + (0.15 * nn_score)
    """
    loop = asyncio.get_running_loop()

    async with CHUNK_SEMAPHORE:
        gaze_log_path = Path(__file__).parent / "data" / f"gaze_log_{chunk_id}.txt"

        try:
            # ---- Run gaze analysis ----
            gaze_task   = loop.run_in_executor(None, gaze_analyzer.analyze,               video_path, chunk_id)

            gaze_data = await gaze_task

            print(
                f"[Chunk {chunk_index}] Done: "
                f"gaze={len(gaze_data)} frames processed"
            )

            chunk_payload = {
                'type': 'chunk_processed',
                'chunk_id': chunk_id,
                'chunk_index': chunk_index,
                'gaze_data': gaze_data
            }
            chunk_result_cache[chunk_id] = chunk_payload

            try:
                await websocket.send_json(chunk_payload)
                chunk_result_cache.pop(chunk_id, None)
            except Exception:
                print(f"[Chunk {chunk_index}] Client disconnected — result cached for replay")

        except Exception as e:
            print(f"[Chunk {chunk_index}] ERROR: {e}")
            try:
                await websocket.send_json({
                    'type': 'chunk_error',
                    'chunk_id': chunk_id,
                    'chunk_index': chunk_index,
                    'message': str(e),
                })
            except Exception:
                print(f"[Chunk {chunk_index}] Could not send chunk_error — client disconnected")
        finally:
            # ---- Clean up all files produced by this chunk ----
            files_to_delete = [
                video_path,
                str(gaze_log_path),
            ]
            for fpath in files_to_delete:
                try:
                    if os.path.exists(fpath):
                        os.remove(fpath)
                except Exception:
                    pass


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    current_session = None
    monitoring_task = None
    pending_chunk_tasks = set()
    
    async def monitor_predictions():
        """Background task to monitor and send prediction updates"""
        while current_session and current_session.is_running:
            try:
                # Check for new predictions
                new_preds = current_session.get_new_predictions()
                
                if new_preds:
                    # Send each new prediction to frontend
                    for pred in new_preds:
                        await websocket.send_json({
                            'type': 'prediction_update',
                            'session_id': current_session.session_id,
                            'prediction': pred
                        })
                    
                    # Also send summary
                    all_data = current_session.get_predictions()
                    if all_data.get('summary'):
                        await websocket.send_json({
                            'type': 'prediction_summary',
                            'session_id': current_session.session_id,
                            'summary': all_data['summary']
                        })
                
                # Check every 2 seconds
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"Error in prediction monitoring: {e}")
                break
    
    try:
        while True:
            # Receive message from frontend
            message = await websocket.receive_json()
            action = message.get('action')
            print(f"[WS] Received action: {action}")
            
            if action == 'start_session':
                # video_path is required — frontend must upload video first via POST /upload_video
                video_path = message.get('video_path', None)
                if not video_path:
                    await websocket.send_json({
                        'type': 'error',
                        'message': 'video_path is required. Upload the video via POST /upload_video first.'
                    })
                    continue

                session_id = str(uuid.uuid4())
                loop = message.get('loop', False)
                speed = float(message.get('speed', 1.0))
                session = VisionSession(session_id,
                                        video_path=video_path, loop=loop, speed=speed)
                # Run in executor — start() contains time.sleep() that would block the event loop
                await asyncio.get_running_loop().run_in_executor(None, session.start)

                active_sessions[session_id] = session
                current_session = session
                
                # Start monitoring predictions
                monitoring_task = asyncio.create_task(monitor_predictions())
                
                await websocket.send_json({
                    'type': 'session_started',
                    'session_id': session_id,
                    'timestamp': datetime.now().isoformat()
                })
                
            elif action == 'stop_session':
                if current_session:
                    print(f"Stopping session {current_session.session_id}")
                    current_session.stop()
                    
                    # Cancel monitoring task
                    if monitoring_task:
                        monitoring_task.cancel()
                        try:
                            await monitoring_task
                        except asyncio.CancelledError:
                            pass
                    
                    # Wait longer for final logs and predictions to be written
                    await asyncio.sleep(2.0)
                    
                    # Read and send log data
                    log_data = current_session.get_log_data()
                    print(f"Read {len(log_data)} log entries from {current_session.log_file_path}")
                    
                    # Read final predictions
                    predictions_data = current_session.get_predictions()
                    print(f"Read {len(predictions_data.get('predictions', []))} predictions")
                    
                    if len(log_data) == 0:
                        print(f"WARNING: No log data found!")
                        print(f"   File exists: {current_session.log_file_path.exists()}")
                        if current_session.log_file_path.exists():
                            print(f"   File size: {current_session.log_file_path.stat().st_size} bytes")
                    
                    await websocket.send_json({
                        'type': 'session_ended',
                        'session_id': current_session.session_id,
                        'log_data': log_data,
                        'start_time': current_session.start_time.isoformat(),
                        'end_time': datetime.now().isoformat()
                    })
                    
                    # Cleanup
                    active_sessions.pop(current_session.session_id, None)
                    current_session = None
                    
            elif action == 'process_chunk':
                # Each 15-s video chunk goes through vision.py only now.
                video_path = message.get('video_path')
                chunk_id = message.get('chunk_id', str(uuid.uuid4()))
                chunk_index = int(message.get('chunk_index', 0))

                if not video_path:
                    await websocket.send_json({
                        'type': 'chunk_error',
                        'chunk_id': chunk_id,
                        'message': 'video_path is required for process_chunk'
                    })
                elif not os.path.exists(video_path):
                    await websocket.send_json({
                        'type': 'chunk_error',
                        'chunk_id': chunk_id,
                        'message': f'Video file not found: {video_path}'
                    })
                else:
                    print(f"Processing chunk {chunk_index} ({chunk_id}): {video_path}")
                    # Fire and forget — each chunk runs independently
                    task = asyncio.create_task(
                        _process_chunk(
                            websocket,
                            chunk_id,
                            chunk_index,
                            video_path,
                            CHUNK_RESULT_CACHE,
                        )
                    )
                    pending_chunk_tasks.add(task)
                    task.add_done_callback(pending_chunk_tasks.discard)

            elif action == 'replay_chunk_results':
                # Replay any completed chunk results that were computed while the
                # client was disconnected.
                replay_items = sorted(
                    CHUNK_RESULT_CACHE.items(),
                    key=lambda item: int(item[1].get('chunk_index', 0)),
                )
                sent_count = 0
                for chunk_id, payload in replay_items:
                    try:
                        await websocket.send_json(payload)
                        CHUNK_RESULT_CACHE.pop(chunk_id, None)
                        sent_count += 1
                    except Exception:
                        break

                await websocket.send_json({
                    'type': 'replay_complete',
                    'sent_count': sent_count,
                    'pending_count': len(CHUNK_RESULT_CACHE),
                })

            elif action == 'get_status':
                if current_session and current_session.is_running:
                    await websocket.send_json({
                        'type': 'status',
                        'session_id': current_session.session_id,
                        'is_running': True
                    })
                else:
                    await websocket.send_json({
                        'type': 'status',
                        'is_running': False
                    })
            
            elif action == 'ping':
                # Ignore keep-alive pings
                pass
                    
    except WebSocketDisconnect:
        print(f"Client disconnected. Waiting for {len(pending_chunk_tasks)} background tasks...")
        if current_session:
            current_session.cleanup()
            active_sessions.pop(current_session.session_id, None)
        if monitoring_task:
            monitoring_task.cancel()
        
        if pending_chunk_tasks:
            await asyncio.wait(pending_chunk_tasks, timeout=15)
            print("Background tasks completed or timed out.")
    except Exception as e:
        print(f"Error: {e}")
        if current_session:
            current_session.cleanup()
            active_sessions.pop(current_session.session_id, None)
        if monitoring_task:
            monitoring_task.cancel()
    except Exception as e:
        print(f"Error: {e}")
        if current_session:
            current_session.cleanup()
            active_sessions.pop(current_session.session_id, None)
        if monitoring_task:
            monitoring_task.cancel()


@app.post("/upload_video")
async def upload_video(file: UploadFile = File(...)):
    """Accept a video file from the frontend and return its server-local path.

    Frontend flow:
      1. POST /upload_video  →  receive video_path
      2. WS start_session(video_path=...)
    """
    upload_dir = Path(__file__).parent / "data" / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_id = f"{uuid.uuid4()}_{file.filename}"
    file_path = upload_dir / file_id

    with open(file_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):  # stream in 1 MB chunks
            f.write(chunk)

    print(f"Uploaded video: {file_path}")
    return {
        "status": "uploaded",
        "video_path": str(file_path)
    }


@app.get("/")
async def root():
    return {
        "message": "Vision Gaze Tracking Server",
        "status": "running",
        "active_sessions": len(active_sessions)
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    print("=" * 60)
    print("Vision Gaze Tracking WebSocket Server")
    print("=" * 60)
    print("Server starting on: http://localhost:8000")
    print("WebSocket endpoint: ws://localhost:8000/ws")
    print("=" * 60)
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
