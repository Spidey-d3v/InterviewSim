import json
import os
import time
from typing import Any

import redis


class RedisSessionStore:
    def __init__(self, redis_url: str) -> None:
        self.redis_url = redis_url
        self.client = redis.Redis.from_url(redis_url, decode_responses=True)

    @classmethod
    def from_env(cls) -> "RedisSessionStore":
        return cls(os.getenv("REDIS_URL", "redis://localhost:6379/0"))

    def ping(self) -> bool:
        return bool(self.client.ping())

    def initialize_session(self, session_id: str, **metadata: Any) -> dict[str, Any]:
        payload = {
            "session_id": session_id,
            "status": metadata.pop("status", "created"),
            "created_at": time.time(),
            "updated_at": time.time(),
            **metadata,
        }
        self.client.set(self._session_key(session_id), json.dumps(payload))
        return payload

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        raw = self.client.get(self._session_key(session_id))
        if raw is None:
            return None
        return json.loads(raw)

    def update_session(self, session_id: str, **updates: Any) -> dict[str, Any]:
        session = self.get_session(session_id) or self.initialize_session(session_id)
        session.update(updates)
        session["updated_at"] = time.time()
        self.client.set(self._session_key(session_id), json.dumps(session))
        return session

    def register_chunk(
        self,
        *,
        session_id: str,
        chunk_id: str,
        chunk_index: int,
        video_path: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        chunk = {
            "session_id": session_id,
            "chunk_id": chunk_id,
            "chunk_index": chunk_index,
            "video_path": video_path,
            "status": "queued",
            "result": None,
            "error": None,
            "created_at": time.time(),
            "updated_at": time.time(),
            "metadata": metadata or {},
        }
        self.client.set(self._chunk_key(chunk_id), json.dumps(chunk))
        self.client.zadd(self._session_chunks_key(session_id), {chunk_id: chunk_index})
        return chunk

    def get_chunk(self, chunk_id: str) -> dict[str, Any] | None:
        raw = self.client.get(self._chunk_key(chunk_id))
        if raw is None:
            return None
        return json.loads(raw)

    def update_chunk(self, chunk_id: str, **updates: Any) -> dict[str, Any]:
        chunk = self.get_chunk(chunk_id)
        if chunk is None:
            raise KeyError(f"Unknown chunk_id: {chunk_id}")
        chunk.update(updates)
        chunk["updated_at"] = time.time()
        self.client.set(self._chunk_key(chunk_id), json.dumps(chunk))
        return chunk

    def append_event(self, session_id: str, event_type: str, payload: dict[str, Any]) -> None:
        entry = {
            "type": event_type,
            "timestamp": time.time(),
            "payload": payload,
        }
        self.client.rpush(self._events_key(session_id), json.dumps(entry))

    def list_chunk_ids(self, session_id: str) -> list[str]:
        return self.client.zrange(self._session_chunks_key(session_id), 0, -1)

    def list_chunks(self, session_id: str) -> list[dict[str, Any]]:
        chunk_ids = self.list_chunk_ids(session_id)
        chunks: list[dict[str, Any]] = []
        for chunk_id in chunk_ids:
            chunk = self.get_chunk(chunk_id)
            if chunk is not None:
                chunks.append(chunk)
        return chunks

    @staticmethod
    def _session_key(session_id: str) -> str:
        return f"session:{session_id}"

    @staticmethod
    def _chunk_key(chunk_id: str) -> str:
        return f"chunk:{chunk_id}"

    @staticmethod
    def _session_chunks_key(session_id: str) -> str:
        return f"session:{session_id}:chunks"

    @staticmethod
    def _events_key(session_id: str) -> str:
        return f"session:{session_id}:events"