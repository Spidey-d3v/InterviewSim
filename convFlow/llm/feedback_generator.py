import os
import json
from google import genai
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env")

api_key = os.getenv("GEMINI_API_KEY")
http_opts = {'base_url': 'https://omnikey-ai-unified-key-manager.onrender.com'} if api_key and api_key.startswith('omnikey') else None
client = genai.Client(api_key=api_key, http_options=http_opts)

def generate_v2_feedback(metrics_data: list, total_questions: int, total_chunks: int) -> dict:
    """
    Generates a one-shot JSON feedback report using Gemini.
    metrics_data contains the question_metrics_json array.
    """
    
    # We serialize the provided metrics data into the prompt
    # so the model can read it and formulate the V2 feedback.
    metrics_json_str = json.dumps(metrics_data, indent=2)

    prompt = f"""
You are an expert interview coach analyzing a candidate's interview session.
You have access to the raw metrics from the session.

Interview Metrics Data:
{metrics_json_str}

Summary:
Total Questions: {total_questions}
Total 15-second chunks: {total_chunks}

Analyze the data and provide actionable, evidence-backed feedback for the candidate.
DO NOT present inferred psychological traits as facts. Focus on measurable observations: pace, pauses, fillers, pitch, volume, and camera engagement.
Use the `praat_features` object inside each chunk to determine the precise WPM (Words Per Minute), pitch variations, and jitter/shimmer. Use the transcript and `candidate_answer` for filler words.

You MUST return STRICT JSON adhering EXACTLY to the following schema:
{{
  "version": 2,
  "observations": {{
    "pace": {{ "wpm": number, "status": "fast" | "slow" | "balanced" }},
    "pauses": {{ "long_pause_count": number, "pause_ratio": number }},
    "fillers": {{ "um": number, "like": number, "other": number }},
    "modulation": {{
      "pitch_variation": "low" | "balanced" | "high",
      "volume_variation": "low" | "balanced" | "high"
    }},
    "camera_engagement": {{
      "average": number,
      "multiple_face_frames": number
    }}
  }},
  "actions": [
    {{
      "priority": number (1 is highest),
      "message": "string (actionable advice)",
      "evidence": ["string (e.g. answer_3: 00:18-00:42)"]
    }}
  ]
}}

Generate the JSON now:
"""
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "temperature": 0.2,
            },
        )
        if response.text:
            text = response.text.strip()
            if text.startswith("```json"):
                text = text[7:]
            elif text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            return json.loads(text.strip())
    except Exception as e:
        print(f"❌ Error generating V2 feedback: {e}")
        
    # Fallback default if generation fails
    return {
        "version": 2,
        "observations": {
            "pace": { "wpm": 0, "status": "balanced" },
            "pauses": { "long_pause_count": 0, "pause_ratio": 0.0 },
            "fillers": { "um": 0, "like": 0 },
            "modulation": {
                "pitch_variation": "balanced",
                "volume_variation": "balanced"
            },
            "camera_engagement": {
                "average": 0.0,
                "multiple_face_frames": 0
            }
        },
        "actions": []
    }
