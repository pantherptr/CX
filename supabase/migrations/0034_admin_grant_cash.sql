-- Admin control over the Luxury Car Empire economy — lets the site
-- admin (public.is_admin(), see 0016/0018) see every player's cash and
-- adjust it directly, instead of the cash column being editable only by
-- gameplay itself. Same posture as every other admin capability in this
-- codebase: a dedicated security-definer RPC gated on is_admin(), never
-- a raw client-side UPDATE — cash mutation is otherwise locked to the
-- functions in 0030_luxury_car_empire.sql by design (see that file's
-- header comment), so this is one deliberate, audited bypass.

create policy "Admins view all Empire state"
  on public.game_player_state for select
  using (public.is_admin());

-- Adds to a player's cash (e.g. "give €50,000").
create or replace function public.admin_grant_cash(p_user_id uuid, p_amount numeric)
returns public.game_player_state
language plpgsql
security definer set search_path = public
as $$
declare
  v_state public.game_player_state;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  perform public.ensure_player_state(p_user_id);

  update public.game_player_state
  set cash = cash + p_amount
  where user_id = p_user_id
  returning * into v_state;

  return v_state;
end;
$$;

-- Sets a player's cash to an exact value (e.g. reset to €0, or dial in a
-- specific balance for testing a scenario).
create or replace function public.admin_set_cash(p_user_id uuid, p_amount numeric)
returns public.game_player_state
language plpgsql
security definer set search_path = public
as $$
declare
  v_state public.game_player_state;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_amount < 0 then
    raise exception 'Amount cannot be negative';
  end if;

  perform public.ensure_player_state(p_user_id);

  update public.game_player_state
  set cash = p_amount
  where user_id = p_user_id
  returning * into v_state;

  return v_state;
end;
$$;

grant execute on function public.admin_grant_cash(uuid, numeric) to authenticated;
grant execute on function public.admin_set_cash(uuid, numeric) to authenticated;

-- One-time test grant: +€500,000 for the admin account. Runs as a direct
-- update rather than through admin_grant_cash() above — this statement
-- executes as part of the migration itself (no logged-in app session),
-- so auth.uid() is null here and that function's is_admin() check would
-- always reject it. A migration is already a trusted, superuser context
-- (same reasoning as 0018_single_admin_bootstrap.sql's direct
-- `update profiles set is_admin`), so bypassing the RPC here is correct,
-- not a workaround.
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower('pantherptrbusiness@gmail.com');
  if v_user_id is not null then
    perform public.ensure_player_state(v_user_id);
    update public.game_player_state set cash = cash + 500000 where user_id = v_user_id;
  end if;
end $$;
