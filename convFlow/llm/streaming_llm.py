import os
from dotenv import load_dotenv
from typing import AsyncGenerator, Optional, List, Dict
import httpx
import asyncio
import json

from pathlib import Path
load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env")

class StreamingInterviewLLM:
    def __init__(
        self,
        model_name: str = "gemma3:1b",
        temperature: float = 0.4,
        max_tokens: int = 700,
        api_base: str = "http://localhost:11434/api/generate"
    ):
        self.model_name = model_name
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.api_base = api_base

    async def stream_response(
        self,
        prompt: str
    ) -> AsyncGenerator[str, None]:
        payload = {
            "model": self.model_name,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": self.temperature,
                "num_predict": self.max_tokens,
            }
        }

        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Removed timeout to allow slow local generation to complete
                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream("POST", self.api_base, json=payload) as response:
                        if response.status_code != 200:
                            error_body = await response.aread()
                            print(f"⚠️ Ollama API error on attempt {attempt+1}: {response.status_code} - {error_body}")
                            if attempt < max_retries - 1:
                                await asyncio.sleep(2 ** attempt)  # Exponential backoff (1s, 2s)
                                continue
                            raise Exception(f"Ollama API error: {response.status_code} - {error_body}")

                        async for line in response.aiter_lines():
                            if not line:
                                continue
                            try:
                                chunk = json.loads(line)
                                if "response" in chunk:
                                    yield chunk["response"]
                                    await asyncio.sleep(0)
                                if chunk.get("done"):
                                    return  # Successful completion, exit generator
                            except json.JSONDecodeError:
                                continue
            except httpx.RequestError as e:
                print(f"⚠️ Ollama connection error on attempt {attempt+1}: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise e
