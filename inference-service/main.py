import fitz
import httpx
import json
import os
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client

from pathlib import Path
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

# Initialize Clients
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/parse-resume")
async def parse_resume(
    file: UploadFile = File(...), 
    user_id: str = Form(...),
    user_email: str = Form(...),
    user_full_name: str = Form(...) # Received from Auth metadata
):
    try:
        # 1. Text Extraction
        pdf_content = await file.read()
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        raw_text = "".join([page.get_text() for page in doc])
        doc.close()

        # 2. AI Parsing - We only ask for Skills and Experience now
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={GEMINI_API_KEY}"
        
        payload = {
            "contents": [{
                "parts": [{
                    "text": (
                        "Extract candidate_name (string), skills (list), and experience (list of objects) "
                        "from this resume. Return ONLY raw JSON with keys: candidate_name, skills, experience. "
                        f"Resume text: {raw_text}"
                    )
                }]
            }],
            "generationConfig": {"response_mime_type": "application/json"}
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=40.0)
            ai_data = json.loads(response.json()['candidates'][0]['content']['parts'][0]['text'])

        # 3. Database Upsert
        # Everything here is now sourced from your App's Auth, except the resume data
        supabase.table("profiles").upsert({
            "id": user_id, 
            "email": user_email,           # Auth Email
            "full_name": user_full_name,   # Auth Name
            "resume_text": raw_text,
            "resume_json": ai_data,
            "updated_at": "now()"
        }).execute()

        return {"status": "success", "data": ai_data}

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))