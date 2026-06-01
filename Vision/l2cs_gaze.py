"""Headless L2CS-Net gaze analysis for uploaded interview video chunks."""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
from l2cs import Pipeline

WINDOW_SIZE = 30
PERFECT_GAZE_THRESHOLD = 0.10
LOST_GAZE_THRESHOLD = 0.35
TARGET_SAMPLE_FPS = 10.0


def get_frame_score(yaw: float, pitch: float) -> float:
    """Return a 0-5 camera-engagement score from gaze deviation."""
    distance = float(np.sqrt(yaw**2 + pitch**2))
    if distance <= PERFECT_GAZE_THRESHOLD:
        return 5.0
    if distance >= LOST_GAZE_THRESHOLD:
        return 0.0
    return 5.0 * (
        1 - (distance - PERFECT_GAZE_THRESHOLD)
        / (LOST_GAZE_THRESHOLD - PERFECT_GAZE_THRESHOLD)
    )


def _classify_gaze(yaw: float, pitch: float) -> str:
    distance = float(np.sqrt(yaw**2 + pitch**2))
    if distance < LOST_GAZE_THRESHOLD:
        return "Looking Forward"
    if abs(yaw) >= abs(pitch):
        return "Looking Left" if yaw < 0 else "Looking Right"
    return "Looking Away"


def _timestamp(seconds: float) -> str:
    return f"{seconds:.3f}"


class L2CSGazeAnalyzer:
    """Analyze videos with one shared L2CS model and per-video rolling state."""

    def __init__(self, weights_path: str | Path) -> None:
        self._weights_path = str(weights_path)
        self._pipeline: Pipeline | None = None

    def load(self) -> bool:
        if self._pipeline is not None:
            return True
        self._pipeline = Pipeline(
            weights=self._weights_path,
            arch="ResNet50",
            device=torch.device("cuda" if torch.cuda.is_available() else "cpu"),
        )
        return True

    def analyze_video(self, video_path: str) -> list[dict[str, Any]]:
        if self._pipeline is None:
            self.load()

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video: {video_path}")

        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
        if fps <= 0:
            fps = 30.0
        sample_every = max(1, round(fps / TARGET_SAMPLE_FPS))
        score_history: deque[float] = deque(maxlen=WINDOW_SIZE)
        entries: list[dict[str, Any]] = []
        frame_index = 0

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if frame_index % sample_every != 0:
                    frame_index += 1
                    continue

                elapsed = frame_index / fps
                results = self._pipeline.step(frame)
                face_count = len(results.yaw) if results is not None else 0

                if face_count == 0:
                    frame_score = 0.0
                    status = "Looking Away"
                    yaw = None
                    pitch = None
                else:
                    yaw = float(results.yaw[0])
                    pitch = float(results.pitch[0])
                    frame_score = get_frame_score(yaw, pitch)
                    status = _classify_gaze(yaw, pitch)

                score_history.append(frame_score)
                rolling_score = sum(score_history) / len(score_history)
                entries.append(
                    {
                        "timestamp": _timestamp(elapsed),
                        "captured_at": datetime.now(timezone.utc).isoformat(),
                        "status": status,
                        "face_count": face_count,
                        "multiple_faces": face_count > 1,
                        "yaw": yaw,
                        "pitch": pitch,
                        "frame_score": round(frame_score, 4),
                        "rolling_score": round(rolling_score, 4),
                        "camera_engagement": round(rolling_score / 5.0, 4),
                    }
                )
                frame_index += 1
        finally:
            cap.release()

        return entries

