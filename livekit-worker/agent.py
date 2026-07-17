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
from ai_analyzer import VisionAnalyzer
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
    
    # We will lock in start_time the exact moment the first frame arrives
    # to perfectly sync with the frontend's local video recorder.
    room_state = {"start_time": None}

    logger.info("Initializing AI Analyzers (this may take a few seconds)...")
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
                
                if room_state["start_time"] is None:
                    room_state["start_time"] = asyncio.get_event_loop().time()
                    
                frame = event.frame
                video_frame = frame.frame if hasattr(frame, 'frame') else frame
                arr = np.frombuffer(video_frame.data, dtype=np.uint8).reshape((video_frame.height, video_frame.width, 3))
                
                vision_result = vision_analyzer.process_frame(arr)
                
                current_time = asyncio.get_event_loop().time()
                elapsed_seconds = current_time - room_state["start_time"]
                
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
        # Cancel all tasks associated with this participant
        for track_sid, pub in participant.track_publications.items():
            if track_sid in buffer_tasks:
                logger.info(f"Cancelling task for disconnected participant's track {track_sid}")
                buffer_tasks[track_sid].cancel()
                del buffer_tasks[track_sid]
        
        # If this is the browser-user, we should shutdown the timeline agent
        if participant.identity == "browser-user":
            logger.info("Main browser-user disconnected. Shutting down timeline agent.")
            shutdown_event.set()

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
        if publication.sid in buffer_tasks:
            logger.info(f"Cancelling task for unsubscribed track {publication.sid}")
            buffer_tasks[publication.sid].cancel()
            del buffer_tasks[publication.sid]
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