# Turn Detection Pipeline — Production Fix Implementation Plan

## Goal
Fix NaN-induced random conversation terminations and harden the entire VAD → TurnBuffer → SmartTurn → STT pipeline for production-grade real-time turn detection.

## Proposed Changes

Changes are ordered by dependency — each step builds on the previous. **Execute in exact order.**

---

### Step 1: Harden `vad.py` — NaN guard + model state reset

#### [MODIFY] [vad.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/audio/vad.py)

**What to change:**
1. Add NaN/Inf guard at the top of `process_frame()` — return `False` immediately if frame contains bad values.
2. Add `self.model.reset_states()` call inside `reset()` to clear Silero's internal LSTM hidden state between turns.

**Exact edits:**

In `process_frame()`, immediately after the docstring (before `audio_tensor = torch.from_numpy(frame)`), add:
```python
        # Guard: reject corrupted frames
        if np.isnan(frame).any() or np.isinf(frame).any():
            return self._is_speaking
```

In `reset()`, add `self.model.reset_states()` after `self._is_speaking = False`:
```python
    def reset(self) -> None:
        """Reset internal state (call after a turn completes)."""
        self._silent_frames = 0
        self._is_speaking = False
        self.model.reset_states()
```

**Why:** Silero returns NaN probability for NaN input, which silently corrupts all downstream decisions. The LSTM reset prevents cross-turn state bleed.

---

### Step 2: Harden `buffer.py` — NaN frame rejection

#### [MODIFY] [buffer.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/audio/buffer.py)

**What to change:**
Add NaN guard at the top of both `add_speech_frame()` and `add_silence_frame()`.

**Exact edits:**

In `add_speech_frame()`, as the first line of the method body:
```python
    def add_speech_frame(self, frame: np.ndarray) -> None:
        if np.isnan(frame).any() or np.isinf(frame).any():
            return
        self.frames.append(frame)
        # ... rest unchanged
```

In `add_silence_frame()`, as the first line of the method body:
```python
    def add_silence_frame(self, frame: np.ndarray) -> None:
        if np.isnan(frame).any() or np.isinf(frame).any():
            return
        self.frames.append(frame)
        # ... rest unchanged
```

**Why:** Even if VAD somehow passes a bad frame, the buffer is the last line of defense before SmartTurn and STT.

---

### Step 3: Harden `inference.py` — NaN input/output guard

#### [MODIFY] [inference.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/turn_taking/inference.py)

**What to change:**
1. Add NaN check on `audio_array` at the top of `predict_endpoint()`.
2. Add NaN/Inf check on `probability` after ONNX inference.

**Exact edits:**

At the top of `predict_endpoint()`, before the truncation call:
```python
def predict_endpoint(audio_array):
    # ... docstring ...

    # Guard: reject NaN/Inf audio
    if np.isnan(audio_array).any() or np.isinf(audio_array).any():
        return {"prediction": 0, "probability": 0.0}

    # Truncate to 8 seconds ...
```

After `probability = outputs[0][0].item()` (line 61), add:
```python
    probability = outputs[0][0].item()

    # Guard: reject NaN/Inf model output
    if not np.isfinite(probability):
        return {"prediction": 0, "probability": 0.0}
```

**Why:** This is the direct fix for the NaN probability output. Returns a safe "incomplete" result instead of propagating NaN.

---

### Step 4: Fix downsampling in `main.py` — Anti-alias filter

#### [MODIFY] [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py)

**What to change:**
Replace the naive `audio[::3]` decimation with `scipy.signal.decimate` which applies a proper anti-alias filter before downsampling.

**Exact edit — replace lines 206-211:**

```python
from scipy.signal import decimate as _scipy_decimate

def downsample_48k_to_16k(pcm_int16: np.ndarray) -> np.ndarray:
    audio = pcm_int16.astype(np.float32) / 32768.0
    # Anti-alias filter + downsample (default 8th-order Chebyshev type I IIR)
    downsampled = _scipy_decimate(audio, 3, ftype='iir', zero_phase=False)
    return downsampled.astype(np.float32)
```

