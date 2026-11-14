-- 0149 · Owner can delete a profile completely
--
-- The Owner deletes a person from Admin → Users (… menu → "Delete profile"). The account, the profile and everything
-- that hangs off them (cars, bookings, messages, posts, saved cars, devices…) go with it, and the e-mail address is
-- free again: signing up or logging in with it later creates a brand-new, empty profile. Meant for test accounts and
-- for people who ask to be erased.
--
-- Safety:
--   · Owner only; never yourself, never another Owner.
--   · Refused while the person (as renter or as host) has a CONFIRMED or PAYING booking that has not ended yet:
--     cancel or finish those first, so nobody is left paid-for without a car (or a host without a payout).
--   · Written to owner_audit_log (who, which e-mail, when) before the delete.
-- Not touched: files already uploaded to Storage stay as orphans (harmless, small), and anything held by Stripe
-- (customer / Connect account) stays at Stripe: remove those from the Stripe dashboard if you want them gone.
--
-- Paste in the Supabase SQL Editor. Safe to run more than once.

create or replace function public.owner_delete_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_name text;
  v_busy int;
begin
  if not public.is_owner() then
    raise exception 'Only the Owner can delete a profile';
  end if;
  if p_user_id is null then
    raise exception 'No user given';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own profile here';
  end if;
  if coalesce((select p.is_owner from public.profiles p where p.id = p_user_id), false) then
    raise exception 'An Owner profile cannot be deleted';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user_id;
  select p.full_name into v_name from public.profiles p where p.id = p_user_id;
  if v_email is null and v_name is null then
    raise exception 'This profile does not exist (anymore)';
  end if;

  select count(*) into v_busy
    from public.bookings b
   where (b.renter_id = p_user_id or b.host_id = p_user_id)
     and b.status in ('confirmed', 'payment_processing')
     and b.end_date >= current_date;
  if v_busy > 0 then
    raise exception 'This person has % confirmed or paying booking(s) that have not ended yet. Cancel or finish them first.', v_busy;
  end if;

  -- the one reference to profiles that does not cascade
  delete from public.booking_inspections where uploaded_by = p_user_id;

  insert into public.owner_audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'delete_user', 'user', p_user_id::text, jsonb_build_object('email', v_email, 'name', v_name));

  -- everything else hangs off auth.users / profiles with ON DELETE CASCADE
  delete from auth.users where id = p_user_id;
  -- a profile left without an auth row (should not happen) goes too
  delete from public.profiles where id = p_user_id;

  return coalesce(v_email, v_name);
end;
$$;

revoke all on function public.owner_delete_user(uuid) from public, anon;
grant execute on function public.owner_delete_user(uuid) to authenticated;
