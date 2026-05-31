from typing import TypedDict, Dict, Any, List


class InterviewState(TypedDict):
    # Core flow
    phase: str

    # Panel tracking
    panel: List[Dict[str, str]]  # [{"name": "Kate", "voice": "af_heart"}, ...]
    phase_to_interviewer: Dict[str, str] # {"intro": "Kate", ...}
    current_interviewer: str # "Kate"

    # Turn tracking
    last_question: str
    last_answer: str

    # Phase tracking
    phase_transcript: str
    phase_question_count: int
    phase_word_count: int

    # Context
    summary_till_now: str

    # Static inputs
    interviewer_name: str
    job_role: str
    job_description: str
    resume_context: str
    list_of_technical_topics: str

    # Candidate info
    candidate_profile: Dict[str, Any]