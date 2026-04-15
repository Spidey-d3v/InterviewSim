async def node_s_evaluator(llm, phase: str, transcript: str):

    phase_metrics = {
        "intro": ["communication", "clarity", "confidence"],
        "resume": ["relevance", "depth", "impact"],
        "core_tech": ["technical_depth", "correctness", "problem_solving"],
        "situational": ["reasoning", "decision_making", "communication"],
        "closing": ["professionalism", "curiosity", "engagement"],
    }

    metrics = phase_metrics.get(phase.lower(), [])
    metrics_str = "\n- ".join(metrics)

    prompt = f"""
You are evaluating a candidate interview.

Phase: {phase}

Transcript:
{transcript}

Evaluate on:

1. ONE universal metric:
- overall_performance (0-10)

2. THREE phase-specific metrics for this phase:
- {metrics_str}

3. Provide PROFESSIONAL INTERVIEW ADVICE:
- Give 3–5 concise, actionable suggestions
- Focus on how the candidate can improve their responses
- Be specific (not generic)
- Tailor advice to this phase

Return STRICT JSON:
{{
    "overall": int,
    "metrics": {{
        {', '.join([f'"{m}": int' for m in metrics])}
    }},
    "advice": [
        "string",
        "string",
        "string"
    ]
}}
"""

    result = ""
    async for token in llm.stream_response(prompt):
        result += token

    import json, re
    try:
        match = re.search(r"\{.*\}", result, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))

            # Ensure only relevant metrics are returned
            filtered_metrics = {k: parsed.get("metrics", {}).get(k, 0) for k in metrics}

            # Ensure advice is always a list of strings
            advice = parsed.get("advice", [])
            if not isinstance(advice, list):
                advice = []
            advice = [str(a) for a in advice][:5]  # cap to avoid verbosity

            return {
                "overall": parsed.get("overall", 0),
                "metrics": filtered_metrics,
                "advice": advice
            }
    except:
        pass

    return {
        "overall": 0,
        "metrics": {k: 0 for k in metrics},
        "advice": []
    }