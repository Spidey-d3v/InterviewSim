create table if not exists public.interview_sessions (
	id uuid primary key default gen_random_uuid(),
	session_id text not null unique,
	user_id uuid not null references public.profiles(id) on delete cascade,
	started_at timestamptz null,
	completed_at timestamptz null,
	question_metrics_json jsonb not null default '[]'::jsonb,
	overall_camera_engagement double precision null,
	average_focus double precision null,
	average_wpm double precision null,
	overall_gaze_distribution jsonb not null default '{"forward":0,"left":0,"right":0,"down":0,"away":0}'::jsonb,
	total_questions integer not null default 0,
	total_chunks integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_interview_sessions_user_created
	on public.interview_sessions (user_id, created_at desc);

create index if not exists idx_interview_sessions_completed_at
	on public.interview_sessions (completed_at desc);

alter table public.interview_sessions
	add column if not exists overall_gaze_distribution jsonb not null default '{"forward":0,"left":0,"right":0,"down":0,"away":0}'::jsonb,
	add column if not exists llm_evaluation_json jsonb null;

-- Run these only if the old columns exist, to preserve data history
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

alter table public.interview_sessions
	drop column if exists overall_gaze_forward_pct,
	drop column if exists overall_gaze_left_pct,
	drop column if exists overall_gaze_right_pct,
	drop column if exists overall_gaze_down_pct,
	drop column if exists overall_gaze_away_pct;