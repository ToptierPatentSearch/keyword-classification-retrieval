create table if not exists public.ai_request_usage_logs (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique,
  stage text not null,
  response_format text,
  model text not null,
  status text not null check (status in ('started', 'succeeded', 'failed')),
  http_status integer,
  openai_response_id text,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_request_usage_logs_started_at_idx
  on public.ai_request_usage_logs (started_at desc);

create index if not exists ai_request_usage_logs_status_idx
  on public.ai_request_usage_logs (status, started_at desc);

alter table public.ai_request_usage_logs enable row level security;

revoke all on table public.ai_request_usage_logs from anon, authenticated;
grant select, insert, update on table public.ai_request_usage_logs to service_role;

comment on table public.ai_request_usage_logs is
  'One durable row for each actual external OpenAI request made by an Edge Function.';

comment on column public.ai_request_usage_logs.call_id is
  'Application-generated identifier inserted before the external request starts.';

comment on column public.ai_request_usage_logs.cached_input_tokens is
  'Input tokens served from prompt cache, when reported by the OpenAI Responses API.';

comment on column public.ai_request_usage_logs.reasoning_tokens is
  'Reasoning-token portion of output usage, when reported by the model.';
