import ssl
import certifi

orig_create_default_context = ssl.create_default_context
def patched_create_default_context(purpose=ssl.Purpose.SERVER_AUTH, *, cafile=None, capath=None, cadata=None):
    if cafile is None:
        cafile = certifi.where()
    return orig_create_default_context(purpose=purpose, cafile=cafile, capath=capath, cadata=cadata)

ssl.create_default_context = patched_create_default_context
ssl._create_default_https_context = patched_create_default_context

import asyncio
import logging
import os
from pathlib import Path
from dotenv import load_dotenv

# Explicitly load root .env to prevent LiveKit connection gaps
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

from livekit import rtc

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("livekit-worker")

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from ai_analyzer import SpeechAnalyzer, VisionAnalyzer
from convFlow.database import SessionLocal
from convFlow.models import InterviewTimeline

def insert_telemetry_sync(session_id: str, timestamp: float, metric_type: str, is_red: bool, raw_data: dict):
    db = SessionLocal()
    try:
        event = InterviewTimeline(
            session_id=session_id,
            timestamp_seconds=timestamp,
            metric_type=metric_type,
            is_red_flag=is_red,
            raw_data_json=raw_data
        )
        db.add(event)
        db.commit()
    except Exception as e:
        logger.error(f"DB Error: {e}")
        db.rollback()
    finally:
        db.close()

async def save_telemetry(session_id: str, timestamp: float, metric_type: str, is_red: bool, raw_data: dict):
    await asyncio.to_thread(insert_telemetry_sync, session_id, timestamp, metric_type, is_red, raw_data)

VIDEO_KIND = rtc.TrackKind.Value("KIND_VIDEO")
AUDIO_KIND = rtc.TrackKind.Value("KIND_AUDIO")


