import os
from dotenv import load_dotenv
from typing import AsyncGenerator, Optional, List, Dict
from google import genai
import asyncio
import json

from pathlib import Path
load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env")

api_key = os.getenv("GEMINI_API_KEY")
http_opts = {'base_url': 'https://omnikey-ai-unified-key-manager.onrender.com'} if api_key and api_key.startswith('omnikey') else None
client = genai.Client(api_key=api_key, http_options=http_opts)

class StreamingInterviewLLM:
    def __init__(
        self,
        model_name: str = "gemini-2.5-flash-lite",
        temperature: float = 0.4,
        max_tokens: int = 700,
    ):
        self.model_name = model_name
        self.temperature = temperature
        self.max_tokens = max_tokens
        
        # Override with DB config if available
        try:
            from database import SessionLocal
            from models import EngineConfig
            db = SessionLocal()
            config = db.query(EngineConfig).filter(EngineConfig.id == 1).first()
            if config:
                self.temperature = config.llm_temperature
                self.max_tokens = config.llm_max_tokens
            db.close()
        except Exception as e:
            print(f"Error loading EngineConfig: {e}")

    async def stream_response(
        self,
        prompt: str
    ) -> AsyncGenerator[str, None]:

        stream = client.models.generate_content_stream(
            model=self.model_name,
            contents=prompt,
            config={
                "temperature": self.temperature,
                "max_output_tokens": self.max_tokens,
            },
        )

        for chunk in stream:
            if chunk.text:
                yield chunk.text
                await asyncio.sleep(0)  # allow event loop switch