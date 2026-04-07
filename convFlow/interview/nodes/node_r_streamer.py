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

    prompt = f"""
    You are a professional interviewer conducting a {job_role} interview.

    Current Phase: {phase.upper()}

    Job Description:
    {job_description}

    Last Question:
    {last_question}

    Candidate Answer:
    {last_answer}

    Instruction:
    You are given a context message that represents what should happen next.

    Context:
    {context_for_generator}

    Your job:
    - Convert this into a natural spoken interviewer response
    - Maintain a conversational, professional tone
    - Ask only ONE question if asking
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