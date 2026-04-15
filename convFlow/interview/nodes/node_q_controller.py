import asyncio
import json
from typing import Dict, Any, Optional

async def node_q_controller(
    llm,
    state: Dict[str, Any],
    candidate_answer: str,
    phase_config: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Runs in parallel with phase nodes.
    Returns control signal that may override phase node output.
    """
    
    # Track word count for phase timeout
    current_phase = state["phase"]
    phase_word_count = state.get("phase_word_count", 0)
    candidate_words = len(candidate_answer.split())
    state["phase_word_count"] = phase_word_count + candidate_words
    
    # Check 1: Phase timeout based on word limits
    word_limit = phase_config.get(current_phase, {}).get("max_words", 300)
    if state["phase_word_count"] >= word_limit:
        return {
            "intervention_needed": True,
            "intervention_type": "phase_transition",
            "reason": f"Phase exceeded word limit ({state['phase_word_count']}/{word_limit} words)",
            "next_phase": _get_next_phase(current_phase),
            "context_for_generator": _get_transition_message(current_phase),
            "should_override_phase_node": True
        }
    
    # Check 2: Abrupt behaviour detection (LLM call)
    behaviour_result = await _detect_abrupt_behaviour(llm, candidate_answer, state)
    
    if behaviour_result["is_abrupt"]:
        if behaviour_result.get("type", "").lower() == "explicit_phase_skip":
            return {
                "intervention_needed": True,
                "intervention_type": "phase_transition",
                "reason": behaviour_result["reason"],
                "next_phase": _get_next_phase(current_phase),
                "context_for_generator": behaviour_result["response_message"],
                "should_override_phase_node": True
            }

        return {
            "intervention_needed": True,
            "intervention_type": "abrupt_behaviour",
            "sub_type": behaviour_result["type"],
            "reason": behaviour_result["reason"],
            "context_for_generator": behaviour_result["response_message"],
            "should_terminate": behaviour_result.get("should_terminate", False),
            "should_override_phase_node": True
        }
    
    # Check 3: Phase satisfaction (LLM decides if phase goals are met)
    if state["phase_question_count"] >= 2:  # Don't check too early
        satisfaction = await _check_phase_satisfaction(llm, state, current_phase)
        if satisfaction["is_satisfied"]:
            return {
                "intervention_needed": True,
                "intervention_type": "phase_transition",
                "reason": satisfaction["reason"],
                "next_phase": _get_next_phase(current_phase),
                "context_for_generator": satisfaction.get("transition_message", "Let's move to the next section."),
                "should_override_phase_node": True
            }
    
    # No intervention needed
    return {
        "intervention_needed": False,
        "should_override_phase_node": False
    }


async def _detect_abrupt_behaviour(llm, answer: str, state: Dict) -> Dict:
    """Detect abusive, off-topic, or disruptive behaviour."""
    
    prompt = f"""
You are monitoring a technical interview. Detect if the candidate's response shows abrupt behaviour.

Candidate answer: "{answer}"

Interview phase: {state["phase"]}
Previous context summary: {state.get("rolling_summary", "")[:500]}

Detect these behaviours:

1. ABUSIVE: Swearing, personal attacks, hostile language, discrimination
2. REINTRODUCTION: Candidate tries to restart interview ("Can we start over?", "I want to redo my introduction", Gives a new name and tries to override.)
3. OFF_TOPIC: Completely unrelated to interview (sports, politics, personal rants)
4. REPEAT: Did not hear last question ("Could you repeat that question?")
5. REFUSAL: Refuses to answer ("I won't answer that", "Skip this question")
6. CONFUSION_ABOUT_ROLE: Asks "What company is this?", "What job am I applying for?"
7. REQUEST_TO_TERMINATE: "I want to end the interview", "I'm done"
8. EXPLICIT_PHASE_SKIP: Candidate explicitly asks to change/move to the next phase ("Can we move to the next phase?", "Next section please")

If NO abrupt behaviour, return: {{"is_abrupt": false}}

If abrupt behaviour detected, return JSON:
{{
    "is_abrupt": true,
    "type": "abusive|reintroduction|off_topic|refusal|confusion|termination_request|explicit_phase_skip",
    "reason": "brief explanation",
    "response_message": "professional response to say to candidate",
    "should_terminate": true/false
}}

For abuse/termination: should_terminate = true
For others: should_terminate = false

Response message examples:
- Abuse: "I'll end the interview here. Thank you for your time."
- Explicit Phase Skip: "Of course. Let's move on to the next section."
- Reintroduction: "We're already in the {state["phase"]} phase. Please answer the current question."
- Off-topic: "Let's return to the interview question about {state["last_question"]}."
- Refusal: "I understand. Let me rephrase the question: {state["last_question"]}"
- Repeat: "I understand. Let me repeat the last question: {state["last_question"]}"
- Confusion: "You're interviewing for {state["job_role"]} at {state["company_name"]}. Let's continue."
"""

    result = ""
    async for token in llm.stream_response(prompt):
        result += token
    
    try:
        import re
        json_match = re.search(r"\{.*\}", result, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(0))
    except:
        pass
    
    return {"is_abrupt": False}


async def _check_phase_satisfaction(llm, state: Dict, phase: str) -> Dict:
    """LLM decides if current phase goals are mostly satisfied."""
    
    prompt = f"""
Interview Phase: {phase}
Questions asked this phase: {state.get("phase_question_count", 0)}
Candidate answers summary: {state.get("rolling_summary", "")[-800:]}

Phase completion criteria:

INTRO (satisfied when):
- Candidate introduced themselves
- Explained background
- Stated why they're a good fit

RESUME (satisfied when):
- Work experience discussed (if any)
- Projects discussed (if any)
- Key JD skills matched to candidate experience

CORE_TECH (satisfied when):
- At least 4 distinct technical topics covered
- OR candidate clearly struggling after 6+ questions

SITUATIONAL (satisfied when):
- At least 2 scenarios discussed

CLOSING (satisfied when):
- Candidate asked if they have questions
- Candidate's questions answered OR they said "no"
- Closing statement delivered

Is this phase mostly satisfied? Return JSON:
{{
    "is_satisfied": true/false,
    "reason": "explanation",
    "transition_message": "natural transition sentence (if satisfied)"
}}
"""
    
    result = ""
    async for token in llm.stream_response(prompt):
        result += token
    
    try:
        import re
        json_match = re.search(r"\{.*\}", result, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(0))
    except:
        pass
    
    return {"is_satisfied": False, "reason": "LLM check failed", "transition_message": ""}


def _get_next_phase(current_phase: str) -> str:
    """Determine next phase in sequence."""
    phase_order = ["intro", "resume", "core_tech", "situational", "closing"]
    try:
        current_idx = phase_order.index(current_phase)
        if current_idx < len(phase_order) - 1:
            return phase_order[current_idx + 1]
    except ValueError:
        pass
    return "closing"  # fallback


def _get_transition_message(phase: str) -> str:
    """Natural transition message for phase change."""
    messages = {
        "intro": "Thanks for the introduction. Let's move on to your experience.",
        "resume": "Great. Now let's dive into some technical questions.",
        "core_tech": "Good. Now I'd like to ask a few situational questions.",
        "situational": "Thanks for those responses. Before we wrap up, do you have any questions?",
        "closing": "Thank you for your time today. We'll be in touch."
    }
    return messages.get(phase, "Let's continue to the next section.")