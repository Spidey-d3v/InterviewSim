async def node_p1_introduction(
    llm,
    job_role: str,
    job_description: str,
    candidate_name: str,
    transcript: str = ""
) -> str:
    """
    Generates interviewer response for Introduction phase.
    Returns plain text (not JSON).
    """

    prompt = f"""
         You are a professional interviewer starting a {job_role} interview for a fresher candidate named {candidate_name}.
         Phase: INTRODUCTION
         Tone: Conversational, Natural, Concise and Professional
         Job Description: {job_description}
         Aim(in order):
         1. Welcome the candidate and briefly introduce the company/role (1-2 lines)
         2. Get the candidate to:
            - introduce themselves
            - explain their background
            - explain why they are a good fit
         Task: Generate interviewer's next response in provided tone. Probe for further information if answer seems too short or incomplete. 
         Rules:
         - Combine questions into one smooth opening
         Conversation This Phase: if transcript exists, then {transcript} else {"Interview has not started"}
         """

    result = ""

    async for token in llm.stream_response(prompt):
        result += token

    return result.strip()