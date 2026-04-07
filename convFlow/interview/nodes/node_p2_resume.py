
async def node_p2_resume_based(
    llm,
    job_role: str,
    job_description: str,
    resume_context: str,
    summary_till_now: str,
    transcript: str = ""
) -> str:
    """
    Generates interviewer response for Resume-Based phase.
    Returns plain text (not JSON).
    """

    prompt = f"""
        You are a professional interviewer conducting a {job_role} interview for a fresher.
        Phase: RESUME BASED QUESTIONS
        Tone: Conversational, Natural and Professional
        Resume Context: {resume_context}
        Job Description: {job_description}
        Summary of Previous Phases: {summary_till_now}
        Aim(in most fruitful order):
        1) Evaluate work experience mentioned in resume if any else skip to (2)
        2) Evaluate projects mentioned in resume if any 
        3) Match relevant skills/experiences from resume to JD and delve deeper into it
        Task: Generate interviewer's next response in provided tone which could be a new question or a follow-up using follow-up strategy.
        Follow-up Strategy: 
        - If answer is short/incomplete/unsure: probe ONCE with a hint
        - If second answer still weak: move to next topic (max 2 follow-ups per topic)
        - Probing example: "Can you walk me through how you achieved that particular result?"
        Rules:
        - Target depth (implementation, challenges, impact) and relevance to JD
        Conversation This Phase: if transcript exists, then {transcript} else {"Resume-based questioning has not started yet."}
        """

    result = ""

    async for token in llm.stream_response(prompt):
        result += token

    return result.strip()