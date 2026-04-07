async def update_summary(llm, previous_summary: str, new_transcript: str):

    prompt = f"""
You are summarizing an interview for future conversational use.

Previous Summary:
{previous_summary}

New Transcript:
{new_transcript}

Task:
- Merge both
- Maintain flow of conversation
- Keep it concise but context-rich
- Preserve key details, skills, and answers

Output: updated summary
"""

    result = ""
    async for token in llm.stream_response(prompt):
        result += token

    return result.strip()