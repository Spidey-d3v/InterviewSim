import asyncio
import numpy as np
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from livekit import rtc
from livekit.rtc import Room, AudioStream
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

load_dotenv()

# Initialize Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

LIVEKIT_URL = "ws://localhost:7880"
API_KEY = "devkey"
API_SECRET = "APISECRETdevkey1234567890ABCDEFG"

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
    facial_expression_score: Optional[float] = None
    voice_score: Optional[float] = None
    gaze_distribution: GazeDistributionModel = Field(default_factory=GazeDistributionModel)


class QuestionMetricModel(BaseModel):
    question_index: int
    question_text: str
    chunks: list[ChunkMetricModel] = Field(default_factory=list)


class FinalizeInterviewSessionPayload(BaseModel):
    session_id: str
    user_id: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    question_metrics_json: list[QuestionMetricModel] = Field(default_factory=list)


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
smart_turn = SmartTurnV3(threshold=0.5)

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

vad = SileroVAD()

# vad expects 32ms frames but buffer collects 10ms frames -> rolling buffer added which collects till 32ms frames
vad_buffer = np.zeros(0, dtype=np.float32)
VAD_WINDOW_SAMPLES = int(16000 * 0.032)  # 32ms = 512 samples

# -------------------- Downsample Audio --------------------

def downsample_48k_to_16k(pcm_int16: np.ndarray) -> np.ndarray:
    # Convert to float32 in range [-1, 1]
    audio = pcm_int16.astype(np.float32) / 32768.0
    
    # Downsample by factor of 3 (48k → 16k)
    return audio[::3] 

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
    if user_id:
        try:
            profile_res = (
                supabase.table("profiles")
                .select("resume_text, resume_json")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )

            profile = None
            if profile_res.data:
                profile = profile_res.data[0] if isinstance(profile_res.data, list) else profile_res.data

            if profile:
                resume_text = (profile.get("resume_text") or "").strip()
                resume_json = profile.get("resume_json")

                if resume_text:
                    resume_context += f"Resume Text:\n{resume_text[:3000]}\n\n"
                if resume_json:
                    resume_context += f"Resume JSON:\n{json.dumps(resume_json)[:3000]}"
        except Exception as e:
            print(f"⚠️ Could not load resume context for user {user_id}: {e}")

    token = create_token(identity, room_name)

    # Create and connect agent to same room
    agent_room = Room()

    await agent_room.connect(
        LIVEKIT_URL,
        create_token("agent", room_name)
    )

    room_states[room_name] = {
        "buffer": TurnBuffer(
            sample_rate=16000,
            max_turn_seconds=8.0,
            min_speech_seconds=1.5,
            silence_trigger_ms=1000,
            frame_duration_ms=10,
        ),
        "progressive_stt": ProgressiveSTTController(whisper_stt),
        "vad_buffer": np.zeros(0, dtype=np.float32),
        "tts_busy": False,
        "tts_lock": asyncio.Lock(),
        "smart_turn_checked": False,
        "interview_end_sent": False,
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
        interviewer_name=pres_interviewer
    )
    voice_agents[room_name] = StreamingVoiceAgent(llm, tts, audio_source, interview_engines[room_name])
    async def start_interview():
        try:
            await asyncio.sleep(1)
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
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    state["smart_turn_checked"] = False
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
        asyncio.create_task(handle_audio(track, room_name))

    @agent_room.on("disconnected")
    def on_disconnect():
        print(f"🧹 Cleaning up room {room_name} (Agent disconnected)")
        cleanup_room(room_name)

    @agent_room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        print(f"👋 User left room {room_name}. Force cleaning...")
        cleanup_room(room_name)

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
            "question_metrics_json": [q.model_dump() for q in payload.question_metrics_json],
            "overall_confidence_score": _clamp_01(_safe_mean([c.confidence_score for c in all_chunks])),
            "overall_facial_expression_score": _clamp_01(_safe_mean([c.facial_expression_score for c in all_chunks])),
            "overall_voice_score": _clamp_01(_safe_mean([c.voice_score for c in all_chunks])),
            "total_questions": len(payload.question_metrics_json),
            "total_chunks": len(all_chunks),
            **_compute_overall_gaze(all_chunks),
        }

        supabase.table("interview_sessions").upsert(row, on_conflict="session_id").execute()

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
    state = room_states[room_name]
    voice_agent = voice_agents[room_name]
    buffer = state["buffer"]
    progressive_stt = state["progressive_stt"]
    stream = AudioStream(track)

    async for event in stream:
       
        if state["tts_busy"]:
            continue
        
        frame = event.frame

        pcm_int16 = np.frombuffer(frame.data, dtype=np.int16)
        pcm_16k = downsample_48k_to_16k(pcm_int16)

        # ---- Accumulate until 32ms ----
        state["vad_buffer"] = np.concatenate([state["vad_buffer"], pcm_16k])

        if len(state["vad_buffer"]) >= VAD_WINDOW_SAMPLES:
            vad_chunk = state["vad_buffer"][:VAD_WINDOW_SAMPLES]
            state["vad_buffer"] = state["vad_buffer"][VAD_WINDOW_SAMPLES:]

            is_speaking = vad.process_frame(vad_chunk)

            if is_speaking:
                buffer.add_speech_frame(vad_chunk)
                state["smart_turn_checked"] = False  # new speech resets SmartTurn debounce
            else:
                buffer.add_silence_frame(vad_chunk)

            asyncio.create_task(progressive_stt.maybe_process(buffer))

            if buffer.should_check_turn() and not state["smart_turn_checked"]:
                state["smart_turn_checked"] = True  # debounce — prevents spin on subsequent silence frames

                audio_8s = buffer.get_audio_for_smart_turn()
                is_complete, prob = smart_turn.is_end_of_turn(audio_8s)

                if not is_complete:
                    print(f"⏳ SmartTurn rejected (p={prob:.3f}), waiting...")
                    continue  # safe because smart_turn_checked=True blocks re-entry until new speech

                turn_start_time = asyncio.get_event_loop().time()
                print(f"🟢 SmartTurn confirmed end of turn (p={prob:.3f})")
                transcript = await progressive_stt.finalize(buffer)

                print(f"\n📝 Final Transcript:\n {transcript}")
                stt_done_time = asyncio.get_event_loop().time()
                print(f"⏱ STT Latency: {stt_done_time - turn_start_time:.3f}s")

                # Publish turn_end data message to LiveKit room so frontend flushes video
                agent_room_ref = rooms[room_name]
                await agent_room_ref.local_participant.publish_data(
                    json.dumps({"event": "turn_end", "ts": time.time(), "transcript": transcript}).encode(),
                    reliable=True,
                )
                print("📡 Sent turn_end to frontend")

                state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                buffer.reset()
                progressive_stt.reset()

                async with state["tts_lock"]:
                    buffer.reset()
                    progressive_stt.reset()
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    state["smart_turn_checked"] = False  # reset for next turn

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
                        state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                        state["smart_turn_checked"] = False
                        
                        state["tts_busy"] = False