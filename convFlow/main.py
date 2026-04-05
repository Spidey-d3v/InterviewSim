import asyncio
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
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

@app.get("/token")
async def token():
    room_name = f"interview_{uuid4().hex}"
    identity = "browser-user"

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
    }

    audio_source = rtc.AudioSource(sample_rate=48000, num_channels=1)
    interview_engines[room_name] = InterviewEngine(llm)
    voice_agents[room_name] = StreamingVoiceAgent(llm, tts, audio_source, interview_engines[room_name])
    async def start_interview():
        await asyncio.sleep(1)
        await voice_agents[room_name].handle_turn("", asyncio.get_event_loop().time())
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
                    "text": f"Extract ONLY skills (list) and experience (list of objects) from this resume. Return raw JSON: {raw_text}"
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
                    json.dumps({"event": "turn_end", "ts": time.time()}).encode(),
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
                    await voice_agent.handle_turn(transcript, stt_done_time)
                    state["tts_busy"] = False