import uuid
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base

class Profile(Base):
    __tablename__ = 'profiles'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    resume_text = Column(String, nullable=True)
    resume_json = Column(JSONB, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=text('now()'), onupdate=lambda: datetime.now(timezone.utc))

    sessions = relationship("InterviewSession", back_populates="profile", cascade="all, delete-orphan")


class InterviewSession(Base):
    __tablename__ = 'interview_sessions'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(String, nullable=False, unique=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('profiles.id', ondelete='CASCADE'), nullable=False)
    
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    question_metrics_json = Column(JSONB, nullable=False, server_default='[]')
    average_focus = Column(Float, nullable=True)
    overall_gaze_distribution = Column(JSONB, nullable=False, server_default='{"forward":0,"left":0,"right":0,"down":0,"away":0}')
    
    total_questions = Column(Integer, nullable=False, server_default='0')
    total_chunks = Column(Integer, nullable=False, server_default='0')
    
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text('now()'))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text('now()'), onupdate=lambda: datetime.now(timezone.utc))
    
    llm_evaluation_json = Column(JSONB, nullable=True)
    recommendation_v2 = Column(JSONB, nullable=True)

    profile = relationship("Profile", back_populates="sessions")

class JobRole(Base):
    __tablename__ = 'job_roles'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_name = Column(String, nullable=False, unique=True)
    description = Column(String, nullable=True)
    panel_size = Column(Integer, nullable=False, default=1)
    
    question_bank_json = Column(JSONB, nullable=False, server_default='[]')
    
    created_at = Column(DateTime(timezone=True), server_default=text('now()'))
    updated_at = Column(DateTime(timezone=True), server_default=text('now()'), onupdate=lambda: datetime.now(timezone.utc))

class InterviewPrompt(Base):
    __tablename__ = 'interview_prompts'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prompt_key = Column(String, nullable=False, unique=True)  # e.g., 'core_tech', 'intro', 'resume', 'situational'
    prompt_text = Column(String, nullable=False)
    description = Column(String, nullable=True)
    
    updated_at = Column(DateTime(timezone=True), server_default=text('now()'), onupdate=lambda: datetime.now(timezone.utc))

class EngineConfig(Base):
    __tablename__ = 'engine_configs'

    id = Column(Integer, primary_key=True, default=1)
    llm_temperature = Column(Float, nullable=False, default=0.7)
    llm_max_tokens = Column(Integer, nullable=False, default=150)
    vision_focus_threshold = Column(Float, nullable=False, default=0.3)
    
    updated_at = Column(DateTime(timezone=True), server_default=text('now()'), onupdate=lambda: datetime.now(timezone.utc))
