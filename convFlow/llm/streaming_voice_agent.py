import asyncio
import re
from typing import Awaitable, Callable
import numpy as np
from livekit import rtc


class SentenceChunker:
    def __init__(
        self,
        min_chars: int = 35,
        max_chars: int = 250,
    ):
        self.buffer = ""
        self.min_chars = min_chars
        self.max_chars = max_chars
        self.current_speaker = None
        
    async def feed(self, token: str) -> list[tuple[str | None, str]]:
        """
        Add token and return list of (speaker, sentence) tuples.
        """
        self.buffer += token
        chunks = []

        # Emit if sentence-ending punctuation
        while True:
            match = re.search(r"[.!?]\s", self.buffer)
            if not match:
                break

            idx = match.end()
            sentence = self.buffer[:idx].strip()

            if len(sentence) >= self.min_chars or len(self.buffer) >= 40:
                chunks.append((self.current_speaker, sentence))
                self.buffer = self.buffer[idx:].lstrip()
            else:
                break

        # Safety flush if too large
        if len(self.buffer) > self.max_chars:
            chunks.append((self.current_speaker, self.buffer.strip()))
            self.buffer = ""

        return chunks

    def flush(self) -> tuple[str | None, str]:
        leftover = self.buffer.strip()
        self.buffer = ""
        return (self.current_speaker, leftover)
    
class StreamingVoiceAgent:
    def __init__(self, llm, tts, audio_source, interview_engine):
        self.llm = llm
        self.tts = tts
        self.audio_source = audio_source
        self.interview_engine = interview_engine
        self.turn_start = None
        self.first_audio_emitted = None
        self.tts_queue = asyncio.Queue()
        self.tts_task_ref = None

    def _get_voice_for_speaker(self, speaker_name: str | None) -> str:
        """Map speaker name to Kokoro voice ID using panel state."""
        panel = self.interview_engine.state.get("panel", [])
        # Fallback to current interviewer if speaker_name is None
        name_to_find = speaker_name or self.interview_engine.state.get("current_interviewer")
        
        for p in panel:
            if p["name"] == name_to_find:
                return p["voice"]
        
        # Ultimate fallback
        return "af_heart"

    def stop_tts(self):
        """Immediately stop current speech generation and playback."""
        print("🔇 Stopping Agent TTS playback")
        while not self.tts_queue.empty():
            try:
                self.tts_queue.get_nowait()
                self.tts_queue.task_done()
            except: break
        
        if self.tts_task_ref:
            self.tts_task_ref.cancel()
            self.tts_task_ref = None

    async def repeat_question(
        self,
        question_text: str,
        on_question_update: Callable[[str, bool], Awaitable[None]] | None = None,
    ):
        """Force the agent to re-synthesize and speak a specific question."""
        print(f"🔄 Repeating question: {question_text[:50]}...")
        self.turn_start = asyncio.get_event_loop().time()
        self.first_audio_emitted = False
        
        if on_question_update:
            await on_question_update(question_text, True)

        self.tts_task_ref = asyncio.create_task(self._tts_worker())
        # Use current interviewer for repeat
        voice = self._get_voice_for_speaker(None)
        self.tts_queue.put_nowait((voice, question_text))
        self.tts_queue.put_nowait(None) # End signal
        await self.tts_queue.join()

    async def _tts_worker(self):
        while True:
            item = await self.tts_queue.get()
            try:
                if item is None:
                    break
                
                voice, chunk = item

                for audio_chunk in self.tts.synthesize(chunk, voice=voice):
                    if not self.first_audio_emitted:
                        now = asyncio.get_event_loop().time()
                        print(f"⏱ First Audio Latency: {now - self.turn_start:.3f}s")
                        self.first_audio_emitted = True
                    await self.publish_audio(audio_chunk)
                
                await asyncio.sleep(0.05)
            finally:
                self.tts_queue.task_done()

    async def handle_turn(
        self,
        prompt: str,
        stt_done_time: float,
        on_question_update: Callable[[str, bool], Awaitable[None]] | None = None,
    ):
        if not prompt.strip() and self.interview_engine.state["last_question"]:
            last_q = self.interview_engine.state["last_question"]
            if on_question_update and last_q:
                await on_question_update(last_q, True)
            return last_q
        
        self.turn_start = stt_done_time
        self.first_audio_emitted = False
        chunker = SentenceChunker()
        self.tts_task_ref = asyncio.create_task(self._tts_worker())
        streamed_question = ""
        last_emit_len = 0
        last_emit_ts = 0.0
        min_emit_interval_s = 0.2
        min_emit_delta_chars = 10
    
        # Stream tokens
        try:
            async for token in self.interview_engine.stream_step(prompt):
                streamed_question += token
                if on_question_update:
                    now = asyncio.get_event_loop().time()
                    should_emit = (
                        len(streamed_question.strip()) - last_emit_len >= min_emit_delta_chars
                        or token.endswith((".", "?", "!", "\n"))
                        or now - last_emit_ts >= min_emit_interval_s
                    )
                    if should_emit:
                        text = streamed_question.strip()
                        if text:
                            await on_question_update(text, False)
                            last_emit_len = len(streamed_question.strip())
                            last_emit_ts = now

                chunks = await chunker.feed(token)
                for speaker, sentence in chunks:
                    voice = self._get_voice_for_speaker(speaker)
                    await self.tts_queue.put((voice, sentence))
            
            # After ALL tokens processed
            speaker, leftover = chunker.flush()
            if leftover:
                voice = self._get_voice_for_speaker(speaker)
                await self.tts_queue.put((voice, leftover))
            
            # Signal end and wait for TTS to finish
            await self.tts_queue.put(None)
            await self.tts_task_ref
        except asyncio.CancelledError:
            print("⚠️ handle_turn cancelled")
            self.stop_tts()
            raise
        
        # Clean final question stored in state
        final_question = self.interview_engine.state.get("last_question")
        if final_question:
            self.interview_engine.state["last_question"] = final_question
            if on_question_update:
                await on_question_update(final_question, True)
        
        return self.interview_engine.state.get("last_question")
        
    # --------- HELPER ------------

    async def publish_audio(self, audio_chunk):
        # Resample 24kHz → 48kHz (simple upsample)
        audio_48k = self.upsample_linear(audio_chunk)

        # Convert float32 [-1,1] → int16 PCM
        audio_int16 = np.clip(audio_48k, -1.0, 1.0)
        audio_int16 = (audio_int16 * 32767).astype(np.int16)

        frame_size = 480  # 10ms @ 48kHz

        total_samples = len(audio_int16)

        for start in range(0, total_samples, frame_size):
            chunk = audio_int16[start:start + frame_size]

            if len(chunk) < frame_size:
                chunk = np.pad(chunk, (0, frame_size - len(chunk)))

            audio_frame = rtc.AudioFrame(
                data=chunk.tobytes(),
                sample_rate=48000,
                num_channels=1,
                samples_per_channel=frame_size,
            )

            await self.audio_source.capture_frame(audio_frame)

    def upsample_linear(self, audio_24k: np.ndarray) -> np.ndarray:
        """
        24kHz → 48kHz using linear interpolation.
        """
        if len(audio_24k) < 2:
            return np.repeat(audio_24k, 2)

        x_old = np.arange(len(audio_24k))
        x_new = np.linspace(0, len(audio_24k) - 1, len(audio_24k) * 2)

        return np.interp(x_new, x_old, audio_24k).astype(np.float32)