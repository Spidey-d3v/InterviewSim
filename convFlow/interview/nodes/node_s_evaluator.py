async def node_s_evaluator(llm, phase: str, transcript: str):

    prompt = f"""
You are evaluating a candidate interview.

Phase: {phase}

Transcript:
{transcript}

Evaluate on:

1. ONE universal metric:
- overall_performance (0-10)

2. THREE phase-specific metrics:

INTRO:
- communication
- clarity
- confidence

RESUME:
- relevance
- depth
- impact

CORE_TECH:
- technical_depth
- correctness
- problem_solving

SITUATIONAL:
- reasoning
- decision_making
- communication

CLOSING:
- professionalism
- curiosity
- engagement

Return JSON:
{{
    "overall": int,
    "metrics": {{
        "metric1": int,
        "metric2": int,
        "metric3": int
    }}
}}
"""

    result = ""
    async for token in llm.stream_response(prompt):
        result += token

    import json, re
    try:
        match = re.search(r"\{.*\}", result, re.DOTALL)
        if match:
            return json.loads(match.group(0))
    except:
        pass

    return {"overall": 0, "metrics": {}}