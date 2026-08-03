begin;

do $$
begin
  if to_regprocedure('public.get_admin_user_activity()') is null then
    raise exception
      'Required administrator authorization function public.get_admin_user_activity() is missing.';
  end if;
end
$$;

create or replace function public.current_user_can_manage_runtime_settings()
returns boolean
language plpgsql
security invoker
stable
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  -- Reuse the same protected administrator check already used by the app.
  -- The function raises an error for non-administrators.
  perform 1
  from public.get_admin_user_activity()
  limit 1;

  return true;
exception
  when others then
    return false;
end;
$$;

comment on function public.current_user_can_manage_runtime_settings() is
  'Returns true only when the signed-in user passes the existing protected administrator access check.';

revoke all on function public.current_user_can_manage_runtime_settings()
  from public, anon, authenticated;

create or replace function public.set_admin_runtime_settings(
  p_maintenance_enabled boolean,
  p_maintenance_title text,
  p_maintenance_message text,
  p_expected_back_at timestamptz default null
)
returns table (
  setting_key text,
  maintenance_enabled boolean,
  maintenance_title text,
  maintenance_message text,
  expected_back_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_maintenance_title, ''));
  v_message text := btrim(coalesce(p_maintenance_message, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if not public.current_user_can_manage_runtime_settings() then
    raise exception 'Administrator access is required.'
      using errcode = '42501';
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception 'Maintenance title must contain between 1 and 120 characters.'
      using errcode = '22023';
  end if;

  if char_length(v_message) < 1 or char_length(v_message) > 1000 then
    raise exception 'Maintenance message must contain between 1 and 1000 characters.'
      using errcode = '22023';
  end if;

  if p_maintenance_enabled
     and p_expected_back_at is not null
     and p_expected_back_at <= now() then
    raise exception 'Expected restoration time must be in the future.'
      using errcode = '22023';
  end if;

  return query
  update public.app_runtime_settings as settings
  set
    maintenance_enabled = p_maintenance_enabled,
    maintenance_title = v_title,
    maintenance_message = v_message,
    expected_back_at = case
      when p_maintenance_enabled then p_expected_back_at
      else null
    end,
    updated_at = now()
  where settings.setting_key = 'global'
  returning
    settings.setting_key,
    settings.maintenance_enabled,
    settings.maintenance_title,
    settings.maintenance_message,
    settings.expected_back_at,
    settings.updated_at;

  if not found then
    raise exception 'Global application runtime settings were not found.'
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.set_admin_runtime_settings(boolean, text, text, timestamptz) is
  'Allows an authenticated administrator to publish or remove the global maintenance announcement.';

revoke all on function public.set_admin_runtime_settings(boolean, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_admin_runtime_settings(boolean, text, text, timestamptz)
  to authenticated;

commit;
