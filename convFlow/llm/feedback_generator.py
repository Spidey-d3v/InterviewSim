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
    
    total_words = sum(len(q.get("candidate_answer", "").split()) for q in metrics_data)
    
    total_speaking_seconds = sum(q.get("candidate_audio_duration", 0.0) or 0.0 for q in metrics_data)
    if total_speaking_seconds > 0.0:
        total_minutes = total_speaking_seconds / 60.0
    else:
        total_minutes = (total_chunks * 15) / 60.0  # Fallback
        
    calculated_wpm = int(total_words / total_minutes) if total_minutes > 0 else 0

    prompt = f"""
You are an expert AI interview coach. Analyze the following interview metrics:
{metrics_json_str}

Summary stats:
- Total words spoken: {total_words}
- Estimated speaking time: {total_minutes:.2f} minutes
- Overall WPM: {calculated_wpm}

Analyze the data and provide actionable, evidence-backed feedback for the candidate.
DO NOT present inferred psychological traits as facts. Focus on measurable observations: pace, pauses, fillers, camera engagement, response length, and vocabulary.
For the pace metric, use the calculated Overall WPM ({calculated_wpm}) directly. 
CRITICAL: ONLY count filler words ("um", "uh", "like") that EXACTLY appear in the `candidate_answer` transcript text. If the transcript is perfectly clean, you MUST output 0 for fillers. DO NOT hallucinate filler counts.

New Metric Instructions:
1. Response Length: Evaluate if their answers were concise (good), rambling (bad), or too short (bad). Provide a brief explanation of the ideal length for their specific answers.
2. Vocabulary: Count weak words ("I think", "maybe", "I tried") vs strong words ("I led", "I delivered", "I achieved") in the transcript. Provide the exact list of strong and weak words you found along with their occurrence counts.
3. Technical Evaluation: You are an extremely strict, expert technical interviewer. For each question asked, evaluate the technical correctness and quality of the candidate's answer. Give a score out of 5. Your explanation should be detailed but concise (2-3 sentences). If the candidate made any technical errors or gave an incorrect description, you MUST provide the exact, correct technical definition or solution in your explanation. Be unapologetically strict about technical accuracy.
4. STAR Method Analysis: Evaluate how much focus the candidate put on each component of the STAR method across their answers. Output a percentage breakdown (0-100) for Situation, Task, Action, and Result. The total should equal 100.
5. Skipped Questions: If the candidate's answer is a request to skip the question (e.g., 'Can we skip this phase please?', 'Skip this'), DO NOT penalize them for it. Do not recommend avoiding skipping in the actions. Simply ignore these skipped questions when assessing technical correctness, response length, and vocabulary.

You MUST return STRICT JSON adhering EXACTLY to the following schema:
{{
  "version": 2,
  "observations": {{
    "pace": {{ "wpm": number, "status": "fast" | "slow" | "balanced" }},
    "pauses": {{ "long_pause_count": number, "pause_ratio": number }},
    "fillers": {{ "um": number, "like": number, "other": number }},
    "camera_engagement": {{
      "average": number,
      "multiple_face_frames": number
    }},
    "response_length": {{ 
      "status": "concise" | "rambling" | "too_short",
      "feedback": "string (explanation of ideal length vs their actual answers)"
    }},
    "vocabulary": {{ 
      "strong_words_used": number, 
      "weak_words_used": number, 
      "status": "confident" | "passive",
      "strong_words_list": [{{"word": "string", "count": number}}],
      "weak_words_list": [{{"word": "string", "count": number}}]
    }},
    "star_coverage": {{
      "situation": number,
      "task": number,
      "action": number,
      "result": number
    }}
  }},
  "technical_evaluation": [
    {{
      "question_index": number,
      "accuracy_score_out_of_5": number,
      "feedback": "string (2-3 sentences of strict technical evaluation. Must include correct definitions if the candidate made an error)"
    }}
  ],
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
            "fillers": { "um": 0, "like": 0, "other": 0 },
            "camera_engagement": {
                "average": 0.0,
                "multiple_face_frames": 0
            },
            "response_length": { "status": "balanced", "feedback": "" },
            "vocabulary": { 
                "strong_words_used": 0, 
                "weak_words_used": 0, 
                "status": "confident",
                "strong_words_list": [],
                "weak_words_list": []
            },
            "star_coverage": { "situation": 0, "task": 0, "action": 0, "result": 0 }
        },
        "technical_evaluation": [],
        "actions": []
    }
