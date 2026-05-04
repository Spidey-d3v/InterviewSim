# Fix Audio Leaks — Implementation Plan

## Problem Statement

While the LLM/TTS is speaking, the backend continues to receive and buffer audio frames from LiveKit. Although `tts_busy` gates processing at `main.py:640`, there are **three critical timing gaps** that allow audio to leak into the pipeline:

1. **Pre-TTS gap (~200-1000ms):** Between SmartTurn confirming a turn end (line 680) and `tts_busy = True` (line 719), audio frames continue flowing through VAD → buffer → progressive STT. This accumulated audio becomes ghost input for the next turn.
2. **Post-TTS gap (immediate):** When TTS finishes and `tts_busy = False` (line 746), the reset at lines 740-744 clears the buffer but the mic immediately starts feeding frames into a freshly-reset VAD. Stale partial frames cause false speech detection → instant SmartTurn check → phantom turn end.
3. **During-TTS accumulation:** The `continue` at line 641 skips processing but LiveKit still delivers frames. When `tts_busy` flips to `False`, the very first frames contain mic settling noise and WebRTC AGC adjustments that trigger false VAD speech detections.

## Prerequisites

- All NaN fixes from `implementation_plan.md` are already applied ✅
- No existing functionality will be broken — changes are additive guards

---

## Step 1: Set `tts_busy = True` immediately after SmartTurn confirms

### [MODIFY] [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py)

**Why:** Close the pre-TTS gap. Currently `tts_busy` is only set at line 719 inside the `tts_lock` block. Between SmartTurn confirmation (line 680) and that point, dozens of audio frames leak through.

**Find this block (lines 679-681):**
```python
                turn_start_time = asyncio.get_event_loop().time()
                print(f"🟢 SmartTurn confirmed end of turn (p={prob:.3f})")
                transcript = await progressive_stt.finalize(buffer)
```

**Replace with:**
```python
                turn_start_time = asyncio.get_event_loop().time()
                print(f"🟢 SmartTurn confirmed end of turn (p={prob:.3f})")

                # IMMEDIATELY block further audio processing to prevent
                # frames leaking between turn confirmation and TTS start
                state["tts_busy"] = True

                transcript = await progressive_stt.finalize(buffer)
```

**Effect:** As soon as SmartTurn says "turn is done", no more audio frames enter the pipeline. The `continue` at line 641 will skip all subsequent frames until TTS completes.

---

## Step 2: Add post-TTS cooldown period

### [MODIFY] [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py)

**Why:** Even after resetting all state, the very first frames after TTS ends are unreliable — they contain mic settling noise, potential TTS echo tail, and WebRTC AGC adjustments. The orchestrator.py handles this with `time.sleep(0.5)` in `on_tts_done()`. We need the async equivalent.

**A) In the `room_states[room_name]` dict (around line 342-358), add after `"smart_turn_cooldown": 0`:**

```python
        "post_tts_cooldown_until": 0.0,  # asyncio time until which audio is ignored post-TTS
```

**B) In the post-TTS `finally` block (around lines 738-746), set the cooldown BEFORE clearing `tts_busy`:**

Find:
```python
                    finally:
                        # Reset everything AGAIN after speaking to ensure 
                        # any "barge-in" audio recorded during TTS is discarded
                        buffer.reset()
                        progressive_stt.reset()
                        state["vad"].reset()
                        state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                        state["smart_turn_cooldown"] = 0
                        
                        state["tts_busy"] = False
```

Replace with:
```python
                    finally:
                        # Reset everything AGAIN after speaking to ensure 
                        # any "barge-in" audio recorded during TTS is discarded
                        buffer.reset()
                        progressive_stt.reset()
                        state["vad"].reset()
                        state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                        state["smart_turn_cooldown"] = 0

                        # Post-TTS cooldown: ignore audio for 500ms to let
                        # mic AGC settle and TTS echo tail dissipate
                        state["post_tts_cooldown_until"] = asyncio.get_event_loop().time() + 0.5
                        
                        state["tts_busy"] = False
```

**C) Do the same in the `start_interview()` finally block (around lines 420-427):**

Find:
```python
                finally:
                    # Clear any audio that came in while the agent was introducing itself
                    state["buffer"].reset()
                    state["progressive_stt"].reset()
                    state["vad"].reset()
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    state["smart_turn_cooldown"] = 0
                    state["tts_busy"] = False
```

