import time
import json
import os
import urllib.error
import urllib.request
from typing import Any

from backend.redis_client import RedisSessionStore
from backend.worker import celery_app


session_store = RedisSessionStore.from_env()
INFERENCE_SERVICE_URL = os.getenv("INFERENCE_SERVICE_URL", "http://localhost:8001")


@celery_app.task(name="backend.healthcheck")
def healthcheck() -> dict[str, Any]:
    return {
        "worker": "interview_backend",
        "redis_ok": session_store.ping(),
        "timestamp": time.time(),
    }


@celery_app.task(bind=True, name="backend.enqueue_chunk_analysis")
def enqueue_chunk_analysis(
    self,
    *,
    session_id: str,
    chunk_id: str,
    chunk_index: int,
    video_path: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    session_store.initialize_session(session_id, status="active")
    session_store.register_chunk(
        session_id=session_id,
        chunk_id=chunk_id,
        chunk_index=chunk_index,
        video_path=video_path,
        metadata=metadata,
    )
    session_store.update_chunk(chunk_id, status="queued", task_id=self.request.id)
    session_store.append_event(
        session_id,
        "chunk_enqueued",
        {"chunk_id": chunk_id, "chunk_index": chunk_index, "task_id": self.request.id},
    )

    return {
        "session_id": session_id,
        "chunk_id": chunk_id,
        "chunk_index": chunk_index,
        "status": "queued",
        "task_id": self.request.id,
        "message": "Chunk queued. Dispatch backend.run_chunk_inference to execute ML inference.",
    }


@celery_app.task(bind=True, name="backend.run_chunk_inference")
def run_chunk_inference(
    self,
    *,
    session_id: str,
    chunk_id: str,
) -> dict[str, Any]:
    chunk = session_store.get_chunk(chunk_id)
    if chunk is None:
        raise KeyError(f"Unknown chunk_id: {chunk_id}")

    session_store.update_chunk(chunk_id, status="processing", started_task_id=self.request.id)
    session_store.append_event(
        session_id,
        "chunk_processing_started",
        {"chunk_id": chunk_id, "task_id": self.request.id},
    )

    request_payload = {
        "chunk_id": chunk_id,
        "video_path": chunk["video_path"],
    }
    req = urllib.request.Request(
        url=f"{INFERENCE_SERVICE_URL}/infer/chunk",
        data=json.dumps(request_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=300) as response:
            body = response.read().decode("utf-8")
            payload = json.loads(body)
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        message = f"inference-service HTTP {exc.code}: {error_body}"
        session_store.update_chunk(chunk_id, status="failed", error=message, failed_task_id=self.request.id)
        session_store.append_event(
            session_id,
            "chunk_failed",
            {"chunk_id": chunk_id, "task_id": self.request.id, "message": message},
        )
        return {
            "session_id": session_id,
            "chunk_id": chunk_id,
            "status": "failed",
            "message": message,
        }
    except Exception as exc:
        message = f"inference-service request failed: {exc}"
        session_store.update_chunk(chunk_id, status="failed", error=message, failed_task_id=self.request.id)
        session_store.append_event(
            session_id,
            "chunk_failed",
            {"chunk_id": chunk_id, "task_id": self.request.id, "message": message},
        )
        return {
            "session_id": session_id,
            "chunk_id": chunk_id,
            "status": "failed",
            "message": message,
        }

    result = payload.get("result", payload)
    session_store.update_chunk(
        chunk_id,
        status="completed",
        result=result,
        error=None,
        completed_task_id=self.request.id,
    )
    session_store.append_event(
        session_id,
        "chunk_completed",
        {"chunk_id": chunk_id, "task_id": self.request.id},
    )
    return {
        "session_id": session_id,
        "chunk_id": chunk_id,
        "status": "completed",
        "result": result,
    }


@celery_app.task(bind=True, name="backend.record_chunk_result")
def record_chunk_result(
    self,
    *,
    session_id: str,
    chunk_id: str,
    result: dict[str, Any],
) -> dict[str, Any]:
    chunk = session_store.update_chunk(
        chunk_id,
        status="completed",
        result=result,
        error=None,
        completed_task_id=self.request.id,
    )
    session_store.append_event(
        session_id,
        "chunk_completed",
        {"chunk_id": chunk_id, "task_id": self.request.id},
    )
    return chunk


@celery_app.task(bind=True, name="backend.record_chunk_error")
def record_chunk_error(
    self,
    *,
    session_id: str,
    chunk_id: str,
    message: str,
) -> dict[str, Any]:
    chunk = session_store.update_chunk(
        chunk_id,
        status="failed",
        error=message,
        failed_task_id=self.request.id,
    )
    session_store.append_event(
        session_id,
        "chunk_failed",
        {"chunk_id": chunk_id, "task_id": self.request.id, "message": message},
    )
    return chunk