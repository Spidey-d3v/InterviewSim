async def node_p1_introduction(
    llm,
    interviewer_name: str,
    job_role: str,
    company_name: str,
    job_description: str,
    candidate_name: str,
    resume_context: str = "",
    transcript: str = ""
) -> str:
    """
    Generates interviewer response for Introduction phase.
    Returns plain text (not JSON).
    """

    candidate_ref = candidate_name if candidate_name else "the candidate"
    transcript_context = transcript if transcript.strip() else "Interview has not started yet."

    prompt = f"""
            You are a professional interviewer named {interviewer_name} starting a {job_role} interview at {company_name} for a fresher candidate named {candidate_ref}.
         Phase: INTRODUCTION
         Tone: Conversational, Natural, Concise and Professional
         Resume Context: {resume_context}
         Job Description: {job_description}
         Aim(in order):
         1. Welcome the candidate and briefly introduce {company_name} and the role (1-2 lines).
         2. If Resume Context is available, naturally acknowledge one specific project or skill from it (e.g., "I see you've worked on [Project/Skill], which is very relevant...").
         3. Get the candidate to:
            - introduce themselves more broadly
            - explain their background and journey
            - explain why they are a good fit for this specific role
         Task: Generate interviewer's next response in provided tone.
         If the interview has not started yet, generate the opening welcome + first intro question only.
         If transcript exists, you may probe for further information if answer seems too short or incomplete.
         Rules:
         - Ask EXACTLY ONE question at a time.
         - Keep the opening brief and your response under 2-3 sentences.
         - Combine questions into one smooth opening
         - Do not assume the candidate already answered when interview has not started yet
         Conversation This Phase: {transcript_context}
         """

    result = ""

    async for token in llm.stream_response(prompt):
        result += token

    return result.strip()