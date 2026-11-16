-- 0150 — Privacy lockdown for profiles and cars.
--
-- Why: RLS decides which ROWS someone may read, not which COLUMNS. profiles had
-- `using (true)` since 0001, so every column of every profile (phone, Stripe ids,
-- suspended flag…) was readable with the public anon key. cars had the same problem
-- for the exact pick-up spot (lat/lng/address_label/location) and the review notes.
-- Separately, the "update own profile" policy let a signed-in person PATCH their own
-- verified / rating / trips / signal_plan / stripe_customer_id.
--
-- What this does:
--   1. Column privileges: anon + authenticated can SELECT every column of profiles and
--      cars EXCEPT the private ones listed below. NOTE: a column added later is private
--      by default — grant it explicitly if the public needs it.
--   2. cars.lat_approx / lng_approx (rounded to ~1 km) are public, for the map.
--   3. Private data comes through SECURITY DEFINER functions that check who is asking:
--        get_my_profile()            your own full profile
--        car_private(ids)            exact spot + review note: host, team, or a renter
--                                    with a confirmed/completed booking of that car
--        owner_profile_private(ids)  phone + suspended, team only
--        owner_suspended_host_count()
--   4. Triggers stop people from writing trust columns on their own profile / car.
--   5. A booking's pick-up place is filled from the car on the server (the renter's
--      browser no longer knows the exact address before booking).
--   6. anon cannot execute owner_* / admin_* functions at all.
--
-- Safe to run more than once.

-- ============================================================
-- 1. Approximate position of a car (public)
-- ============================================================
alter table public.cars
  add column if not exists lat_approx double precision
    generated always as (round(lat::numeric, 2)::double precision) stored,
  add column if not exists lng_approx double precision
    generated always as (round(lng::numeric, 2)::double precision) stored;

-- ============================================================
-- 2. Column privileges
-- ============================================================
do $$
declare
  v_cols text;
begin
  -- profiles
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in (
      'phone', 'stripe_customer_id', 'stripe_connect_account_id', 'stripe_connect_payouts_enabled',
      'suspended', 'welcome_pass_seen_at', 'signal_plan_since'
    );
  execute 'revoke select on public.profiles from anon, authenticated';
  execute format('grant select (%s) on public.profiles to anon, authenticated', v_cols);
  -- Profiles are created by the sign-up trigger, never by the browser.
  execute 'revoke insert, delete on public.profiles from anon, authenticated';
  execute 'revoke update on public.profiles from anon';

  -- cars
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'cars'
    and column_name not in (
      'lat', 'lng', 'address_label', 'location',
      'review_note', 'review_claimed_at', 'review_claimed_by', 'reviewed_by'
    );
  execute 'revoke select on public.cars from anon, authenticated';
  execute format('grant select (%s) on public.cars to anon, authenticated', v_cols);
  execute 'revoke insert, update, delete on public.cars from anon';
end $$;

-- ============================================================
-- 3. Reading private data, for the people allowed to
-- ============================================================
create or replace function public.get_my_profile()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select to_jsonb(p) from public.profiles p where p.id = (select auth.uid());
$$;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.car_private(p_ids uuid[])
returns table (id uuid, lat double precision, lng double precision, address_label text, location text, review_note text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.lat, c.lng, c.address_label, c.location,
         case when c.host_id = (select auth.uid()) or public.is_admin() then c.review_note end
  from public.cars c
  where (select auth.uid()) is not null
    and c.id = any (p_ids[1:300])
    and (
      c.host_id = (select auth.uid())
      or public.is_admin()
      or exists (
        select 1 from public.bookings b
        where b.car_id = c.id
          and b.renter_id = (select auth.uid())
          and b.status in ('confirmed', 'completed')
      )
    );
$$;
revoke all on function public.car_private(uuid[]) from public, anon;
grant execute on function public.car_private(uuid[]) to authenticated;

create or replace function public.owner_profile_private(p_ids uuid[])
returns table (id uuid, phone text, suspended boolean)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the team can read this';
  end if;
  return query select p.id, p.phone, p.suspended from public.profiles p where p.id = any (p_ids[1:500]);
end;
$$;
revoke all on function public.owner_profile_private(uuid[]) from public, anon;
grant execute on function public.owner_profile_private(uuid[]) to authenticated;

create or replace function public.owner_suspended_host_count()
returns integer
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the team can read this';
  end if;
  return (select count(*)::int from public.profiles where is_host and suspended);
end;
$$;
revoke all on function public.owner_suspended_host_count() from public, anon;
grant execute on function public.owner_suspended_host_count() to authenticated;

-- ============================================================
-- 4. Trust columns cannot be written from the browser
-- ============================================================
-- Not SECURITY DEFINER on purpose: current_user is then the role of the statement.
-- A browser request runs as anon/authenticated; our own SECURITY DEFINER functions
-- (set_signal_username, mark_welcome_pass_seen, admin_set_signal_plan…) and the
-- server key (service_role) run as someone else and keep working.
create or replace function public.lock_profile_trust_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  new.verified := old.verified;
  new.is_superhost := old.is_superhost;
  new.rating := old.rating;
  new.trips := old.trips;
  new.joined := old.joined;
  new.signal_plan := old.signal_plan;
  new.signal_plan_since := old.signal_plan_since;
  new.stripe_customer_id := old.stripe_customer_id;
  new.welcome_pass_seen_at := old.welcome_pass_seen_at;
  new.username := old.username;
  new.username_normalized := old.username_normalized;
  -- "host" comes with a car: nobody becomes a host (and gets Creator with it) without one.
  if new.is_host and not old.is_host
     and not exists (select 1 from public.cars c where c.host_id = new.id) then
    new.is_host := false;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_lock_trust_columns on public.profiles;
create trigger profiles_lock_trust_columns
  before update on public.profiles
  for each row execute function public.lock_profile_trust_columns();

create or replace function public.lock_car_trust_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.rating := 0;
    new.trips := 0;
  else
    new.rating := old.rating;
    new.trips := old.trips;
  end if;
  return new;
end;
$$;

drop trigger if exists cars_lock_trust_columns on public.cars;
create trigger cars_lock_trust_columns
  before insert or update on public.cars
  for each row execute function public.lock_car_trust_columns();

-- ============================================================
-- 5. A booking's pick-up place comes from the car, on the server
-- ============================================================
create or replace function public.fill_booking_pickup_location()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_place text;
begin
  if new.fulfillment_type is distinct from 'delivery' then
    select coalesce(nullif(c.address_label, ''), c.location) into v_place from public.cars c where c.id = new.car_id;
    if v_place is not null then
      new.pickup_location := v_place;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_fill_pickup_location on public.bookings;
create trigger bookings_fill_pickup_location
  before insert on public.bookings
  for each row execute function public.fill_booking_pickup_location();

-- ============================================================
-- 6. Team-only functions are not callable without signing in
-- ============================================================
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'owner\_%' or p.proname like 'admin\_%'
           or p.proname like 'signal\_demo\_admin%' or p.proname = 'signal_hidden_content')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
