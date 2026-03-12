import asyncio
import logging
import os

from livekit import rtc
from livekit.agents import AutoSubscribe, JobContext, JobProcess, JobRequest, WorkerOptions, cli

from buffer import VideoChunk, VideoChunkBuffer


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("livekit-worker")


VIDEO_KIND = rtc.TrackKind.Value("KIND_VIDEO")


def prewarm(process: JobProcess) -> None:
    logger.info("worker process initialized", extra={"pid": process.pid})


async def request_handler(request: JobRequest) -> None:
    logger.info(
        "accepting job",
        extra={"job_id": request.id, "room": request.room.name},
    )
    await request.accept(name="vision-room-worker")


async def entrypoint(context: JobContext) -> None:
    await context.connect(auto_subscribe=AutoSubscribe.SUBSCRIBE_ALL)

    room = context.room
    shutdown_event = asyncio.Event()
    buffer_tasks: dict[str, asyncio.Task[None]] = {}
    chunk_seconds = float(os.getenv("LIVEKIT_CHUNK_SECONDS", "15"))
    frame_stride = int(os.getenv("LIVEKIT_FRAME_STRIDE", "3"))

    logger.info(
        "connected to room",
        extra={"room": room.name, "job_id": context.job.id},
    )

    async def handle_video_chunk(chunk: VideoChunk) -> None:
        logger.info(
            "video chunk ready",
            extra={
                "room": room.name,
                "participant": chunk.participant_identity,
                "track_sid": chunk.track_sid,
                "chunk_index": chunk.chunk_index,
                "duration_seconds": round(chunk.duration_seconds, 3),
                "frame_count": chunk.frame_count,
                "sampled_frame_count": chunk.sampled_frame_count,
                "fps_estimate": round(chunk.fps_estimate, 2),
            },
        )

    async def buffer_video_track(
        track: rtc.RemoteVideoTrack,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        chunk_buffer = VideoChunkBuffer(
            track_sid=publication.sid,
            participant_identity=participant.identity,
            chunk_seconds=chunk_seconds,
            sample_every_n=frame_stride,
        )
        try:
            await chunk_buffer.run(track, handle_video_chunk)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "video track buffering failed",
                extra={
                    "room": room.name,
                    "participant": participant.identity,
                    "track_sid": publication.sid,
                },
            )

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
                    buffer_video_track(track, publication, participant)
                )
            logger.info(
                "video track ready for buffering",
                extra={"room": room.name, "participant": participant.identity},
            )

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

    participant = await context.wait_for_participant()
    logger.info(
        "primary participant joined",
        extra={"room": room.name, "participant": participant.identity},
    )

    await shutdown_event.wait()


def main() -> None:
    options = WorkerOptions(
        entrypoint_fnc=entrypoint,
        request_fnc=request_handler,
        prewarm_fnc=prewarm,
        agent_name="vision-room-worker",
        ws_url=os.getenv("LIVEKIT_URL", "ws://localhost:7880"),
        api_key=os.getenv("LIVEKIT_API_KEY", "devkey"),
        api_secret=os.getenv("LIVEKIT_API_SECRET", "APISECRETdevkey1234567890ABCDEFG"),
    )
    cli.run_app(options)


if __name__ == "__main__":
    main()