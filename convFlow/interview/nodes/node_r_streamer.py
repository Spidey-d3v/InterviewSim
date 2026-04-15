async def node_r_generate_stream(
    llm,
    state,
    context_for_generator: str
):
    """
    Unified response generator.
    Converts structured context into natural interviewer speech.
    Streams output.
    """

    phase = state.get("phase", "intro")
    job_role = state.get("job_role", "")
    job_description = state.get("job_description", "")
    last_question = state.get("last_question", "")
    last_answer = state.get("last_answer", "")
    company_name = state.get("company_name", "")
    candidate_name = state.get("candidate_name", "")
    interviewer_name = state.get("interviewer_name", "")
    transcript = state.get("transcript", "")

    prompt = f"""
    You are a professional interviewer named {interviewer_name} conducting a {job_role} interview at {company_name} for a fresher candidate named {candidate_name}.
    Current Phase: {phase.upper()}
    Job Description:
    {job_description}
    Instruction:
    You are given a context message that represents what should happen next.
    Context:
    {context_for_generator}
    Last Question:
    {last_question}
    Candidate Answer:
    {last_answer}
    Transcript:
    {transcript}
    Your job:
    - Convert this into a natural spoken interviewer response
    - Maintain a conversational, professional tone
    - Do not use any placeholders and avoid talking about information you do not know like your name
    - If it's a transition → make it smooth
    - If it's a probe → be concise and targeted
    - If it's a closing/termination → be polite and professional
    Rules:
    - Do NOT output meta instructions
    - Do NOT mention "context" or "phase"
    - Do NOT sound robotic
    - Keep it concise and realistic
    Generate the next interviewer response.
"""

    async for token in llm.stream_response(prompt):
        yield token