import asyncio
import json
import logging
import sys
import numpy as np
import cv2
from livekit import rtc
from collections import deque
from pathlib import Path

# Add Vision directory to path
sys.path.insert(0, str(Path(__file__).parent))
from l2cs_gaze import L2CSGazeAnalyzer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("webrtc_worker")

async def main():
    if len(sys.argv) < 5:
        print("Usage: python webrtc_worker.py <url> <token> <participant_identity> <session_id>")
        sys.exit(1)

    url = sys.argv[1]
    token = sys.argv[2]
    participant_identity = sys.argv[3]
    session_id = sys.argv[4]

    logger.info(f"Starting WebRTC worker for session {session_id}, waiting for {participant_identity}")

    analyzer = L2CSGazeAnalyzer(weights_path=Path(__file__).parent / "models" / "L2CSNet_gaze360.pkl")
    analyzer.load()
    logger.info("L2CS-Net loaded")

    room = rtc.Room()

    score_history = deque(maxlen=30)
    frame_index = 0
    fps = 30.0
    sample_every = max(1, round(fps / 2.0))
    video_task = None
    
    # We will accumulate gaze metrics over 15 seconds (like chunks) to be compatible with frontend!
    # A chunk is 15 seconds * 2 FPS = 30 frames.
    chunk_frames = []
    chunk_index = 0
    chunk_id_base = session_id
    
    async def flush_chunk():
        nonlocal chunk_frames, chunk_index
        if not chunk_frames:
            return
            
        chunk_id = f"{chunk_id_base}-chunk-{chunk_index}"
        payload = {
            "event": "chunk_processed", # Use 'event' to match useConvFlowRoom.ts
            "chunk_id": chunk_id,
            "chunk_index": chunk_index,
            "gaze_data": list(chunk_frames)
        }
        
        data = json.dumps(payload).encode("utf-8")
        try:
            await room.local_participant.publish_data(data, reliable=True)
            logger.info(f"Published chunk {chunk_index} with {len(chunk_frames)} frames")
        except Exception as e:
            logger.error(f"Failed to publish chunk {chunk_index}: {e}")
            
        chunk_frames = []
        chunk_index += 1

    @room.on("track_subscribed")
    def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        nonlocal video_task
        logger.info(f"Track subscribed from {participant.identity}, kind={track.kind}")
        if track.kind == rtc.TrackKind.KIND_VIDEO:
            logger.info("Found video track! Starting analysis loop...")
            video_task = asyncio.create_task(process_video_track(track))
            
    @room.on("disconnected")
    def on_disconnected():
        logger.info("Room disconnected, exiting worker. Flushing final chunks...")
        if len(chunk_frames) > 0:
            # Create a synchronous task or run until complete to ensure it flushes
            try:
                loop = asyncio.get_event_loop()
                loop.create_task(flush_chunk())
                # Delay slightly to allow the publish to go through before stopping
                loop.call_later(1.0, loop.stop)
            except Exception as e:
                logger.error(f"Error flushing chunks on disconnect: {e}")
        else:
            asyncio.get_event_loop().stop()

    @room.on("data_received")
    def on_data_received(data_packet: rtc.DataPacket):
        try:
            msg = json.loads(data_packet.data.decode("utf-8"))
            event = msg.get("event")
            if event == "turn_end" or (event == "new_question" and msg.get("is_final") is True):
                logger.info(f"Received {event} (is_final={msg.get('is_final', 'N/A')}), flushing current video chunk at turn boundary!")
                asyncio.create_task(flush_chunk())
        except Exception:
            pass

    async def process_video_track(track: rtc.RemoteVideoTrack):
        nonlocal frame_index, score_history, chunk_frames
        video_stream = rtc.VideoStream(track)
        
        async for frame in video_stream:
            if frame_index % sample_every != 0:
                frame_index += 1
                continue
                
            try:
                # Ensure correct color conversion so L2CS-Net receives proper BGR
                video_frame = frame.frame if hasattr(frame, 'frame') else frame
                rgb_frame = video_frame.convert(rtc.VideoBufferType.RGB24)
                arr = np.frombuffer(rgb_frame.data, dtype=np.uint8).reshape((rgb_frame.height, rgb_frame.width, 3))
                # RGB24 -> Convert to BGR for OpenCV
                img_bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
                
                result = analyzer.analyze_frame(img_bgr, frame_index, fps, score_history)
                chunk_frames.append(result)
                
                # Fallback flush if the user talks for more than 5 minutes continuously (600 frames)
                if len(chunk_frames) >= 600:
                    await flush_chunk()
                    
            except Exception as e:
                logger.error(f"Error processing frame: {e}")
                
            frame_index += 1

    await room.connect(url, token)
    logger.info("Connected to room!")

    try:
        while True:
            await asyncio.sleep(1)
            # Check if we should flush remaining if no frames for a while? 
            # Or just flush at end.
    except asyncio.CancelledError:
        pass
    finally:
        await flush_chunk() # flush remaining
        await room.disconnect()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("\n\nCRITICAL ERROR! The Vision Agent Crashed.")
        print("Please take a screenshot of this error for debugging.")
        input("Press Enter to close this window...")
        import sys
        sys.exit(1)
