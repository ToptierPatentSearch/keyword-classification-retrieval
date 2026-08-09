-- Structured administrator error logging for keyword-classification-retrieval.
-- Run this migration before deploying the Edge Function integration.
--
-- Security model:
--   * Edge Functions write through public.log_app_error() using service_role.
--   * Administrators read public.error_logs when app_metadata.role = 'admin'.
--   * Administrators resolve entries through public.resolve_app_error().
--   * Ordinary authenticated users and anonymous users receive no access.

create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id uuid null references auth.users(id) on delete set null,
  request_id uuid null,
  component text not null
    check (char_length(component) between 1 and 100),
  operation text not null
    check (char_length(operation) between 1 and 160),
  environment text not null default 'production'
    check (environment in ('production', 'staging', 'preview', 'development', 'test')),
  release text null
    check (release is null or char_length(release) <= 100),
  severity text not null default 'error'
    check (severity in ('warning', 'error', 'critical')),
  error_code text null
    check (error_code is null or char_length(error_code) <= 120),
  message text not null
    check (char_length(message) between 1 and 2000),
  http_status smallint null
    check (http_status is null or http_status between 100 and 599),
  retryable boolean not null default false,
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object')
    check (octet_length(details::text) <= 16000),
  status text not null default 'open'
    check (status in ('open', 'resolved', 'ignored')),
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id) on delete set null,
  resolution_note text null
    check (resolution_note is null or char_length(resolution_note) <= 2000),
  constraint error_logs_resolution_state_check check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or
    (status in ('resolved', 'ignored') and resolved_at is not null and resolved_by is not null)
  )
);
comment on table public.error_logs is
  'Administrator-only structured operational errors. Never store patent text, authorization headers, API keys, secrets, or payment data.';
comment on column public.error_logs.details is
  'Safe technical metadata only, such as database code, upstream status, elapsed milliseconds, or result counts.';
create index error_logs_occurred_at_idx
  on public.error_logs (occurred_at desc);
create index error_logs_open_severity_idx
  on public.error_logs (severity, occurred_at desc)
  where status = 'open';
create index error_logs_user_id_idx
  on public.error_logs (user_id, occurred_at desc)
  where user_id is not null;
create index error_logs_request_id_idx
  on public.error_logs (request_id)
  where request_id is not null;
alter table public.error_logs enable row level security;
alter table public.error_logs force row level security;
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;
drop policy if exists "Administrators can read error logs" on public.error_logs;
create policy "Administrators can read error logs"
  on public.error_logs
  for select
  to authenticated
  using (public.is_app_admin());
revoke all on table public.error_logs from anon, authenticated;
grant select on table public.error_logs to authenticated;
create or replace function public.log_app_error(
  p_component text,
  p_operation text,
  p_message text,
  p_environment text default 'production',
  p_release text default null,
  p_severity text default 'error',
  p_error_code text default null,
  p_http_status integer default null,
  p_retryable boolean default false,
  p_user_id uuid default null,
  p_request_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_message text;
  v_details jsonb;
begin
  v_message := left(
    coalesce(nullif(btrim(p_message), ''), 'Unspecified application error'),
    2000
  );

  v_details := case
    when p_details is null then '{}'::jsonb
    when jsonb_typeof(p_details) <> 'object' then
      jsonb_build_object('details_omitted', true, 'reason', 'not_an_object')
    when octet_length(p_details::text) > 16000 then
      jsonb_build_object('details_omitted', true, 'reason', 'size_limit')
    else p_details
  end;

  insert into public.error_logs (
    user_id,
    request_id,
    component,
    operation,
    environment,
    release,
    severity,
    error_code,
    message,
    http_status,
    retryable,
    details
  )
  values (
    p_user_id,
    p_request_id,
    left(coalesce(nullif(btrim(p_component), ''), 'unknown'), 100),
    left(coalesce(nullif(btrim(p_operation), ''), 'unknown'), 160),
    coalesce(nullif(btrim(p_environment), ''), 'production'),
    nullif(left(coalesce(p_release, ''), 100), ''),
    coalesce(nullif(btrim(p_severity), ''), 'error'),
    nullif(left(coalesce(p_error_code, ''), 120), ''),
    v_message,
    p_http_status,
    coalesce(p_retryable, false),
    v_details
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.log_app_error(
  text, text, text, text, text, text, text, integer, boolean, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.log_app_error(
  text, text, text, text, text, text, text, integer, boolean, uuid, uuid, jsonb
) to service_role;
create or replace function public.resolve_app_error(
  p_error_id uuid,
  p_status text default 'resolved',
  p_resolution_note text default null
)
returns public.error_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.error_logs;
begin
  if not public.is_app_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if p_status not in ('resolved', 'ignored') then
    raise exception 'Status must be resolved or ignored'
      using errcode = '22023';
  end if;

  update public.error_logs
  set
    status = p_status,
    resolved_at = now(),
    resolved_by = auth.uid(),
    resolution_note = nullif(left(coalesce(p_resolution_note, ''), 2000), '')
  where id = p_error_id
    and status = 'open'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Open error log not found'
      using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;
revoke all on function public.resolve_app_error(uuid, text, text) from public, anon;
grant execute on function public.resolve_app_error(uuid, text, text) to authenticated;
-- Optional verification after assigning app_metadata.role = 'admin' to the
-- administrator's Supabase Auth user:
--
-- select id, occurred_at, severity, component, operation, message, status
-- from public.error_logs
-- order by occurred_at desc
-- limit 100;;
