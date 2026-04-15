# Project Timeline

## 2026-04-16

- **Action:** Implemented Interview Phase UI Tracking & Job Role Presets.
- **Details:**
    - Resolved `TS2345` compiler error in `VisionSessionControl.tsx` by updating the boolean `headless` parameter call to an empty string.
    - Updated `frontend/src/app/front/homepage/page.tsx` to display a role selection modal, dynamically passing the user's selected Job Role as a `?role=` URL parameter.
    - Created a dictionary of preset Job Roles in `convFlow/main.py`, automatically populating `job_description`, `list_of_technical_topics`, and `interviewer_name` based on frontend selection context.
    - Intercepted LiveKit stream messaging inside `useConvFlowRoom.ts` and `InterviewRoom.tsx` to extract phase transitions natively emitted by the `InterviewEngine`.
    - Grouped the final PDF report output into dedicated, phase-wise summary boundaries.
- **Outcome:** Substantially improved UI feedback and post-interview result clustering while establishing a unified multi-role framework.

## 2026-04-15

- **Action:** Analyzed `dep.yml` (conda `--from-history` export) for completeness; created macOS startup script.
- **Details:**
    - Found that `dep.yml` only contains conda-channel packages and is missing all pip dependencies required by Vision and convFlow services.
    - Identified `pupil310.yml` (full export) as the correct environment spec.
    - Created `start-system.sh` — macOS/Linux equivalent of `start-system.ps1`, using `osascript` to open Terminal.app tabs.
    - Rewrote `dep.yml` as the macOS-compatible full environment: stripped Windows-only packages (`pywin32`, `win-inet-pton`, `pygetwindow`, `keyboard`, `ucrt`, `vc` runtimes), replaced CUDA torch with CPU/MPS builds, added `pyobjc` for macOS GUI, added `conda-forge` channel.
- **Outcome:** macOS launch script and environment file ready for cross-platform deployment.

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
