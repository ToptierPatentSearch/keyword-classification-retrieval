-- Stripe Checkout persistence for Supabase Auth users.
-- The create-checkout-session Edge Function writes to these tables with the service-role key.

create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.stripe_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null references public.stripe_customers(stripe_customer_id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  mode text not null check (mode in ('payment', 'subscription')),
  price_id text not null,
  quantity integer not null default 1 check (quantity between 1 and 99),
  status text,
  payment_status text,
  success_url text not null,
  cancel_url text not null,
  allow_promotion_codes boolean not null default true,
  trial_period_days integer check (trial_period_days is null or trial_period_days >= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null references public.stripe_customers(stripe_customer_id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_checkout_session_id text references public.stripe_checkout_sessions(stripe_checkout_session_id) on delete set null,
  price_id text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null references public.stripe_customers(stripe_customer_id) on delete cascade,
  stripe_checkout_session_id text references public.stripe_checkout_sessions(stripe_checkout_session_id) on delete set null,
  stripe_payment_intent_id text unique,
  price_id text not null,
  amount_total bigint,
  currency text,
  payment_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists stripe_checkout_sessions_user_id_idx on public.stripe_checkout_sessions(user_id);
create index if not exists stripe_checkout_sessions_price_id_idx on public.stripe_checkout_sessions(price_id);
create index if not exists stripe_subscriptions_user_id_idx on public.stripe_subscriptions(user_id);
create index if not exists stripe_subscriptions_status_idx on public.stripe_subscriptions(status);
create index if not exists stripe_payments_user_id_idx on public.stripe_payments(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_stripe_customers_updated_at on public.stripe_customers;
create trigger set_stripe_customers_updated_at
before update on public.stripe_customers
for each row execute function public.set_updated_at();

drop trigger if exists set_stripe_checkout_sessions_updated_at on public.stripe_checkout_sessions;
create trigger set_stripe_checkout_sessions_updated_at
before update on public.stripe_checkout_sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_stripe_subscriptions_updated_at on public.stripe_subscriptions;
create trigger set_stripe_subscriptions_updated_at
before update on public.stripe_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists set_stripe_payments_updated_at on public.stripe_payments;
create trigger set_stripe_payments_updated_at
before update on public.stripe_payments
for each row execute function public.set_updated_at();

alter table public.stripe_customers enable row level security;
alter table public.stripe_checkout_sessions enable row level security;
alter table public.stripe_subscriptions enable row level security;
alter table public.stripe_payments enable row level security;
alter table public.stripe_webhook_events enable row level security;

create policy "Users can read their Stripe customer"
  on public.stripe_customers for select
  using (auth.uid() = user_id);

create policy "Users can read their Checkout sessions"
  on public.stripe_checkout_sessions for select
  using (auth.uid() = user_id);

create policy "Users can read their subscriptions"
  on public.stripe_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can read their payments"
  on public.stripe_payments for select
  using (auth.uid() = user_id);
