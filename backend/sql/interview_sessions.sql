create table if not exists public.interview_sessions (
	id uuid primary key default gen_random_uuid(),
	session_id text not null unique,
	user_id uuid not null references public.profiles(id) on delete cascade,
	started_at timestamptz null,
	completed_at timestamptz null,
	question_metrics_json jsonb not null default '[]'::jsonb,
	overall_confidence_score double precision null,
	overall_facial_expression_score double precision null,
	overall_voice_score double precision null,
	overall_gaze_distribution jsonb not null default '{"forward":0,"left":0,"right":0,"down":0,"away":0}'::jsonb,
	total_questions integer not null default 0,
	total_chunks integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint interview_sessions_confidence_range check (
		overall_confidence_score is null or (overall_confidence_score >= 0 and overall_confidence_score <= 1)
	),
	constraint interview_sessions_facial_range check (
		overall_facial_expression_score is null or (overall_facial_expression_score >= 0 and overall_facial_expression_score <= 1)
	),
	constraint interview_sessions_voice_range check (
		overall_voice_score is null or (overall_voice_score >= 0 and overall_voice_score <= 1)
	)
);

create index if not exists idx_interview_sessions_user_created
	on public.interview_sessions (user_id, created_at desc);

create index if not exists idx_interview_sessions_completed_at
	on public.interview_sessions (completed_at desc);

alter table public.interview_sessions
	add column if not exists overall_gaze_distribution jsonb not null default '{"forward":0,"left":0,"right":0,"down":0,"away":0}'::jsonb;

alter table public.interview_sessions
	drop column if exists overall_gaze_forward_pct,
	drop column if exists overall_gaze_left_pct,
	drop column if exists overall_gaze_right_pct,
	drop column if exists overall_gaze_down_pct,
	drop column if exists overall_gaze_away_pct;
 