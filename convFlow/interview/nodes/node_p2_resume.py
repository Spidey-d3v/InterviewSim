
async def node_p2_resume_based(
    llm,
    interviewer_name: str,
    job_role: str,
    company_name: str,
    job_description: str,
    resume_context: str,
    candidate_name: str,
    summary_till_now: str,
    transcript: str = ""
) -> str:
    """
    Generates interviewer response for Resume-Based phase.
    Returns plain text (not JSON).
    """

    from database import SessionLocal
    from models import InterviewPrompt

    transcript_context = transcript if transcript.strip() else "Resume-based questioning has not started yet."

    db = SessionLocal()
    prompt_obj = db.query(InterviewPrompt).filter(InterviewPrompt.prompt_key == 'resume').first()
    db.close()

    if prompt_obj and prompt_obj.prompt_text:
        prompt = prompt_obj.prompt_text.format(
            interviewer_name=interviewer_name,
            job_role=job_role,
            company_name=company_name,
            candidate_ref=candidate_name,
            resume_context=resume_context,
            job_description=job_description,
            summary_till_now=summary_till_now,
            transcript_context=transcript_context
        )
    else:
        prompt = f"""
        You are a professional interviewer named {interviewer_name} conducting a {job_role} interview at {company_name} for a fresher candidate named {candidate_name}.
        Phase: RESUME BASED QUESTIONS
        Tone: Conversational, Natural and Professional
        Resume Context: {resume_context}
        Job Description: {job_description}
        Summary of Previous Phases: {summary_till_now}
        Aim(in most fruitful order):
        1) Deep-dive into specific work experience or internships mentioned in the Resume Context.
        2) Analyze specific projects mentioned in the Resume Context, focusing on technical choices and results.
        3) Match relevant skills/experiences from the Resume Context directly to the JD requirements and probe for mastery.
        Task: Generate a highly specific interviewer response that references actual details from the Resume Context.
        Follow-up Strategy: 
        - Probe for implementation details, challenges overcome, and the specific impact of the candidate's work.
        - If answer is short/incomplete/unsure: probe ONCE with a targeted hint based on the resume.
        - If second answer still weak: move to next topic (max 2 follow-ups per topic).
        Rules:
        - Ask EXACTLY ONE focused question at a time. Do not chain multiple questions.
        - Keep the question extremely concise, ideally under 2 sentences.
        - NEVER ask generic "tell me about your experience" if specific details are in the Resume Context. Use them!
        - Target depth (implementation, challenges, impact) and explicit relevance to JD.
        Conversation This Phase: {transcript_context}
        """

    result = ""

    async for token in llm.stream_response(prompt):
        result += token

    return result.strip()