begin;

create table if not exists public.app_runtime_settings (
  setting_key text primary key,
  maintenance_enabled boolean not null default false,
  maintenance_title text not null default 'Scheduled Maintenance',
  maintenance_message text not null default
    'The patent analysis service is temporarily unavailable while maintenance is performed.',
  expected_back_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint app_runtime_settings_global_key_check
    check (setting_key = 'global'),
  constraint app_runtime_settings_title_length_check
    check (char_length(btrim(maintenance_title)) between 1 and 120),
  constraint app_runtime_settings_message_length_check
    check (char_length(btrim(maintenance_message)) between 1 and 1000)
);

comment on table public.app_runtime_settings is
  'Publicly readable application operating status. Only privileged database roles may change it.';

comment on column public.app_runtime_settings.maintenance_enabled is
  'When true, the frontend shows the maintenance announcement and the analyze Edge Function returns HTTP 503.';

insert into public.app_runtime_settings (
  setting_key,
  maintenance_enabled,
  maintenance_title,
  maintenance_message,
  expected_back_at,
  updated_at
)
values (
  'global',
  false,
  'Scheduled Maintenance',
  'The patent analysis service is temporarily unavailable while maintenance is performed.',
  null,
  now()
)
on conflict (setting_key) do nothing;

alter table public.app_runtime_settings enable row level security;

revoke all on table public.app_runtime_settings from anon, authenticated;
grant select on table public.app_runtime_settings to anon, authenticated;

drop policy if exists "Public can read application runtime settings"
  on public.app_runtime_settings;

create policy "Public can read application runtime settings"
on public.app_runtime_settings
for select
to anon, authenticated
using (setting_key = 'global');

commit;

-- Enable maintenance mode from the Supabase SQL Editor:
--
-- update public.app_runtime_settings
-- set
--   maintenance_enabled = true,
--   maintenance_title = 'Scheduled System Maintenance',
--   maintenance_message =
--     'Keyword and classification analysis is temporarily unavailable while the service is updated.',
--   expected_back_at = '2026-08-03 21:00:00+09',
--   updated_at = now()
-- where setting_key = 'global';
--
-- Restore normal analyze mode:
--
-- update public.app_runtime_settings
-- set
--   maintenance_enabled = false,
--   expected_back_at = null,
--   updated_at = now()
-- where setting_key = 'global';
