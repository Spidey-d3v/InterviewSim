# Project Timeline

## 2026-04-04

- **Action:** Consolidated project documentation into a single `README.md`.
- **Details:**
    - Merged technical details from `convFlow`, `Vision Intelligence`, `Voice Evaluation`, and `System Architecture` into the root `README.md`.
    - Deleted redundant `.md` files: `PROJECT_OVERVIEW.md`, `convFlow/SYSTEM_DOCUMENTATION.md`, `convFlow/readMe.md`, `Atempt2/Process.md`, `Atempt2/README.md`, `convFlow/intelligence_layer_plan.md`, `Voice_Evaluation_PRJ3/README.md`, `convFlow/timeline.md`, `Atempt2/TIMELINE.md`, and `LIVEKIT_TROUBLESHOOTING.md`.
    - Integrated historical milestones from sub-project timelines (`Atempt2`, `convFlow`).
- **Outcome:** Unified documentation structure and history.

## 2026-04-04

- **Action:** Integrated `convFlow` (AI voice agent) with `InterviewAR` (video analysis).
- **Details:**
    - Replaced 15-second static video chunking with event-driven flushing based on `SmartTurn` end-of-turn detection in `convFlow`.
    - Implemented `useConvFlowRoom` hook to handle LiveKit connection, TTS audio playback, and `turn_end` data messages.
    - Updated `useChunkedRecorder` to support 500ms timeslices and manual `flushChunk` calls.
    - Modified `convFlow/main.py` to instantiate `SmartTurnV3`, manage room states, and publish `turn_end` events to the frontend.
- **Outcome:** System now flushes video chunks to the Vision Server exactly when the user finishes speaking, improving analysis synchronization and reducing latency.

## 2025-12-29 (Historical - Atempt2)

- **Milestone:** Major Architectural Upgrade: Integrated Pre-trained VideoMAE.
- **Details:** Replaced custom placeholders with `VideoMAEModel` (Kinetics-400), updated dataset loaders to use `decord` for fast frame extraction, and implemented ranking-supervised training.
- **Outcome:** Successfully established a state-of-the-art video foundation for behavioral analysis.

## 2025-12-29 (Historical - Voice_Evaluation)

- **Milestone:** Implemented Wav2Vec2-based Speaking Skills Assessment.
- **Details:** Fine-tuned `wav2vec2-base` for regression on speaking skills using Spearman correlation loss.
- **Outcome:** High-accuracy audio-based evaluation of candidate fluency and energy.
