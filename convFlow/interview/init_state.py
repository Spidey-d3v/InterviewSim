def create_initial_state():
    return {
        # Core flow
        "phase": "intro",

        # Turn tracking
        "last_question": "",
        "last_answer": "",

        # Phase tracking
        "phase_transcript": "",
        "phase_question_count": 0,
        "phase_word_count": 0,

        # Context memory
        "summary_till_now": "",

        # Static inputs (set in engine)
        "job_role": "",
        "job_description": "",
        "resume_context": "",
        "list_of_technical_topics": "",

        # Candidate modeling (future use)
        "candidate_profile": {
            "experience_level": "fresher",

            "scores": {
                "intro": {},
                "resume": {},
                "core_tech": {},
                "situational": {},
                "closing": {}
            },

            "overall_score": 0,

            "technical_score": 0,
            "communication_score": 0,
            "reasoning_score": 0,

            "detected_skills": [],
            "project_topics": []
        }
    }