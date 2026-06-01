-- Adds the V2 recommendation feedback column to the interview_sessions table
-- This allows storing the new structured JSON from Gemini without breaking existing data

ALTER TABLE public.interview_sessions
	ADD COLUMN IF NOT EXISTS recommendation_v2 jsonb null;
