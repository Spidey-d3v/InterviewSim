import inspect
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from livekit import rtc


ChunkCallback = Callable[["VideoChunk"], Awaitable[None] | None]


@dataclass(slots=True)
class BufferedFrame:
    timestamp_us: int
    width: int
    height: int
    buffer_type: int
    data: bytes


@dataclass(slots=True)
class VideoChunk:
    chunk_index: int
    track_sid: str
    participant_identity: str
    started_at_us: int
    ended_at_us: int
    duration_seconds: float
    frame_count: int
    sampled_frame_count: int
    fps_estimate: float
    frames: list[BufferedFrame] = field(default_factory=list)


class VideoChunkBuffer:
    def __init__(
        self,
        *,
        track_sid: str,
        participant_identity: str,
        chunk_seconds: float = 15.0,
        sample_every_n: int = 3,
        max_frames_per_chunk: int = 120,
    ) -> None:
        self.track_sid = track_sid
        self.participant_identity = participant_identity
        self.chunk_seconds = chunk_seconds
        self.sample_every_n = max(1, sample_every_n)
        self.max_frames_per_chunk = max_frames_per_chunk

        self._chunk_index = 0
        self._chunk_start_us: int | None = None
        self._last_timestamp_us: int | None = None
        self._frame_count = 0
        self._frames: list[BufferedFrame] = []

    async def run(self, track: rtc.Track, on_chunk: ChunkCallback) -> None:
        stream = rtc.VideoStream.from_track(track=track)
        try:
            async for event in stream:
                chunk = self.push(event)
                if chunk is not None:
                    await self._dispatch_chunk(on_chunk, chunk)

            chunk = self.flush()
            if chunk is not None:
                await self._dispatch_chunk(on_chunk, chunk)
        finally:
            await stream.aclose()

    def push(self, event: rtc.VideoFrameEvent) -> VideoChunk | None:
        if self._chunk_start_us is None:
            self._chunk_start_us = event.timestamp_us

        self._last_timestamp_us = event.timestamp_us
        self._frame_count += 1

        should_sample = (self._frame_count - 1) % self.sample_every_n == 0
        if should_sample and len(self._frames) < self.max_frames_per_chunk:
            self._frames.append(self._copy_frame(event))

        duration_seconds = self._duration_seconds
        if duration_seconds >= self.chunk_seconds:
            return self._build_chunk(reset=True)

        return None

    def flush(self) -> VideoChunk | None:
        if self._chunk_start_us is None or self._last_timestamp_us is None:
            return None
        if self._frame_count == 0:
            return None
        return self._build_chunk(reset=True)

    @property
    def _duration_seconds(self) -> float:
        if self._chunk_start_us is None or self._last_timestamp_us is None:
            return 0.0
        return max(0.0, (self._last_timestamp_us - self._chunk_start_us) / 1_000_000)

    def _build_chunk(self, *, reset: bool) -> VideoChunk:
        started_at_us = self._chunk_start_us or 0
        ended_at_us = self._last_timestamp_us or started_at_us
        duration_seconds = max(0.001, (ended_at_us - started_at_us) / 1_000_000)
        frame_count = self._frame_count
        sampled_frame_count = len(self._frames)
        fps_estimate = frame_count / duration_seconds

        chunk = VideoChunk(
            chunk_index=self._chunk_index,
            track_sid=self.track_sid,
            participant_identity=self.participant_identity,
            started_at_us=started_at_us,
            ended_at_us=ended_at_us,
            duration_seconds=duration_seconds,
            frame_count=frame_count,
            sampled_frame_count=sampled_frame_count,
            fps_estimate=fps_estimate,
            frames=list(self._frames),
        )

        if reset:
            self._chunk_index += 1
            self._chunk_start_us = None
            self._last_timestamp_us = None
            self._frame_count = 0
            self._frames = []

        return chunk

    async def _dispatch_chunk(self, on_chunk: ChunkCallback, chunk: VideoChunk) -> None:
        result = on_chunk(chunk)
        if inspect.isawaitable(result):
            await result

    @staticmethod
    def _copy_frame(event: rtc.VideoFrameEvent) -> BufferedFrame:
        frame = event.frame
        return BufferedFrame(
            timestamp_us=event.timestamp_us,
            width=frame.width,
            height=frame.height,
            buffer_type=frame.type,
            data=bytes(frame.data),
        )