**Where to put the import:** Add `from scipy.signal import decimate as _scipy_decimate` near the top of `main.py` with the other imports (after `import numpy as np`, around line 2).

> [!IMPORTANT]
> Use `zero_phase=False` for real-time (causal) processing. `zero_phase=True` would require the full signal which defeats streaming.

**Why:** Naive stride-skip folds 8-24kHz energy back into 0-8kHz as aliased noise, causing phantom VAD triggers and corrupted SmartTurn features.

---

### Step 5: Per-room VAD instances in `main.py`

#### [MODIFY] [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py)

**What to change:**
1. Remove the global `vad = SileroVAD()` singleton (line 198).
2. Remove the global `vad_buffer` and `VAD_WINDOW_SAMPLES` (lines 201-202).
3. Add a per-room `vad` instance inside `room_states[room_name]`.
4. Update `handle_audio()` to use `state["vad"]` instead of the global `vad`.

**Exact edits:**

**A) Delete these global lines (198-202):**
```python
# DELETE these:
vad = SileroVAD()
vad_buffer = np.zeros(0, dtype=np.float32)
VAD_WINDOW_SAMPLES = int(16000 * 0.032)
```

**B) Keep `VAD_WINDOW_SAMPLES` as a module-level constant (it's config, not state):**
```python
VAD_WINDOW_SAMPLES = int(16000 * 0.032)  # 32ms = 512 samples
```

**C) In the `room_states[room_name]` dict (around line 332-347), add the `vad` key:**
```python
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
        "smart_turn_checked": False,
        "interview_end_sent": False,
        "repeat_task": None,
    }
```

**D) In `handle_audio()`, replace `vad.process_frame(vad_chunk)` (line 643) with:**
```python
            is_speaking = state["vad"].process_frame(vad_chunk)
```

**E) In every reset block inside `handle_audio()` and `start_interview()`, add `state["vad"].reset()` alongside the other resets.** There are 4 reset locations:
- `start_interview()` finally block (~line 410-415)
- First reset after turn confirmed (~line 686-688)
- Inside `tts_lock` block (~line 691-694)
- `tts_lock` finally block (~line 717-720)

Add `state["vad"].reset()` in each of these blocks, right after `state["vad_buffer"] = np.zeros(0, dtype=np.float32)`.

**Why:** The global singleton VAD shares LSTM state across concurrent rooms. Room A's audio corrupts Room B's speech decisions.

---

### Step 6: Replace single-shot SmartTurn debounce with cooldown counter

#### [MODIFY] [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py)

**What to change:**
Replace the boolean `smart_turn_checked` with an integer cooldown counter that allows periodic re-checks during sustained silence.

**Exact edits:**

**A) In `room_states[room_name]` dict, replace `"smart_turn_checked": False` with:**
```python
        "smart_turn_cooldown": 0,     # frames until next SmartTurn check allowed
```

**B) Replace the turn-check block in `handle_audio()` (the section starting at approximately line 653). The current code is:**
```python
            if buffer.should_check_turn() and not state["smart_turn_checked"]:
                state["smart_turn_checked"] = True
```

**Replace with:**
```python
            if buffer.should_check_turn() and state["smart_turn_cooldown"] <= 0:
                state["smart_turn_cooldown"] = 25  # re-check after 25 more silence frames (~250ms at 10ms/frame)
```

**C) Add cooldown decrement right after the `should_check_turn` block (when the condition is NOT met):**
```python
            elif state["smart_turn_cooldown"] > 0:
                state["smart_turn_cooldown"] -= 1
```

**D) When new speech arrives (line 647), reset cooldown instead of the old flag:**
```python
            if is_speaking:
                buffer.add_speech_frame(vad_chunk)
                state["smart_turn_cooldown"] = 0  # new speech resets cooldown
```

**E) In all reset blocks, replace `state["smart_turn_checked"] = False` with:**
```python
                state["smart_turn_cooldown"] = 0
```

**Why:** The old boolean debounce gave SmartTurn exactly ONE chance per silence episode. If it returned NaN or an incorrect result, the system was deaf until the user spoke again. The cooldown allows periodic re-evaluation.

---

### Step 7: Add transcript validation in `main.py`

