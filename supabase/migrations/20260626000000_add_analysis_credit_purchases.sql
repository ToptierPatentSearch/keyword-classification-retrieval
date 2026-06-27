-- Credit balances and idempotent Stripe purchase grants for one-time analysis packs.

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credits integer not null check (credits <> 0),
  plan_id text check (plan_id in ('test', 'business')),
  source text not null default 'stripe_checkout',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stripe_payments_checkout_session_unique'
  ) then
    alter table public.stripe_payments
      add constraint stripe_payments_checkout_session_unique unique (stripe_checkout_session_id);
  end if;
end $$;

create index if not exists credit_transactions_user_id_idx on public.credit_transactions(user_id);

create or replace view public.user_credit_balances as
select
  user_id,
  coalesce(sum(credits), 0)::integer as remaining_credits
from public.credit_transactions
group by user_id;

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
begin
  if p_plan_id = 'test' and p_credits <> 2 then
    raise exception 'Test plan must grant exactly 2 credits';
  end if;

  if p_plan_id = 'business' and p_credits <> 10 then
    raise exception 'Business plan must grant exactly 10 credits';
  end if;

  -- Webhook idempotency: this insert is keyed by Stripe Checkout Session / Payment Intent.
  insert into public.credit_transactions (
    user_id,
    credits,
    plan_id,
    stripe_checkout_session_id,
    stripe_payment_intent_id,
    metadata
  ) values (
    p_user_id,
    p_credits,
    p_plan_id,
    p_stripe_checkout_session_id,
    p_stripe_payment_intent_id,
    jsonb_build_object('source', 'checkout.session.completed')
  )
  on conflict (stripe_checkout_session_id) do nothing;
end;
$$;

alter table public.credit_transactions enable row level security;
alter view public.user_credit_balances set (security_invoker = true);

create policy "Users can read their credit transactions"
  on public.credit_transactions for select
  using (auth.uid() = user_id);

grant select on public.user_credit_balances to authenticated;
grant select on public.credit_transactions to authenticated;
