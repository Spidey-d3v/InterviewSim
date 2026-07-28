from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from database import get_db
import models
from pydantic import BaseModel

router = APIRouter()

# --- Job Roles ---
@router.get("/roles")
def get_roles(db: Session = Depends(get_db)):
    roles = db.query(models.JobRole).order_by(models.JobRole.created_at.asc()).all()
    return [{"id": str(r.id), "role_name": r.role_name, "description": r.description, "panel_size": r.panel_size, "question_bank_json": r.question_bank_json} for r in roles]

class RoleCreate(BaseModel):
    role_name: str
    description: str = ""
    panel_size: int = 1
    question_bank_json: list = []

@router.post("/roles")
def create_role(role: RoleCreate, db: Session = Depends(get_db)):
    db_role = models.JobRole(**role.dict())
    db.add(db_role)
    db.commit()
    db.refresh(db_role)
    return db_role

# --- Interview Sessions ---
@router.get("/sessions")
def get_sessions(db: Session = Depends(get_db)):
    sessions = db.query(models.InterviewSession).order_by(models.InterviewSession.created_at.desc()).all()
    return [{
        "id": str(s.id), "session_id": s.session_id, "user_id": str(s.user_id),
        "started_at": s.started_at, "completed_at": s.completed_at,
        "average_focus": s.average_focus, "total_questions": s.total_questions
    } for s in sessions]

@router.get("/sessions/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(models.InterviewSession).filter(models.InterviewSession.session_id == session_id).first()
    if not session:
        # try matching by id if uuid was passed
        session = db.query(models.InterviewSession).filter(models.InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.get("/sessions/{session_id}/timeline")
def get_session_timeline(session_id: str, db: Session = Depends(get_db)):
    events = db.query(models.InterviewTimeline).filter(models.InterviewTimeline.session_id == session_id).order_by(models.InterviewTimeline.timestamp_seconds.asc()).all()
    return {"events": [{"id": str(e.id), "timestamp_seconds": e.timestamp_seconds, "metric_type": e.metric_type, "is_red_flag": e.is_red_flag, "raw_data_json": e.raw_data_json} for e in events]}

# --- Prompts ---
@router.get("/prompts")
def get_prompts(db: Session = Depends(get_db)):
    prompts = db.query(models.InterviewPrompt).all()
    return [{"id": str(p.id), "prompt_key": p.prompt_key, "prompt_text": p.prompt_text, "description": p.description} for p in prompts]

class PromptUpdate(BaseModel):
    prompt_text: str
    description: str = ""

@router.put("/prompts/{prompt_key}")
def update_prompt(prompt_key: str, prompt: PromptUpdate, db: Session = Depends(get_db)):
    db_prompt = db.query(models.InterviewPrompt).filter(models.InterviewPrompt.prompt_key == prompt_key).first()
    if not db_prompt:
        db_prompt = models.InterviewPrompt(prompt_key=prompt_key)
        db.add(db_prompt)
    db_prompt.prompt_text = prompt.prompt_text
    db_prompt.description = prompt.description
    db.commit()
    return {"status": "success"}

# --- Engine Config ---
@router.get("/engine")
def get_engine_config(db: Session = Depends(get_db)):
    config = db.query(models.EngineConfig).first()
    if not config:
        config = models.EngineConfig()
        db.add(config)
        db.commit()
        db.refresh(config)
    return {"llm_temperature": config.llm_temperature, "llm_max_tokens": config.llm_max_tokens, "vision_focus_threshold": config.vision_focus_threshold}

class EngineUpdate(BaseModel):
    llm_temperature: float
    llm_max_tokens: int
    vision_focus_threshold: float

@router.put("/engine")
def update_engine_config(config: EngineUpdate, db: Session = Depends(get_db)):
    db_config = db.query(models.EngineConfig).first()
    if not db_config:
        db_config = models.EngineConfig()
        db.add(db_config)
    db_config.llm_temperature = config.llm_temperature
    db_config.llm_max_tokens = config.llm_max_tokens
    db_config.vision_focus_threshold = config.vision_focus_threshold
    db.commit()
    return {"status": "success"}