#### [MODIFY] [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py)

**What to change:**
Add an `is_valid_transcript()` function (ported from orchestrator.py) and validate the transcript before sending it to the voice agent.

**Exact edits:**

**A) Add this function near the top of `main.py` (after `downsample_48k_to_16k`, before the CORS section):**
```python
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
```

**B) In `handle_audio()`, after `transcript = await progressive_stt.finalize(buffer)` (line 665), add validation before continuing to the voice agent:**

```python
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
                # ... rest of the handler continues unchanged
```

**Why:** This is the **most critical fix**. Without this, `"nan"` transcripts reach the LLM, which produces erratic responses that trigger the interview-end logic in `InterviewEngine`.

---

### Step 8: Remove redundant double-reset in `handle_audio()`

#### [MODIFY] [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py)

**What to change:**
Remove the first reset block (lines 686-688) that occurs BEFORE the `tts_lock` acquisition. Keep only the reset inside the `tts_lock` block.

**Delete these lines (approximately 686-688):**
```python
                # DELETE THESE:
                state["vad_buffer"] = np.zeros(0, dtype=np.float32)
                buffer.reset()
                progressive_stt.reset()
```

The reset inside `async with state["tts_lock"]:` (lines 691-694) remains and is sufficient.

**Why:** The first reset is redundant with the one inside `tts_lock`. Worse, if a frame arrives between the two resets, it processes against a cleared buffer, potentially causing index errors.

---

### Step 9: Add NaN guard on incoming LiveKit frames in `handle_audio()`

#### [MODIFY] [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py)

**What to change:**
After downsampling (`pcm_16k = downsample_48k_to_16k(pcm_int16)`), add a NaN check before the VAD buffer accumulation.

**Add after line 634:**
```python
        pcm_16k = downsample_48k_to_16k(pcm_int16)

        # Guard: reject corrupted frames from WebRTC
        if np.isnan(pcm_16k).any() or np.isinf(pcm_16k).any():
            continue
```

**Why:** First line of defense. Catches bad frames before they enter any component.

---

## Verification Plan

### Automated Tests
After implementing all changes, run the server and verify:

1. **Startup:** `python -m uvicorn main:app --host 0.0.0.0 --port 8001` should start without import errors.
2. **Import check:** `python -c "from audio.vad import SileroVAD; v = SileroVAD(); v.reset(); print('OK')"` — should print OK and call `reset_states()` without error.
3. **NaN guard test:** `python -c "import numpy as np; from turn_taking.inference import predict_endpoint; r = predict_endpoint(np.full(128000, np.nan, dtype=np.float32)); print(r)"` — should return `{'prediction': 0, 'probability': 0.0}`.
4. **Downsample test:** `python -c "import numpy as np; from main import downsample_48k_to_16k; x = np.random.randint(-32768, 32767, 480, dtype=np.int16); y = downsample_48k_to_16k(x); print(y.shape, y.dtype, np.isnan(y).any())"` — should show `(160,) float32 False`.

### Manual Verification
1. Start a full interview session via the frontend.
2. Monitor server logs for `⚠️ Invalid transcript rejected` — these should appear for noise-only segments instead of the old `NaN` crash.
3. Verify conversations no longer terminate randomly.
4. Test with two concurrent rooms to verify per-room VAD isolation.

---

## File Change Summary

| File | Changes |
|------|---------|
| [vad.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/audio/vad.py) | NaN guard in `process_frame()`, `model.reset_states()` in `reset()` |
| [buffer.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/audio/buffer.py) | NaN guard in `add_speech_frame()` and `add_silence_frame()` |
| [inference.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/turn_taking/inference.py) | NaN guard on input audio and model output |
| [main.py](file:///c:/Users/SHREY/Desktop/Lattice/convFlow/main.py) | Anti-alias downsampling, per-room VAD, cooldown debounce, transcript validation, frame NaN guard, double-reset removal |

> [!IMPORTANT]
> `orchestrator.py` is **not modified** — it is the local/desktop version and is not affected by these changes. The `smart_turn.py` wrapper and `audio_utils.py` are also unchanged since the guards are placed upstream.
