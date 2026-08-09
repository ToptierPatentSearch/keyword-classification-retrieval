alter table public.credit_transactions
  add column if not exists request_id uuid;
alter table public.credit_transactions
  add column if not exists input_hash text;
create unique index if not exists
  credit_transactions_analysis_request_unique
on public.credit_transactions (user_id, request_id)
where source = 'analysis'
  and request_id is not null;
create or replace function public.consume_analysis_credit_once(
  p_user_id uuid,
  p_source text,
  p_request_id uuid,
  p_input_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant record;
  v_existing_hash text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select ct.input_hash
    into v_existing_hash
  from public.credit_transactions ct
  where ct.user_id = p_user_id
    and ct.source = p_source
    and ct.request_id = p_request_id
  limit 1;

  if found then
    if v_existing_hash is distinct from p_input_hash then
      raise exception
        'request_id was previously used with different input';
    end if;

    return true;
  end if;

  select
    cg.id,
    cg.plan_id,
    cg.expires_at
  into v_grant
  from public.credit_grants cg
  where cg.user_id = p_user_id
    and cg.remaining_credits > 0
    and cg.expires_at > pg_catalog.now()
  order by cg.expires_at asc, cg.created_at asc
  for update
  limit 1;

  if not found then
    return false;
  end if;

  update public.credit_grants
  set remaining_credits = remaining_credits - 1
  where id = v_grant.id;

  insert into public.credit_transactions (
    user_id,
    credits,
    plan_id,
    source,
    metadata,
    expires_at,
    related_credit_grant_id,
    request_id,
    input_hash
  )
  values (
    p_user_id,
    -1,
    v_grant.plan_id,
    p_source,
    jsonb_build_object(
      'source', p_source,
      'credit_grant_id', v_grant.id,
      'request_id', p_request_id
    ),
    v_grant.expires_at,
    v_grant.id,
    p_request_id,
    p_input_hash
  );

  return true;
end;
$$;
revoke execute on function
  public.consume_analysis_credit_once(uuid, text, uuid, text)
from public, anon, authenticated;
grant execute on function
  public.consume_analysis_credit_once(uuid, text, uuid, text)
to service_role;
