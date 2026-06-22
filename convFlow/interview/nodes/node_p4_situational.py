
async def node_p4_situational(
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
    Generates interviewer response for Situational phase.
    Returns plain text (not JSON).
    """

    from database import SessionLocal
    from models import InterviewPrompt

    transcript_context = transcript if transcript.strip() else "Situational round has not started yet."

    db = SessionLocal()
    prompt_obj = db.query(InterviewPrompt).filter(InterviewPrompt.prompt_key == 'situational').first()
    db.close()

    if prompt_obj and prompt_obj.prompt_text:
        prompt_template = prompt_obj.prompt_text
        prompt = prompt_template.format(
            interviewer_name=interviewer_name,
            job_role=job_role,
            company_name=company_name,
            candidate_ref=candidate_name,
            resume_context=resume_context,
            job_description=job_description,
            summary_till_now=summary_till_now,
            transcript_context=transcript_context,
            candidate_name=candidate_name
        )
    else:
        prompt = f"""
You are a professional interviewer named {interviewer_name} conducting a {job_role} interview at {company_name} for a fresher candidate named {candidate_name}.
Phase: SITUATIONAL QUESTIONS
Tone: Conversational, Natural
Resume Context: {resume_context}
Job Description: {job_description}
Summary of Previous Phases: {summary_till_now}
Aim:
- Test the candidate's decision-making skills when presented with different open-ended scenarios and choices
Task: Create a realistic scenario, either personality-based OR job-role-based and ask the candidate's reaction in that scenario.
Generate interviewer's next response in provided tone which could be a new situation or a follow-up using follow-up strategy.
Follow-up Strategy: 
- If answer is short/incomplete/unsure: probe ONCE with a hint
- If second answer still weak: move to next topic (max 2 follow-ups per topic)
- Probing example: "Can you break down your thought process behind that decision?"
Rules:
- Present the scenario and ask EXACTLY ONE question.
- Keep the scenario setup and question concise, strictly under 3-4 sentences total.
- Make scenario specific and realistic and ask one at a time
- Themes for personality assessment situations (managing conflict, dealing with tight deadlines, handling mistakes, and navigating ethical dilemmas)
- Themes for technical situations (debugging complex issues, managing tight deadlines, resolving technical disagreements, and handling project failures)
Conversation This Phase: {transcript_context}
"""

    result = ""

    async for token in llm.stream_response(prompt):
        result += token

    return result.strip()