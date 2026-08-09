create table if not exists public.analysis_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  stage text not null check (
    stage in (
      'input_review',
      'concept_extraction',
      'keyword_expansion',
      'classification',
      'query_generation',
      'final_formatting'
    )
  ),
  stage_index smallint not null check (stage_index between 0 and 5),
  status text not null default 'running' check (
    status in ('running', 'completed', 'failed')
  ),
  error_message text,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 day'),
  primary key (user_id, request_id, stage)
);

create index if not exists analysis_progress_request_stage_idx
  on public.analysis_progress (user_id, request_id, stage_index);

create index if not exists analysis_progress_expires_at_idx
  on public.analysis_progress (expires_at);

alter table public.analysis_progress enable row level security;

drop policy if exists "Users can read own analysis progress"
  on public.analysis_progress;

create policy "Users can read own analysis progress"
  on public.analysis_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.analysis_progress from anon;
revoke insert, update, delete on table public.analysis_progress from authenticated;
grant select on table public.analysis_progress to authenticated;

comment on table public.analysis_progress is
  'Short-lived backend progress events for an authenticated patent-text analysis request.';
