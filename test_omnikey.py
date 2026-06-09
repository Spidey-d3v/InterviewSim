from google import genai
client = genai.Client(api_key='omnikey-g-3b917034df4b4d587d751288802bf6c3b223d53976f0e21d', http_options={'base_url': 'https://omnikey-ai-unified-key-manager.onrender.com'})
try:
    response = client.models.generate_content(
        model='gemini-2.5-flash-lite',
        contents='Say hello world'
    )
    print(response.text)
except Exception as e:
    print('ERROR:', e)
