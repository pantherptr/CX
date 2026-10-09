-- The Owner can make (and remove) admins from the Users list.
--
-- Until now exactly one admin could exist: a unique index (0018) enforced it
-- and a trigger (0016/0021/0048) silently reset profiles.is_admin on every
-- UPDATE so no client could ever change it. That protection stays — nobody can
-- grant themselves anything — but the Owner may now appoint others through one
-- narrow function, and every change is written to the owner audit log.
--
--   * the single-admin index goes (several admins are now allowed);
--   * the trigger lets is_admin change ONLY inside owner_set_admin(), which
--     checks is_owner() first and marks its own transaction with a local flag;
--   * the Owner account itself cannot be changed this way.

drop index if exists public.profiles_single_admin;

create or replace function public.lock_is_admin_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(current_setting('cx.allow_admin_change', true), 'off') <> 'on' then
    new.is_admin := old.is_admin;
  end if;
  new.is_owner := old.is_owner;
  if not public.is_owner() then
    new.suspended := old.suspended;
  end if;
  if not public.is_admin() then
    new.is_verified_client := old.is_verified_client;
  end if;
  return new;
end;
$$;

create or replace function public.owner_set_admin(p_user_id uuid, p_value boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_target_owner boolean;
begin
  if not public.is_owner() then
    raise exception 'Only the Owner can change admins';
  end if;
  select is_owner into v_target_owner from public.profiles where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
  if v_target_owner then raise exception 'The Owner account cannot be changed'; end if;

  perform set_config('cx.allow_admin_change', 'on', true);
  update public.profiles set is_admin = p_value where id = p_user_id;
  perform set_config('cx.allow_admin_change', 'off', true);

  insert into public.owner_audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), case when p_value then 'grant_admin' else 'revoke_admin' end, 'user', p_user_id::text, null);
end;
$$;

grant execute on function public.owner_set_admin(uuid, boolean) to authenticated;
