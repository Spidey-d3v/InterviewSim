# Project Timeline

## 2026-04-04

- **Action:** Integrated `convFlow` (AI voice agent) with `InterviewAR` (video analysis).
- **Details:**
    - Replaced 15-second static video chunking with event-driven flushing based on `SmartTurn` end-of-turn detection in `convFlow`.
    - Implemented `useConvFlowRoom` hook to handle LiveKit connection, TTS audio playback, and `turn_end` data messages.
    - Updated `useChunkedRecorder` to support 500ms timeslices and manual `flushChunk` calls.
    - Modified `convFlow/main.py` to instantiate `SmartTurnV3`, manage room states, and publish `turn_end` events to the frontend.
- **Outcome:** System now flushes video chunks to the Vision Server exactly when the user finishes speaking, improving analysis synchronization and reducing latency.