Replace with:
```python
                finally:
                    # Clear any audio that came in while the agent was introducing itself
                    state["buffer"].reset()
                    state["progressive_stt"].reset()
                    state["vad"].reset()
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    state["smart_turn_cooldown"] = 0
                    state["post_tts_cooldown_until"] = asyncio.get_event_loop().time() + 0.5
                    state["tts_busy"] = False
```

**D) Fix the `re_ask` finally block (around lines 506-510) — it is missing several resets:**

Find:
```python
                finally:
                    # Clear any noise captured during the repeat
                    state["buffer"].reset()
                    state["progressive_stt"].reset()
                    state["tts_busy"] = False
                    state["repeat_task"] = None
```

Replace with:
```python
                finally:
                    # Clear any noise captured during the repeat
                    state["buffer"].reset()
                    state["progressive_stt"].reset()
                    state["vad"].reset()
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    state["smart_turn_cooldown"] = 0
                    state["post_tts_cooldown_until"] = asyncio.get_event_loop().time() + 0.5
                    state["tts_busy"] = False
                    state["repeat_task"] = None
```

> [!IMPORTANT]
> The `re_ask` finally block was missing `vad.reset()`, `vad_buffer` drain, and `smart_turn_cooldown` reset. This was a secondary audio leak source.

**E) In `handle_audio()`, add the cooldown check right after the `tts_busy` gate (line 640-641):**

Find:
```python
        if state["tts_busy"]:
            continue
```

Replace with:
```python
        if state["tts_busy"]:
            continue

        # Post-TTS cooldown: skip frames for 500ms after TTS ends
        # to let mic AGC settle and avoid echo-triggered turns
        if asyncio.get_event_loop().time() < state["post_tts_cooldown_until"]:
            continue
```

---

## Step 3: Add RMS silence gate before SmartTurn check

### [MODIFY] [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py)

**Why:** The orchestrator.py uses an RMS check (`RMS_SILENCE_THRESHOLD = 0.005`) to reject turns that are acoustically silent — the buffer contains only noise/echo rather than real speech. This prevents phantom turns from echo leakage that manages to pass VAD.

**A) Add this function near `is_valid_transcript()` (after line 221):**

```python
def rms_energy(audio: np.ndarray) -> float:
    """Compute root-mean-square energy of an audio signal."""
    if len(audio) == 0:
        return 0.0
    return float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))

RMS_SILENCE_THRESHOLD = 0.005
```

**B) In `handle_audio()`, add an RMS check before SmartTurn runs. Find (lines 672-673):**

```python
                audio_8s = buffer.get_audio_for_smart_turn()
                is_complete, prob = smart_turn.is_end_of_turn(audio_8s)
```

Replace with:

```python
                # RMS gate: reject acoustically silent buffers (echo/noise only)
                turn_audio = buffer.get_full_turn_audio()
                if rms_energy(turn_audio) < RMS_SILENCE_THRESHOLD:
                    print("⚠️ Audio too quiet (RMS below threshold), skipping SmartTurn")
                    buffer.reset()
                    progressive_stt.reset()
                    state["vad"].reset()
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    state["smart_turn_cooldown"] = 0
                    continue

                audio_8s = buffer.get_audio_for_smart_turn()
                is_complete, prob = smart_turn.is_end_of_turn(audio_8s)
```

---

## Step 4: Add hard silence failsafe (4 seconds)

### [MODIFY] [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py)

**Why:** The orchestrator.py has a 4-second hard silence failsafe that forces a turn commit if the user has spoken enough but then gone completely silent. Without this, if SmartTurn repeatedly rejects, the system gets stuck indefinitely.

**A) Add constants near `VAD_WINDOW_SAMPLES` (around line 200):**

```python
FAILSAFE_SILENCE_SECONDS = 4
FAILSAFE_SILENCE_FRAMES = int(FAILSAFE_SILENCE_SECONDS / 0.032)  # ~125 frames at 32ms each
```

**B) In `handle_audio()`, add the failsafe check BEFORE the `should_check_turn` block. Add before line 669:**

