import asyncio
import numpy as np
from scipy.signal import decimate as _scipy_decimate
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from livekit import rtc
from livekit.rtc import Room, AudioStream, RoomOptions, RtcConfiguration, IceTransportType
from livekit.api import AccessToken, VideoGrants
from audio.buffer import TurnBuffer
from audio.vad import SileroVAD
from stt.whisper_stt import WhisperSTT
from stt.progressive_stt import ProgressiveSTTController
from llm.streaming_llm import StreamingInterviewLLM
from llm.streaming_voice_agent import StreamingVoiceAgent
from audio.tts.factory import create_tts
from uuid import uuid4
from interview.engine import InterviewEngine
import json
import time
from turn_taking.smart_turn import SmartTurnV3
import fitz
import httpx
import os
from dotenv import load_dotenv
from supabase import create_client, Client

from pathlib import Path
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

# Initialize Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
API_KEY = os.getenv("LIVEKIT_API_KEY", "devkey")
API_SECRET = os.getenv("LIVEKIT_API_SECRET", "APISECRETdevkey1234567890ABCDEFG")

app = FastAPI()

# -------------------- Initialization --------------------

# -------------------- Per Room Arrays --------------------
rooms = {}
room_states = {}
audio_sources = {}
voice_agents = {}
interview_engines = {}


class GazeDistributionModel(BaseModel):
    forward: float = 0.0
    left: float = 0.0
    right: float = 0.0
    down: float = 0.0
    away: float = 0.0


class ChunkMetricModel(BaseModel):
    chunk_id: str
    chunk_index: int
    question_index: int
    question_text: str
    confidence_score: Optional[float] = None
    voice_score: Optional[float] = None
    gaze_distribution: GazeDistributionModel = Field(default_factory=GazeDistributionModel)


class QuestionMetricModel(BaseModel):
    question_index: int
    question_text: str
    candidate_answer: Optional[str] = ""
    chunks: list[ChunkMetricModel] = Field(default_factory=list)


class FinalizeInterviewSessionPayload(BaseModel):
    session_id: str
    user_id: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    question_metrics_json: list[QuestionMetricModel] = Field(default_factory=list)
    llm_evaluation_json: Optional[dict] = None


def _safe_mean(values: list[Optional[float]]) -> Optional[float]:
    nums = [v for v in values if isinstance(v, (int, float))]
    if not nums:
        return None
    return float(sum(nums) / len(nums))


