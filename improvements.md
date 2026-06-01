# Interview Feedback Improvements

## Product direction

Replace opaque headline metrics such as `Voice Skills: 71%` and `Confidence:
84%` with measurable observations, evidence-backed coaching, and progress
tracking.

Keep objective numbers when they help the user improve:

- speaking pace in words per minute
- pause count, pause duration, and pause ratio
- filler-word frequency
- pitch and volume variation
- camera engagement over time
- possible disfluencies with timestamps

Avoid presenting inferred psychological traits as facts. For example, gaze
tracking measures camera engagement, not personal confidence.

## Recommended feedback shape

```json
{
  "version": 2,
  "observations": {
    "pace": { "wpm": 146, "status": "balanced" },
    "pauses": { "long_pause_count": 4, "pause_ratio": 0.12 },
    "fillers": { "um": 6, "like": 3 },
    "modulation": {
      "pitch_variation": "low",
      "volume_variation": "balanced"
    },
    "camera_engagement": {
      "average": 0.78,
      "multiple_face_frames": 0
    }
  },
  "actions": [
    {
      "priority": 1,
      "message": "Use more vocal variation when explaining project outcomes.",
      "evidence": ["answer_3: 00:18-00:42"]
    }
  ]
}
```

## Camera engagement migration

The gaze block should report `camera engagement`, not `AI confidence`.

The active chunk-processing pipeline now uses the L2CS-Net yaw and pitch
estimation approach prototyped in `Vision/test.py`:

- each sampled frame receives a gaze score from `0.0` to `5.0`
- the score is smoothed with a rolling window
- the rolling score is normalized to `0.0` to `1.0` for compatibility with the
  existing `predictions[].confidence` transport field
- multiple faces and missing faces are counted explicitly
- phase-level graphs should use question metrics grouped by interview phase
- the whole-session value remains the average of persisted chunk values

The compatibility field can be renamed in a future API version. Until then,
the frontend should label it `Camera Engagement`.

## Voice analysis follow-up

The current wav2vec model is trained against one `speaking_skills` label. It
cannot explain whether a low score was caused by pace, pauses, pronunciation,
or modulation.

Before exposing richer voice advice:

1. Add deterministic measurements for pace, pauses, fillers, pitch variation,
   and volume variation.
2. Attach timestamps or answer references to each recommendation.
3. Use cautious wording for possible disfluencies.
4. Add a specialized phoneme-level model before claiming pronunciation
   assessment.
5. Keep any overall voice summary secondary to the actionable observations.

