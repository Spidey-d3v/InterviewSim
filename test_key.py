import google.generativeai as genai
genai.configure(api_key='AIzaSyCqmcMCgNdahPgPWIwrTDNhe6_h56r1gcg')
model = genai.GenerativeModel('gemini-1.5-flash')
print(model.generate_content('Hello').text)
