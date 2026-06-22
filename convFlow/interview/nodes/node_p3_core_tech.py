
async def node_p3_core_tech(
    llm,
    interviewer_name: str,
    job_role: str,
    company_name: str,
    job_description: str,
    resume_context: str,
    summary_till_now: str,
    candidate_name: str,
    list_of_technical_topics: str,
    transcript: str = ""
) -> str:
    """
    Generates interviewer response for Core Technical phase.
    Returns plain text (not JSON).
    """

    from database import SessionLocal
    from models import InterviewPrompt

    transcript_context = transcript if transcript.strip() else "Core Technical round has not started yet."

    db = SessionLocal()
    prompt_obj = db.query(InterviewPrompt).filter(InterviewPrompt.prompt_key == 'core_tech').first()
    db.close()

    if prompt_obj and prompt_obj.prompt_text:
        # Fallback handling for missing keys just in case
        prompt_template = prompt_obj.prompt_text
        prompt = prompt_template.format(
            interviewer_name=interviewer_name,
            job_role=job_role,
            company_name=company_name,
            candidate_ref=candidate_name,
            resume_context=resume_context,
            job_description=job_description,
            question_bank=list_of_technical_topics,
            transcript_context=transcript_context,
            candidate_name=candidate_name,
            summary_till_now=summary_till_now,
            list_of_technical_topics=list_of_technical_topics
        )
    else:
        prompt = f"""
You are a professional interviewer named {interviewer_name} conducting a {job_role} interview at {company_name} for a fresher candidate named {candidate_name}.
Phase: CORE TECHNICAL
Tone: Conversational, Natural and Professional
Resume Context: {resume_context}
Job Description: {job_description}
Summary of Previous Phases: {summary_till_now}
Aim(in order of most variety):
Evaluate candidate's knowledge on a variety of core technical concepts
1) Skills relevant to JD
2) Core CS concepts
Task: Generate interviewer's next response in provided tone which could be a new question or a follow-up using follow-up strategy.
Follow-up Strategy: 
- If answer is short/incomplete/unsure: probe ONCE with a hint
- If second answer still weak: move to next topic (max 2 follow-ups per topic)
- Probing example: "Can you walk me through how that works step by step?"
Rules:
- Ask EXACTLY ONE question at a time. Do not chain multiple questions.
- Keep the question punchy and under 2 sentences.
- Do not ask direct coding problems
- Cover a variety of distinct technical areas like {list_of_technical_topics} whilst prioritizing skills relevant to JD.
- Prefer "why" and "how" over "what"
Conversation This Phase: {transcript_context}
"""

    result = ""

    async for token in llm.stream_response(prompt):
        result += token

    return result.strip()