async def main_async(url: str, token: str, session_id: str) -> None:
    room = rtc.Room()
    shutdown_event = asyncio.Event()
    buffer_tasks: dict[str, asyncio.Task[None]] = {}
    
    # Store when the room started to calculate accurate timeline seconds
    start_time = asyncio.get_event_loop().time()

    logger.info("Initializing AI Analyzers (this may take a few seconds)...")
    speech_analyzer = SpeechAnalyzer()
    vision_analyzer = VisionAnalyzer()
    logger.info("AI Analyzers successfully loaded into VRAM/RAM.")

    logger.info(
        "Timeline Agent connected to room",
        extra={"room": room.name},
    )

    async def process_video_track(
        track: rtc.RemoteVideoTrack,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        stream = rtc.VideoStream(track, format=rtc.VideoBufferType.RGB24)
        frame_counter = 0
        chunk_frames = []
        chunk_index = 0
        import json
        from datetime import datetime, timezone
        
        try:
            async for event in stream:
                frame_counter += 1
                # Sample roughly ~10 frames per second to save CPU while maintaining gaze accuracy
                if frame_counter % 3 != 0:
                    continue
                
                frame = event.frame
                video_frame = frame.frame if hasattr(frame, 'frame') else frame
                arr = np.frombuffer(video_frame.data, dtype=np.uint8).reshape((video_frame.height, video_frame.width, 3))
                
                vision_result = vision_analyzer.process_frame(arr)
                
                current_time = asyncio.get_event_loop().time()
                elapsed_seconds = current_time - start_time
                
                # Accumulate gaze data for frontend
                chunk_frames.append({
                    "timestamp": f"{elapsed_seconds:.3f}",
                    "captured_at": datetime.now(timezone.utc).isoformat(),
                    "status": vision_result.get("gaze_direction", "Looking Away"),
                    "face_count": 1 if vision_result.get("face_detected") else 0,
                    "multiple_faces": False,
                    "yaw": 0.0,
                    "pitch": 0.0,
                    "frame_score": vision_result.get("camera_engagement", 0.0) * 5.0,
                    "rolling_score": vision_result.get("camera_engagement", 0.0) * 5.0,
                    "camera_engagement": vision_result.get("camera_engagement", 0.0)
                })
                
                # Every 3 seconds (~30 frames at 10FPS), flush the chunk to the frontend
                if len(chunk_frames) >= 30:
                    chunk_id = f"{room.name}-chunk-{chunk_index}"
                    payload = {
                        "event": "chunk_processed",
                        "chunk_id": chunk_id,
                        "chunk_index": chunk_index,
                        "gaze_data": chunk_frames
                    }
                    try:
                        await room.local_participant.publish_data(
                            json.dumps(payload).encode("utf-8"),
                            reliable=True
                        )
                    except Exception as e:
                        logger.error(f"Failed to publish gaze chunk: {e}")
                        
                    chunk_frames = []
                    chunk_index += 1
                # Every 3 seconds (30 iterations since we sample every 3rd frame of 30FPS stream), save standard vision telemetry
                if len(chunk_frames) % 30 == 0:
                    # Convert top_emotions list to dictionary format expected by frontend
                    emotions_dict = {
                        e["name"]: e["score"] for e in vision_result.get("top_emotions", [])
                    }
                    
                    formatted_vision_data = {
                        "emotions": emotions_dict,
                        "is_red_flag_eye": vision_result.get("is_red_flag_eye", False),
                        "is_red_flag_emotion": False # Can be calculated based on thresholds
                    }
                    
                    await save_telemetry(
                        session_id=room.name,
                        timestamp=elapsed_seconds,
                        metric_type="VISION",
                        is_red=False,
                        raw_data=formatted_vision_data
                    )
                    
                # We log red flags as they happen in real-time
                if vision_result.get("is_red_flag_eye"):
                    logger.info("Vision Telemetry Red Flag", extra={"result": vision_result})
                    
                    # Convert top_emotions list to dictionary format
                    emotions_dict = {
                        e["name"]: e["score"] for e in vision_result.get("top_emotions", [])
                    }
                    
                    formatted_vision_data = {
                        "emotions": emotions_dict,
                        "is_red_flag_eye": True,
                        "is_red_flag_emotion": False
                    }
                    
                    await save_telemetry(
                        session_id=room.name,
                        timestamp=elapsed_seconds,
                        metric_type="VISION",
                        is_red=True,
                        raw_data=formatted_vision_data
                    )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("video track processing failed")
        finally:
            await stream.aclose()

    async def process_audio_track(
        track: rtc.RemoteAudioTrack,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        stream = rtc.AudioStream(track)
        audio_buffer = []
        chunk_index = 0
        try:
            async for event in stream:
                frame = event.frame
                sample_rate = frame.sample_rate
                
                audio_array = np.frombuffer(frame.data, dtype=np.int16).astype(np.float32) / 32768.0
                
                # If stereo, average channels to mono
                if hasattr(frame, 'num_channels') and frame.num_channels > 1:
                    audio_array = audio_array.reshape(-1, frame.num_channels).mean(axis=1)

                audio_buffer.append(audio_array)
                
                # Collect exactly 3 seconds of audio for Wav2Vec2
                total_samples = sum(len(a) for a in audio_buffer)
                if total_samples >= sample_rate * 3:
                    full_audio = np.concatenate(audio_buffer)
                    
                    # Decimate to 16000Hz if the stream is 48000Hz (LiveKit default)
                    if sample_rate >= 48000:
                        ratio = sample_rate // 16000
                        full_audio = full_audio[::ratio]
                        
                    try:
                        speech_result = speech_analyzer.process_chunk(full_audio)
                    except Exception as e:
                        logger.error(f"Speech Analyzer error: {e}")
                        speech_result = {"status": "ERROR", "label": "FLUENT", "confidence": 1.0, "is_red_flag": False}
                    logger.info("Audio Telemetry", extra={"result": speech_result})
                    
                    await save_telemetry(
                        session_id=room.name,
                        timestamp=chunk_index * 3.0, # Exact timestamp
                        metric_type="SPEECH",
                        is_red=speech_result.get("is_red_flag", False),
                        raw_data=speech_result
                    )
                    audio_buffer = []
                    chunk_index += 1
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("audio track processing failed")
        finally:
            await stream.aclose()

    def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
        logger.info(
            "participant connected",
            extra={"room": room.name, "participant": participant.identity},
        )

    def on_participant_disconnected(participant: rtc.RemoteParticipant) -> None:
        logger.info(
            "participant disconnected",
            extra={"room": room.name, "participant": participant.identity},
        )

    def on_track_subscribed(
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        is_video_track = publication.kind == VIDEO_KIND and isinstance(track, rtc.RemoteVideoTrack)
        logger.info(
            "track subscribed",
            extra={
                "room": room.name,
                "participant": participant.identity,
                "track_sid": publication.sid,
                "track_kind": publication.kind,
                "is_video": is_video_track,
            },
        )

        if is_video_track:
            if publication.sid not in buffer_tasks:
                buffer_tasks[publication.sid] = asyncio.create_task(
                    process_video_track(track, publication, participant)
                )
            logger.info("video track ready for real-time AI processing", extra={"room": room.name})
            
        elif publication.kind == AUDIO_KIND and isinstance(track, rtc.RemoteAudioTrack):
            if publication.sid not in buffer_tasks:
                buffer_tasks[publication.sid] = asyncio.create_task(
                    process_audio_track(track, publication, participant)
                )
            logger.info("audio track ready for AI processing", extra={"room": room.name})

    def on_track_unsubscribed(
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        logger.info(
            "track unsubscribed",
            extra={
                "room": room.name,
                "participant": participant.identity,
                "track_sid": publication.sid,
            },
        )
        task = buffer_tasks.pop(publication.sid, None)
        if task is not None:
            task.cancel()

    def on_disconnected() -> None:
        logger.info("room disconnected", extra={"room": room.name})
        for task in buffer_tasks.values():
            task.cancel()
        shutdown_event.set()

    room.on("participant_connected", on_participant_connected)
    room.on("participant_disconnected", on_participant_disconnected)
    room.on("track_subscribed", on_track_subscribed)
    room.on("track_unsubscribed", on_track_unsubscribed)
    room.on("disconnected", on_disconnected)

    await room.connect(url, token)
    logger.info(
        "Timeline Agent primary connected",
        extra={"room": room.name},
    )

    await shutdown_event.wait()
    await room.disconnect()

def main() -> None:
    if len(sys.argv) < 5:
        print("Usage: python agent.py <url> <token> <participant_identity> <session_id>")
        sys.exit(1)

    url = sys.argv[1]
    token = sys.argv[2]
    identity = sys.argv[3]
    session_id = sys.argv[4]

    logger.info(f"Starting LiveKit Timeline Agent for session {session_id}")
    try:
        asyncio.run(main_async(url, token, session_id))
    except Exception as e:
        logger.error(f"Fatal error in Timeline Agent: {e}", exc_info=True)
        print("\n\nCRITICAL ERROR! The Agent Crashed.")
        print("Please take a screenshot of this error for debugging.")
        input("Press Enter to close this window...")
        sys.exit(1)


if __name__ == "__main__":
    main()