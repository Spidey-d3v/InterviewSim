import asyncio
from typing import Any


class InferenceQueue:
    def __init__(self, max_concurrent_jobs: int = 2) -> None:
        self._semaphore = asyncio.Semaphore(max_concurrent_jobs)

    async def run(self, coro) -> Any:
        async with self._semaphore:
            return await coro