```python
            # Hard silence failsafe: if user spoke enough but has been
            # silent for 4+ seconds, force-commit the turn
            if (
                buffer.speech_samples >= buffer.min_speech_samples
                and buffer._silent_frames >= FAILSAFE_SILENCE_FRAMES
            ):
                print(f"⏱ Failsafe: {FAILSAFE_SILENCE_SECONDS}s silence. Forcing turn commit.")
                state["tts_busy"] = True

                turn_audio_check = buffer.get_full_turn_audio()
                if rms_energy(turn_audio_check) < RMS_SILENCE_THRESHOLD:
                    print("⚠️ Failsafe audio too quiet, discarding")
                    state["tts_busy"] = False
                    buffer.reset()
                    progressive_stt.reset()
                    state["vad"].reset()
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    state["smart_turn_cooldown"] = 0
                    continue

                turn_start_time = asyncio.get_event_loop().time()
                transcript = await progressive_stt.finalize(buffer)

                if not is_valid_transcript(transcript):
                    print(f"⚠️ Failsafe transcript invalid: '{transcript}'")
                    state["tts_busy"] = False
                    buffer.reset()
                    progressive_stt.reset()
                    state["vad"].reset()
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    state["smart_turn_cooldown"] = 0
                    continue

                print(f"\n📝 Final Transcript (failsafe):\n {transcript}")

                agent_room_ref = rooms.get(room_name)
                if agent_room_ref:
                    await agent_room_ref.local_participant.publish_data(
                        json.dumps({
                            "event": "turn_end",
                            "ts": time.time(),
                            "transcript": transcript
                        }).encode(),
                        reliable=True,
                    )

                async with state["tts_lock"]:
                    buffer.reset()
                    progressive_stt.reset()
                    state["vad"].reset()
                    state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                    state["smart_turn_cooldown"] = 0

                    try:
                        stream_id = f"{room_name}:{time.time_ns()}"
                        async def on_question_update(text: str, is_final: bool):
                            await publish_new_question(room_name, text, stream_id=stream_id, is_final=is_final)

                        await voice_agent.handle_turn(
                            transcript,
                            turn_start_time,
                            on_question_update=on_question_update,
                        )

                        if voice_agent.interview_engine.interview_end and not state.get("interview_end_sent", False):
                            state["interview_end_sent"] = True
                            await publish_interview_end(room_name)
                    except Exception as e:
                        print(f"⚠️ Failsafe turn handling error: {e}")
                    finally:
                        buffer.reset()
                        progressive_stt.reset()
                        state["vad"].reset()
                        state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                        state["smart_turn_cooldown"] = 0
                        state["post_tts_cooldown_until"] = asyncio.get_event_loop().time() + 0.5
                        state["tts_busy"] = False
                continue

```

---

## Step 5: Extend frontend mic mute to cover `processing` status

### [MODIFY] [InterviewRoom.tsx](file:///c:/Users/SHREY/Desktop/Lattice/frontend/src/app/component/InterviewRoom.tsx)

**Why:** Currently `isAiSpeaking` is `questionStatus === 'streaming' || isPaused` (line 297). But between `turn_end` (which sets `questionStatus = 'processing'`) and the first `new_question` streaming token (which sets it to `'streaming'`), the mic is unmuted on the frontend for ~500-2000ms. This is defense-in-depth alongside the backend's `tts_busy` gate.

**Find (line 297):**
```typescript
    isAiSpeaking: questionStatus === 'streaming' || isPaused,
```

**Replace with:**
```typescript
    isAiSpeaking: questionStatus === 'streaming' || questionStatus === 'processing' || isPaused,
```

---

## Verification Plan

### Automated Checks
1. **Import check:** `python -c "from main import rms_energy, RMS_SILENCE_THRESHOLD; print('OK')"` from `convFlow/`
2. **Startup:** `python -m uvicorn main:app --host 0.0.0.0 --port 8001` — no import errors

### Manual Verification
1. Start a full interview session via the frontend
2. **Primary test:** When the AI is speaking, server logs should show **zero** `🟢 SmartTurn confirmed` or `📝 Final Transcript` messages
3. **Post-TTS test:** After the AI finishes speaking, wait ~1 second. Verify no instant turn-end is triggered
4. **Failsafe test:** Speak a sentence, then stay silent for 5+ seconds. Verify the failsafe triggers correctly
5. **Echo test:** Monitor for `⚠️ Audio too quiet` log messages — these confirm RMS gate is rejecting noise
6. Check browser console for `🤐 Muting local mic` appearing immediately after you finish speaking

---

## File Change Summary

| File | Changes |
|------|---------|
| [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py) | Early `tts_busy` set, post-TTS cooldown, RMS gate, hard silence failsafe, `re_ask` finally block fix |
| [InterviewRoom.tsx](file:///c:/Users/SHREY/Desktop/Lattice/frontend/src/app/component/InterviewRoom.tsx) | Extend `isAiSpeaking` to include `processing` status |

> [!IMPORTANT]
> **No changes to `vad.py`, `buffer.py`, `inference.py`, or `smart_turn.py`.** All fixes from the previous `implementation_plan.md` remain intact. This plan is purely additive — it closes timing gaps in the audio gating logic.
