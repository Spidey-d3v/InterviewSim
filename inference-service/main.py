from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from batch_queue import InferenceQueue
from models import InferenceModels


models = InferenceModels()
queue = InferenceQueue(max_concurrent_jobs=2)


class ChunkInferenceRequest(BaseModel):
    chunk_id: str = Field(..., min_length=1)
    video_path: str = Field(..., min_length=1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await models.initialize()
    yield


app = FastAPI(title="inference-service", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "models_initialized": True,
    }


@app.post("/infer/chunk")
async def infer_chunk(payload: ChunkInferenceRequest) -> dict:
    try:
        result = await queue.run(
            models.analyze_chunk(video_path=payload.video_path, chunk_id=payload.chunk_id)
        )
        return {
            "chunk_id": payload.chunk_id,
            "result": result,
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"inference failed: {exc}") from exc