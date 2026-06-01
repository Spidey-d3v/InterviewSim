ALTER TABLE public.interview_sessions
DROP COLUMN IF EXISTS overall_confidence_score,
DROP COLUMN IF EXISTS overall_facial_expression_score,
DROP COLUMN IF EXISTS overall_voice_score;
