-- Consume one analysis credit after a successful analysis.

create or replace function public.consume_analysis_credit(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining_credits integer;
  v_has_transaction_type boolean;
begin
  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Cannot consume credits for another user';
  end if;

  -- Serialize consumption per user so concurrent analyses cannot spend the same credit twice.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select coalesce(remaining_credits, 0)
    into v_remaining_credits
  from public.user_credit_balances
  where user_id = p_user_id;

  v_remaining_credits := coalesce(v_remaining_credits, 0);

  if v_remaining_credits <= 0 then
    raise exception 'No analysis credits remaining';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'credit_transactions'
      and column_name = 'transaction_type'
  ) into v_has_transaction_type;

  if v_has_transaction_type then
    execute '
      insert into public.credit_transactions (
        user_id,
        credits,
        plan_id,
        source,
        transaction_type,
        metadata
      ) values ($1, -1, null, $2, $2, $3)'
    using p_user_id, 'analysis_used', jsonb_build_object('source', 'analysis_used');
  else
    insert into public.credit_transactions (
      user_id,
      credits,
      plan_id,
      source,
      metadata
    ) values (
      p_user_id,
      -1,
      null,
      'analysis_used',
      jsonb_build_object('source', 'analysis_used')
    );
  end if;
end;
$$;

grant execute on function public.consume_analysis_credit(uuid) to authenticated;