def _clamp_01(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return float(max(0.0, min(1.0, value)))


def _compute_overall_gaze(chunks: list[ChunkMetricModel]) -> dict[str, dict[str, float]]:
    if not chunks:
        return {
            "overall_gaze_distribution": {
                "forward": 0.0,
                "left": 0.0,
                "right": 0.0,
                "down": 0.0,
                "away": 0.0,
            }
        }

    return {
        "overall_gaze_distribution": {
            "forward": float(sum(c.gaze_distribution.forward for c in chunks) / len(chunks)),
            "left": float(sum(c.gaze_distribution.left for c in chunks) / len(chunks)),
            "right": float(sum(c.gaze_distribution.right for c in chunks) / len(chunks)),
            "down": float(sum(c.gaze_distribution.down for c in chunks) / len(chunks)),
            "away": float(sum(c.gaze_distribution.away for c in chunks) / len(chunks)),
        }
    }


async def publish_new_question(
    room_name: str,
    question_text: str | None,
    stream_id: str | None = None,
    is_final: bool = True,
):
    if not question_text or not question_text.strip():
        return

    agent_room_ref = rooms.get(room_name)
    interview_engine = interview_engines.get(room_name)
    if not agent_room_ref or not interview_engine:
        return

    state = interview_engine.state
    payload = {
        "event": "new_question",
        "question_text": question_text.strip(),
        "phase": state.get("phase"),
        "turn_index": state.get("phase_question_count", 0),
        "stream_id": stream_id,
        "is_final": is_final,
        "ts": time.time(),
    }

    await agent_room_ref.local_participant.publish_data(
        json.dumps(payload).encode(),
        reliable=True,
    )
    print("📡 Sent new_question to frontend")


async def publish_interview_end(room_name: str):
    agent_room_ref = rooms.get(room_name)
    engine = interview_engines.get(room_name)
    if not agent_room_ref or not engine:
        return

    # Wait for any pending phase evaluations to finish
    await engine.wait_for_evaluations()

    payload = {
        "event": "interview_end",
        "ts": time.time(),
        "final_scores": engine.state.get("candidate_profile", {}).get("scores", {})
    }

    await agent_room_ref.local_participant.publish_data(
        json.dumps(payload).encode(),
        reliable=True,
    )
    print("📡 Sent interview_end to frontend")

# -------------------- SmartTurn --------------------
smart_turn = SmartTurnV3(threshold=0.4)

# -------------------- TTS --------------------

tts = create_tts(
    engine="kokoro",
    lang_code="a",
    voice="af_heart",
    speed=1.0,
)

# -------------------- LLM and Voice Agent --------------------

llm = StreamingInterviewLLM()

# -------------------- Progressive STT --------------------

whisper_stt = WhisperSTT()

# ------------------- VAD ---------------------

# vad expects 32ms frames but buffer collects 10ms frames -> rolling buffer added which collects till 32ms frames
VAD_WINDOW_SAMPLES = int(16000 * 0.032)  # 32ms = 512 samples

# -------------------- Downsample Audio --------------------

def downsample_48k_to_16k(pcm_int16: np.ndarray) -> np.ndarray:
    audio = pcm_int16.astype(np.float32) / 32768.0
    # Anti-alias filter + downsample (default 8th-order Chebyshev type I IIR)
    downsampled = _scipy_decimate(audio, 3, ftype='iir', zero_phase=False)
    return downsampled.astype(np.float32) 

def is_valid_transcript(text: str) -> bool:
    """Reject empty, NaN, or noise-only transcripts."""
    if not text:
        return False
    stripped = text.strip()
    if not stripped:
        return False
    if stripped.lower() in {"nan", "none", "null", "you", "thank you.", "thanks for watching!"}:
        return False
    if len(stripped) < 3:
        return False
    return True

# -------------------- CORS --------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------- Token --------------------

def create_token(identity: str, room_name: str):
    token = AccessToken(API_KEY, API_SECRET)
    token.with_identity(identity)
    token.with_grants(VideoGrants(room_join=True, room=room_name))
    return token.to_jwt()

ROLE_PRESETS = {
    "Full Stack Developer": {
        "job_description": "Entry-level Full Stack Developer role focused on building and maintaining web applications across both frontend and backend. The role involves developing responsive user interfaces, designing and consuming APIs, working with databases, and understanding basic system design principles. Candidates are expected to have a strong foundation in JavaScript, familiarity with modern frontend frameworks, and basic backend development knowledge. Emphasis is placed on problem-solving ability, clean coding practices, and understanding of end-to-end application flow.",
        "list_of_technical_topics": "HTML, CSS, JavaScript, React, Node.js, Express.js, REST APIs, CRUD operations, authentication basics, MongoDB/SQL, data structures, asynchronous programming, Git, debugging, system design basics, HTTP/HTTPS, browser rendering, state management",
        "interviewer_name": "Kate"
    },
    "AI Engineer": {
        "job_description": "AI Engineer focused on designing, developing, and deploying machine learning models and artificial intelligence solutions. Responsibilities include working on natural language processing, computer vision, and predictive analytics. Candidates need a strong background in Python, PyTorch or TensorFlow, data preprocessing, and understanding of transformer architectures.",
        "list_of_technical_topics": "Python, Machine Learning, Deep Learning, Tensor Flow, PyTorch, Natural Language Processing (NLP), Computer Vision, Transformers, LLMs, Model Deployment, MLOps, Data Preprocessing, Feature Engineering, Neural Networks, Pandas, Scikit-Learn",
        "interviewer_name": "Alex"
    },
    "DevOps Engineer": {
        "job_description": "DevOps Engineer responsible for managing cloud infrastructure, creating continuous integration and deployment pipelines, and ensuring system reliability and scalability. Must have experience with containerization, orchestration, and infrastructure as code.",
        "list_of_technical_topics": "Linux, Bash Scripting, Docker, Kubernetes, CI/CD, Jenkins, GitHub Actions, AWS/GCP/Azure, Terraform, Ansible, Monitoring (Prometheus, Grafana), Networking basics, System Administration, Cloud Security",
        "interviewer_name": "Sarah"
    },
    "Electrical and Computer Science Engineer": {
        "job_description": "Electrical and Computer Science Engineer working interchangeably between hardware and software. Focuses on embedded systems, microcontrollers, digital logic design, and low-level software programming (C/C++).",
        "list_of_technical_topics": "C, C++, Embedded Systems, Microcontrollers, RTOS, Digital Logic Design, FPGA, Signal Processing, IoT, Computer Architecture, Assembly Language, Hardware-Software Co-design",
        "interviewer_name": "Michael"
    },
    "Cybersecurity": {
        "job_description": "Cybersecurity Analyst/Engineer dedicated to protecting systems and networks. Role involves penetration testing, vulnerability assessment, incident response, and implementing secure architectures.",
        "list_of_technical_topics": "Network Security, Penetration Testing, Kali Linux, Incident Response, Cryptography, OWASP Top 10, Firewalls, Threat Modeling, Malware Analysis, Cloud Security, Scripting (Python, Bash), SIEM",
        "interviewer_name": "Olivia"
    }
}

@app.get("/token")
async def token(
    user_id: str | None = Query(default=None),
    role: str | None = Query(default=None)
):
    room_name = f"interview_{uuid4().hex}"
    identity = "browser-user"

    resume_context = ""
    candidate_name = ""
    if user_id:
        try:
            profile_res = (
                supabase.table("profiles")
                .select("resume_text, resume_json, full_name")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )

            profile = None
            if profile_res.data:
                profile = profile_res.data[0] if isinstance(profile_res.data, list) else profile_res.data

            if profile:
                print(f"📊 [DEBUG] Found profile for user_id {user_id}")
                
                resume_text = (profile.get("resume_text") or "").strip()
                resume_json = profile.get("resume_json")
                
                print(f"📊 [DEBUG] resume_json keys: {list(resume_json.keys()) if isinstance(resume_json, dict) else 'Not a dict'}")
                print(f"📊 [DEBUG] resume_text length: {len(resume_text)} chars")
                
                # Prioritize name from Parsed Resume
                if resume_json and isinstance(resume_json, dict):
                    candidate_name = resume_json.get("candidate_name") or ""
                
                # Fallback to profile name only if resume name is missing
                if not candidate_name:
                    candidate_name = profile.get("full_name") or ""

                print(f"📊 [DEBUG] Resolved candidate_name: '{candidate_name}'")

                if resume_text:
                    resume_context += f"Resume Text:\n{resume_text[:3000]}\n\n"
                if resume_json:
                    resume_context += f"Resume JSON:\n{json.dumps(resume_json)[:3000]}"
                
                print(f"📊 [DEBUG] Final resume_context size: {len(resume_context)} chars")
            else:
                print(f"⚠️ [DEBUG] No profile found in Supabase for user_id: {user_id}")
        except Exception as e:
            print(f"⚠️ Could not load resume context for user {user_id}: {e}")

    token = create_token(identity, room_name)

    # Create and connect agent to same room
    # Force TURN relay: direct UDP fails on restrictive networks/firewalls
    is_cloud = LIVEKIT_URL.startswith("wss://")
    room_opts = RoomOptions(
        rtc_config=RtcConfiguration(
            ice_transport_type=IceTransportType.Value("TRANSPORT_RELAY"),
        )
    ) if is_cloud else RoomOptions()

    agent_room = Room()

    await agent_room.connect(
        LIVEKIT_URL,
        create_token("agent", room_name),
        options=room_opts,
    )

    room_states[room_name] = {
        "vad": SileroVAD(),          # <-- ADD: per-room VAD instance
        "buffer": TurnBuffer(
            sample_rate=16000,
            max_turn_seconds=8.0,
            min_speech_seconds=1.5,
            silence_trigger_ms=700,
            frame_duration_ms=10,
        ),
        "progressive_stt": ProgressiveSTTController(whisper_stt),
        "vad_buffer": np.zeros(0, dtype=np.float32),
        "tts_busy": False,
        "tts_lock": asyncio.Lock(),
        "smart_turn_cooldown": 0,     # frames until next SmartTurn check allowed
        "interview_end_sent": False,
        "repeat_task": None,
    }

    audio_source = rtc.AudioSource(sample_rate=48000, num_channels=1)

    pres_job_role = ""
    pres_desc = ""
    pres_topics = ""
    pres_interviewer = ""

    if role and role in ROLE_PRESETS:
        preset = ROLE_PRESETS[role]
        pres_job_role = role
        pres_desc = preset["job_description"]
        pres_topics = preset["list_of_technical_topics"]
        pres_interviewer = preset["interviewer_name"]

    interview_engines[room_name] = InterviewEngine(
        llm, 
        resume_context=resume_context,
        job_role=pres_job_role,
        job_description=pres_desc,
        list_of_technical_topics=pres_topics,
        interviewer_name=pres_interviewer,
        candidate_name=candidate_name
    )
    voice_agents[room_name] = StreamingVoiceAgent(llm, tts, audio_source, interview_engines[room_name])

    # Event that fires when the browser's audio track is subscribed by the agent.
    # This is the strongest signal that the browser has fully connected and can
    # receive audio — much later than participant_connected in the lifecycle.
    browser_audio_ready = asyncio.Event()

    @agent_room.on("participant_connected")
    def _on_participant_joined(participant):
        print(f"👤 Browser participant joined: {participant.identity}")

    async def start_interview():
        try:
            # Wait for the browser's mic track to arrive (up to 20s)
            # This guarantees the browser has set up WebRTC fully and subscribed
            # to the agent's audio track before we start speaking.
            try:
                await asyncio.wait_for(browser_audio_ready.wait(), timeout=20.0)
                print("✅ Browser audio track ready — starting intro")
                await asyncio.sleep(0.5)  # Tiny buffer for stability
            except asyncio.TimeoutError:
                print("⚠️ Browser audio track not received within 20s — starting intro anyway")

            state = room_states[room_name]
            async with state["tts_lock"]:
                state["tts_busy"] = True
                try:
                    stream_id = f"{room_name}:{time.time_ns()}"

                    async def on_question_update(text: str, is_final: bool):
                        await publish_new_question(room_name, text, stream_id=stream_id, is_final=is_final)

                    await voice_agents[room_name].handle_turn(
                        "",
                        asyncio.get_event_loop().time(),
                        on_question_update=on_question_update,
                    )
                finally:
                    # Clear any audio that came in while the agent was introducing itself
                    state["buffer"].reset()
                    state["progressive_stt"].reset()
                    state["vad"].reset()
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    state["smart_turn_cooldown"] = 0
                    state["tts_busy"] = False
        except Exception as e:
            print(f"⚠️ Failed to publish initial question for {room_name}: {e}")
    asyncio.create_task(start_interview())
    local_track = rtc.LocalAudioTrack.create_audio_track("tts", audio_source)

    await agent_room.local_participant.publish_track(local_track)

    audio_sources[room_name] = audio_source
    rooms[room_name] = agent_room

    @agent_room.on("track_subscribed")
    def on_track_subscribed(track, publication, participant):
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return
        # Signal that the browser is fully connected and ready to receive audio
        browser_audio_ready.set()
        # Only start audio handling if the room state still exists
        if room_name not in room_states:
            print(f"⚠️ track_subscribed for unknown room {room_name}, ignoring")
            return
        asyncio.create_task(handle_audio(track, room_name))

    @agent_room.on("disconnected")
    def on_disconnect():
        print(f"🧹 Cleaning up room {room_name} (Agent disconnected)")
        cleanup_room(room_name)

        @agent_room.on("participant_disconnected")
        def on_participant_disconnected(participant):
            # If room already cleaned up, ignore repeated disconnect events
            if room_name not in rooms:
                return
            print(f"👋 User left room {room_name}. Force cleaning...")
            cleanup_room(room_name)

    @agent_room.on("data_received")
    def on_data_received(data: rtc.DataPacket):
      try:
        msg = json.loads(data.data.decode())
        event = msg.get("event")
        state = room_states.get(room_name)
        if not state: return

        if event == "pause":
          print(f"⏸ Pause received for {room_name}")
          state["tts_busy"] = True # Blocks audio processing
          state["buffer"].reset()
          state["progressive_stt"].reset()

          if state.get("repeat_task"):
            state["repeat_task"].cancel()
            state["repeat_task"] = None

          if room_name in voice_agents:
            voice_agents[room_name].stop_tts() # Stop current speech

        if event == "repeat_question":
          print(f"▶️ Resume/Repeat received for {room_name}")
          state["tts_busy"] = True # Block STT immediately
          state["buffer"].reset()
          state["progressive_stt"].reset()
          
          if state.get("repeat_task"):
            state["repeat_task"].cancel()

          if room_name in voice_agents:
            async def re_ask():
              async with state["tts_lock"]:
                try:
                  last_q = interview_engines[room_name].get_last_question()
                  if last_q:
                    async def on_update(text, final): 
                      await publish_new_question(room_name, text, is_final=final)
                    await voice_agents[room_name].repeat_question(last_q, on_question_update=on_update)
                except asyncio.CancelledError:
                   print(f"⚠️ re_ask task cancelled for {room_name}")
                   raise
                finally:
                   # Clear any noise captured during the repeat
                   state["buffer"].reset()
                   state["progressive_stt"].reset()
                   state["tts_busy"] = False
                   state["repeat_task"] = None
            
            state["repeat_task"] = asyncio.create_task(re_ask())

      except Exception as e:
        print(f"⚠️ Error handling data packet: {e}")

    def cleanup_room(name):
        rooms.pop(name, None)
        room_states.pop(name, None)
        voice_agents.pop(name, None)
        interview_engines.pop(name, None)
        audio_sources.pop(name, None)

    return {
        "token": token,
        "room": room_name,
    }

@app.post("/api/parse-resume")
async def parse_resume(
    file: UploadFile = File(...), 
    user_id: str = Form(...),
    user_email: str = Form(...),
    user_full_name: str = Form(...) # Received from Auth metadata
):
    try:
        # 1. Text Extraction
        pdf_content = await file.read()
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        raw_text = "".join([page.get_text() for page in doc])
        doc.close()

        # 2. AI Parsing
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={GEMINI_API_KEY}"
        
        payload = {
            "contents": [{
                "parts": [{
                    "text": (
                        "Extract candidate_name (string), skills (list), and experience (list of objects) "
                        "from this resume. Return ONLY raw JSON with keys: candidate_name, skills, experience. "
                        f"Resume text: {raw_text}"
                    )
                }]
            }],
            "generationConfig": {"response_mime_type": "application/json"}
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=40.0)
            ai_data = json.loads(response.json()['candidates'][0]['content']['parts'][0]['text'])

        # 3. Database Upsert
        supabase.table("profiles").upsert({
            "id": user_id, 
            "email": user_email,           # Auth Email
            "full_name": user_full_name,   # Auth Name
            "resume_text": raw_text,
            "resume_json": ai_data,
            "updated_at": "now()"
        }).execute()

        return {"status": "success", "data": ai_data}

    except Exception as e:
        print(f"❌ Resume Parsing Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/interview-sessions/finalize")
async def finalize_interview_session(payload: FinalizeInterviewSessionPayload):
    try:
        all_chunks: list[ChunkMetricModel] = []
        for question in payload.question_metrics_json:
            all_chunks.extend(question.chunks)

        row = {
            "session_id": payload.session_id,
            "user_id": payload.user_id,
            "started_at": payload.started_at,
            "completed_at": payload.completed_at,
            # Use exclude_none to avoid sending candidate_answer if it's not supported/present
            "question_metrics_json": [q.model_dump(exclude_none=True) for q in payload.question_metrics_json],
            "overall_confidence_score": _clamp_01(_safe_mean([c.confidence_score for c in all_chunks])),
            "overall_voice_score": _clamp_01(_safe_mean([c.voice_score for c in all_chunks])),
            "total_questions": len(payload.question_metrics_json),
            "total_chunks": len(all_chunks),
            **_compute_overall_gaze(all_chunks),
        }

        if payload.llm_evaluation_json:
            row["llm_evaluation_json"] = payload.llm_evaluation_json

        try:
            supabase.table("interview_sessions").upsert(row, on_conflict="session_id").execute()
        except Exception as db_err:
            # Fallback for missing columns
            err_msg = str(db_err)
            if "llm_evaluation_json" in err_msg or "PGRST204" in err_msg:
                print("⚠️ Supabase column 'llm_evaluation_json' missing. Retrying without it...")
                row.pop("llm_evaluation_json", None)
                supabase.table("interview_sessions").upsert(row, on_conflict="session_id").execute()
            else:
                raise db_err

        return {
            "status": "success",
            "session_id": payload.session_id,
            "total_questions": row["total_questions"],
            "total_chunks": row["total_chunks"],
        }
    except Exception as e:
        print(f"❌ Session finalize error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# -------------------- LiveKit Agent --------------------
async def handle_audio(track: rtc.RemoteAudioTrack, room_name: str):
    # Defensive guards: room may have been cleaned up before this task runs
    state = room_states.get(room_name)
    voice_agent = voice_agents.get(room_name)
    if state is None or voice_agent is None:
        print(f"⚠️ handle_audio called for missing room state {room_name}, aborting audio handler")
        return
    buffer = state["buffer"]
    progressive_stt = state["progressive_stt"]
    stream = AudioStream(track)

    async for event in stream:
       
        if state["tts_busy"]:
            continue
        
        frame = event.frame

        pcm_int16 = np.frombuffer(frame.data, dtype=np.int16)
        pcm_16k = downsample_48k_to_16k(pcm_int16)

        # Guard: reject corrupted frames from WebRTC
        if np.isnan(pcm_16k).any() or np.isinf(pcm_16k).any():
            continue

        # ---- Accumulate until 32ms ----
        state["vad_buffer"] = np.concatenate([state["vad_buffer"], pcm_16k])

        if len(state["vad_buffer"]) >= VAD_WINDOW_SAMPLES:
            vad_chunk = state["vad_buffer"][:VAD_WINDOW_SAMPLES]
            state["vad_buffer"] = state["vad_buffer"][VAD_WINDOW_SAMPLES:]

            is_speaking = state["vad"].process_frame(vad_chunk)

            if is_speaking:
                buffer.add_speech_frame(vad_chunk)
                state["smart_turn_cooldown"] = 0  # new speech resets cooldown
            else:
                buffer.add_silence_frame(vad_chunk)

            asyncio.create_task(progressive_stt.maybe_process(buffer))

            if buffer.should_check_turn() and state["smart_turn_cooldown"] <= 0:
                state["smart_turn_cooldown"] = 25  # re-check after 25 more silence frames (~250ms at 10ms/frame)

                audio_8s = buffer.get_audio_for_smart_turn()
                is_complete, prob = smart_turn.is_end_of_turn(audio_8s)

                if not is_complete:
                    print(f"⏳ SmartTurn rejected (p={prob:.3f}), waiting...")
                    continue

                turn_start_time = asyncio.get_event_loop().time()
                print(f"🟢 SmartTurn confirmed end of turn (p={prob:.3f})")
                transcript = await progressive_stt.finalize(buffer)

                if not is_valid_transcript(transcript):
                    print(f"⚠️ Invalid transcript rejected: '{transcript}'")
                    # Reset and continue listening — do NOT send to LLM
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    buffer.reset()
                    progressive_stt.reset()
                    state["vad"].reset()
                    state["smart_turn_cooldown"] = 0
                    continue

                print(f"\n📝 Final Transcript:\n {transcript}")
                stt_done_time = asyncio.get_event_loop().time()
                print(f"⏱ STT Latency: {stt_done_time - turn_start_time:.3f}s")

                # Publish turn_end data message to LiveKit room so frontend flushes video
                agent_room_ref = rooms.get(room_name)
                if not agent_room_ref:
                    print(f"⚠️ agent room missing when publishing turn_end for {room_name}, skipping")
                else:
                    await agent_room_ref.local_participant.publish_data(
                        json.dumps({
                            "event": "turn_end", 
                            "ts": time.time(),
                            "transcript": transcript  # Added transcript text
                        }).encode(),
                        reliable=True,
                    )
                    print("📡 Sent turn_end to frontend")

                async with state["tts_lock"]:
                    buffer.reset()
                    progressive_stt.reset()
                    state["vad"].reset()
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    state["smart_turn_cooldown"] = 0

                    state["tts_busy"] = True
                    try:
                        stream_id = f"{room_name}:{time.time_ns()}"

                        async def on_question_update(text: str, is_final: bool):
                            await publish_new_question(room_name, text, stream_id=stream_id, is_final=is_final)

                        generated_question = await voice_agent.handle_turn(
                            transcript,
                            stt_done_time,
                            on_question_update=on_question_update,
                        )

                        if voice_agent.interview_engine.interview_end and not state.get("interview_end_sent", False):
                            state["interview_end_sent"] = True
                            await publish_interview_end(room_name)
                    except Exception as e:
                        print(f"⚠️ Failed to handle/publish AI question for {room_name}: {e}")
                    finally:
                        # Reset everything AGAIN after speaking to ensure 
                        # any "barge-in" audio recorded during TTS is discarded
                        buffer.reset()
                        progressive_stt.reset()
                        state["vad"].reset()
                        state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                        state["smart_turn_cooldown"] = 0
                        
                        state["tts_busy"] = False
            elif state["smart_turn_cooldown"] > 0:
                state["smart_turn_cooldown"] -= 1