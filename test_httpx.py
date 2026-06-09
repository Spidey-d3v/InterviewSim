import httpx
import asyncio

async def test():
    url = 'https://omnikey-ai-unified-key-manager.onrender.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=omnikey-g-3b917034df4b4d587d751288802bf6c3b223d53976f0e21d'
    payload = {
        "contents": [{"parts": [{"text": "Extract candidate_name (string), skills (list), and experience (list of objects) from this resume. Return ONLY raw JSON with keys: candidate_name, skills, experience. Resume text: John Doe. Skills: Python, React. Experience: Developer at Google 2020-2023."}]}]
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, timeout=10.0)
        text = response.json()['candidates'][0]['content']['parts'][0]['text']
        print("RETURNED TEXT FROM AI:")
        print(text)

asyncio.run(test())
