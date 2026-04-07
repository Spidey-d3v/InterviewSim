
async def node_p4_situational(
    llm,
    job_role: str,
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

    prompt = f"""
You are a professional interviewer conducting a {job_role} interview for a fresher candidate named {candidate_name}.
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
- Make scenario specific and realistic and ask one at a time
- Themes for personality assessment situations (managing conflict, dealing with tight deadlines, handling mistakes, and navigating ethical dilemmas)
- Themes for technical situations (debugging complex issues, managing tight deadlines, resolving technical disagreements, and handling project failures)
Conversation This Phase: if transcript exists, then {transcript} else {"Situational round has not started yet."}
"""

    result = ""

    async for token in llm.stream_response(prompt):
        result += token

    return result.strip()