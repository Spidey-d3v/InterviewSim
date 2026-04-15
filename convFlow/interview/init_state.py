def create_initial_state():
    return {
        # Core flow
        "phase": "intro",
        "candidate_name": "",

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
        "interviewer_name": "Kate",
        "job_role": "Full Stack Developer",
        "company_name": "Apple",
        "job_description": "Entry-level Full Stack Developer role focused on building and maintaining web applications across both frontend and backend. The role involves developing responsive user interfaces, designing and consuming APIs, working with databases, and understanding basic system design principles. Candidates are expected to have a strong foundation in JavaScript, familiarity with modern frontend frameworks, and basic backend development knowledge. Emphasis is placed on problem-solving ability, clean coding practices, and understanding of end-to-end application flow. The role also requires the ability to debug issues, collaborate in a team environment, and continuously learn new technologies.",
        "resume_context": "",
        "list_of_technical_topics": "HTML, CSS, JavaScript, React, Node.js, Express.js, REST APIs, CRUD operations, authentication basics, MongoDB/SQL, data structures, asynchronous programming, Git, debugging, system design basics, HTTP/HTTPS, browser rendering, state management",

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