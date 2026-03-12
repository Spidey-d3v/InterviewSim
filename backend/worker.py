import os

from celery import Celery


def create_celery_app() -> Celery:
    app = Celery(
        "interview_backend",
        broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1"),
        backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2"),
        include=["backend.tasks"],
    )

    app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        broker_connection_retry_on_startup=True,
        result_expires=3600,
        task_routes={
            "backend.healthcheck": {"queue": "control"},
            "backend.enqueue_chunk_analysis": {"queue": "chunk-control"},
            "backend.run_chunk_inference": {"queue": "chunk-inference"},
            "backend.record_chunk_result": {"queue": "chunk-results"},
            "backend.record_chunk_error": {"queue": "chunk-results"},
        },
    )
    return app


celery_app = create_celery_app()