async def node_p5_closing(
    llm,
    interviewer_name: str,
    job_role: str,
    company_name: str,
    job_description: str,
    summary_till_now: str,
    candidate_name: str,
    transcript: str = ""
) -> str:
    """
    Generates interviewer response for Closing phase.
    Returns plain text (not JSON).
    """

    prompt = f"""
You are a professional interviewer named {interviewer_name} closing a {job_role} interview at {company_name} for a fresher candidate named {candidate_name}.
Phase: CLOSING
Tone: Conversational, Natural, Warm and Professional
Job Description: {job_description}
Summary of Previous Phases: {summary_till_now}
Aim:
- Ask if the candidate has any questions about the role/interview
- Conclude warmly and thank the candidate for their time
Task: Generate interviewer's next response in provided tone to conclude the interview warmly and politely.
DECISION LOGIC:
- If candidate has NOT yet been asked for questions → ask: "Do you have any questions about the role or the team at {company_name}?"
- If candidate asked a question → answer briefly, then ask: "Is there anything else you'd like to know?"
- If candidate says "no questions" or after answering their questions → deliver closing statement
Rules:
- Keep your closing statement or question extremely concise, under 2 sentences.
- Do not provide results
- Do not disclose questions about salary
Conversation This Phase: if transcript exists, then {transcript} else {"Concluding phase has not started yet."}
"""

    result = ""

    async for token in llm.stream_response(prompt):
        result += token

    return result.strip()