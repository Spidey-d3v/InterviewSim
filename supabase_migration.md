-- =========================================================================
-- MIGRATION SCRIPT: RENAME LEGACY ML SCORING COLUMNS
-- =========================================================================
-- Run this script ONCE in your Supabase SQL Editor.
-- Instead of dropping the old columns and losing historical data, this gracefully
-- renames them to accurately reflect exactly what they represent in the new Praat & Gaze pipeline.

-- 1. Drop the constraints that enforce the old 0 to 1 score ranges, 
-- because WPM and Focus % will easily exceed 1.0
ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_confidence_range,
  DROP CONSTRAINT IF EXISTS interview_sessions_facial_range,
  DROP CONSTRAINT IF EXISTS interview_sessions_voice_range;

-- 2. Safely rename the columns to their new accurate labels
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='interview_sessions' AND column_name='overall_confidence_score') THEN
    ALTER TABLE public.interview_sessions RENAME COLUMN overall_confidence_score TO overall_camera_engagement;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='interview_sessions' AND column_name='overall_facial_expression_score') THEN
    ALTER TABLE public.interview_sessions RENAME COLUMN overall_facial_expression_score TO average_focus;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='interview_sessions' AND column_name='overall_voice_score') THEN
    ALTER TABLE public.interview_sessions RENAME COLUMN overall_voice_score TO average_wpm;
  END IF;
END $$;

-- 3. (Optional sanity check) Ensure the new JSONB columns are present
ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS llm_evaluation_json jsonb null,
  ADD COLUMN IF NOT EXISTS overall_gaze_distribution jsonb not null default '{"forward":0,"left":0,"right":0,"down":0,"away":0}'::jsonb;
