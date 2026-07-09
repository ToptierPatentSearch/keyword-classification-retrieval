-- Expiring credit grants for one-time analysis packs.
-- Trial/Test plan credits expire after 10 days.
-- Business plan credits expire after 30 days.

alter table public.credit_transactions
  add column if not exists expires_at timestamptz;

alter table public.credit_transactions
  add column if not exists related_credit_grant_id uuid;

create table if not exists public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('test', 'business')),
  original_credits integer not null check (original_credits > 0),
  remaining_credits integer not null check (remaining_credits >= 0),
  source text not null default 'stripe_checkout',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists credit_grants_user_active_idx
  on public.credit_grants(user_id, expires_at)
  where remaining_credits > 0;

create index if not exists credit_grants_user_id_idx
  on public.credit_grants(user_id);

alter table public.credit_grants enable row level security;

drop policy if exists "Users can read their credit grants" on public.credit_grants;
create policy "Users can read their credit grants"
  on public.credit_grants for select
  using (auth.uid() = user_id);

-- Convert the public balance surface into an active-credit balance.
-- Expired grants are not counted, even if unused credits remain in the grant row.
drop view if exists public.user_credit_balances;

create or replace view public.user_credit_balances as
select
  user_id,
  coalesce(sum(remaining_credits) filter (where expires_at > now()), 0)::integer as remaining_credits,
  min(expires_at) filter (where remaining_credits > 0 and expires_at > now()) as next_expires_at
from public.credit_grants
group by user_id;

alter view public.user_credit_balances set (security_invoker = true);

grant select on public.user_credit_balances to authenticated;
grant select on public.credit_grants to authenticated;

create or replace function public.plan_validity_interval(p_plan_id text)
returns interval
language plpgsql
immutable
as $$
begin
  if p_plan_id = 'test' then
    return interval '10 days';
  end if;

  if p_plan_id = 'business' then
    return interval '30 days';
  end if;

  raise exception 'Unknown plan_id: %', p_plan_id;
end;
$$;

create or replace function public.grant_analysis_credits(
  p_user_id uuid,
  p_credits integer,
  p_plan_id text,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires_at timestamptz;
  v_credit_grant_id uuid;
begin
  if p_plan_id = 'test' and p_credits <> 2 then
    raise exception 'Test plan must grant exactly 2 credits';
  end if;

  if p_plan_id = 'business' and p_credits <> 10 then
    raise exception 'Business plan must grant exactly 10 credits';
  end if;

  if p_plan_id not in ('test', 'business') then
    raise exception 'Unknown plan_id: %', p_plan_id;
  end if;

  v_expires_at := now() + public.plan_validity_interval(p_plan_id);

  insert into public.credit_grants (
    user_id,
    plan_id,
    original_credits,
    remaining_credits,
    source,
    stripe_checkout_session_id,
    stripe_payment_intent_id,
    metadata,
    expires_at
  ) values (
    p_user_id,
    p_plan_id,
    p_credits,
    p_credits,
    'stripe_checkout',
    p_stripe_checkout_session_id,
    p_stripe_payment_intent_id,
    jsonb_build_object(
      'source', 'checkout.session.completed',
      'validity_days', case when p_plan_id = 'test' then 10 else 30 end
    ),
    v_expires_at
  )
  on conflict (stripe_checkout_session_id) do nothing
  returning id into v_credit_grant_id;

  -- When the Checkout Session was already processed, keep the webhook idempotent.
  if v_credit_grant_id is null then
    return;
  end if;

  insert into public.credit_transactions (
    user_id,
    credits,
    plan_id,
    source,
    stripe_checkout_session_id,
    stripe_payment_intent_id,
    metadata,
    expires_at,
    related_credit_grant_id
  ) values (
    p_user_id,
    p_credits,
    p_plan_id,
    'stripe_checkout',
    p_stripe_checkout_session_id,
    p_stripe_payment_intent_id,
    jsonb_build_object(
      'source', 'checkout.session.completed',
      'validity_days', case when p_plan_id = 'test' then 10 else 30 end
    ),
    v_expires_at,
    v_credit_grant_id
  )
  on conflict (stripe_checkout_session_id) do nothing;
end;
$$;

create or replace function public.consume_analysis_credit(
  p_user_id uuid,
  p_source text default 'analysis'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant record;
begin
  -- Serialize consumption per user so double-clicks or parallel requests cannot overspend credits.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select id, plan_id, expires_at
    into v_grant
  from public.credit_grants
  where user_id = p_user_id
    and remaining_credits > 0
    and expires_at > now()
  order by expires_at asc, created_at asc
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
    related_credit_grant_id
  ) values (
    p_user_id,
    -1,
    v_grant.plan_id,
    p_source,
    jsonb_build_object('source', p_source, 'credit_grant_id', v_grant.id),
    v_grant.expires_at,
    v_grant.id
  );

  return true;
end;
$$;

grant execute on function public.grant_analysis_credits(uuid, integer, text, text, text) to service_role;
grant execute on function public.consume_analysis_credit(uuid, text) to service_role;
