-- Listing review window.
--
-- A host who presses Publish does not go live instantly: the listing is held for 5 minutes so the
-- CX team can look at it (photos, the hero pose, the details). In that window the team can approve
-- it (live now) or send it back with a reason. If nobody on the team has opened it by the time the
-- 5 minutes are up, it is published automatically. If a teammate has opened it, the hold is
-- extended (up to 10 minutes from when they opened it) until they decide.
--
-- Implemented without the enum or a scheduler:
--   * the listing stays status = 'draft' while it waits (so every existing "published only" rule keeps
--     hiding it), with review_status = 'pending' and publish_at = the deadline;
--   * promote_due_listings() flips the ones that are due to 'published'. The app calls it whenever
--     cars are listed, so nothing needs a cron job; pg_cron can call it too.

alter table public.cars
  add column if not exists review_status text not null default 'approved',
  add column if not exists publish_at timestamptz,
  add column if not exists review_note text,
  add column if not exists review_claimed_at timestamptz,
  add column if not exists review_claimed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists submitted_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cars_review_status_chk') then
    alter table public.cars add constraint cars_review_status_chk
      check (review_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists cars_review_idx on public.cars (review_status, publish_at) where review_status = 'pending';

-- ---------------------------------------------------------------- the gate
-- A non-admin who sets status = 'published' is routed through the review window instead — unless the
-- listing was already approved before (pausing and un-pausing your own approved car is not re-reviewed).
create or replace function public.gate_car_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('cx.car_review', true), '') = 'on' or public.is_admin() then
    return new;
  end if;

  if new.status = 'published' then
    if tg_op = 'UPDATE' and old.review_status = 'approved' and old.submitted_at is not null then
      return new; -- already went through review once
    end if;
    new.status := 'draft';
    new.review_status := 'pending';
    new.publish_at := now() + interval '5 minutes';
    new.submitted_at := now();
    new.review_note := null;
    new.review_claimed_at := null;
    new.review_claimed_by := null;
  end if;

  -- hosts cannot write the review bookkeeping themselves
  if tg_op = 'UPDATE' then
    if new.review_status is distinct from old.review_status and new.review_status <> 'pending' then
      new.review_status := old.review_status;
    end if;
    new.reviewed_by := old.reviewed_by;
    new.review_claimed_at := old.review_claimed_at;
    new.review_claimed_by := old.review_claimed_by;
  else
    if new.review_status <> 'pending' then
      new.review_status := 'approved';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cars_gate_publish on public.cars;
create trigger cars_gate_publish
  before insert or update on public.cars
  for each row execute function public.gate_car_publish();

-- Cars that are already live count as reviewed (so pausing / un-pausing them is not re-reviewed).
alter table public.cars disable trigger cars_gate_publish;
update public.cars set submitted_at = coalesce(submitted_at, created_at) where status = 'published' and submitted_at is null;
alter table public.cars enable trigger cars_gate_publish;

-- ---------------------------------------------------------------- promotion
create or replace function public.promote_due_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform set_config('cx.car_review', 'on', true);
  update public.cars
     set status = 'published', review_status = 'approved'
   where review_status = 'pending'
     and publish_at is not null
     and publish_at <= now()
     and (review_claimed_at is null or review_claimed_at < now() - interval '10 minutes');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.promote_due_listings() from public;
grant execute on function public.promote_due_listings() to anon, authenticated;

-- ---------------------------------------------------------------- the team's view
create or replace function public.review_queue()
returns table (
  car_id uuid, slug text, make text, model text, car_trim text, year int, city text,
  host_id uuid, host_name text, host_avatar text,
  submitted_at timestamptz, publish_at timestamptz, claimed_at timestamptz,
  claimed_by uuid, claimed_by_name text,
  photos text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, c.make, c.model, c.trim, c.year, c.city,
         c.host_id, p.full_name, p.avatar_url,
         c.submitted_at, c.publish_at, c.review_claimed_at,
         c.review_claimed_by, cp.full_name,
         coalesce((select array_agg(i.url order by i.position) from public.car_images i where i.car_id = c.id), '{}')
  from public.cars c
  join public.profiles p on p.id = c.host_id
  left join public.profiles cp on cp.id = c.review_claimed_by
  where public.is_admin() and c.review_status = 'pending'
  order by c.submitted_at asc;
$$;
grant execute on function public.review_queue() to authenticated;

-- A teammate opens a listing: hold the auto-publish while they look.
create or replace function public.claim_listing(p_car_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  perform set_config('cx.car_review', 'on', true);
  update public.cars
     set review_claimed_at = now(), review_claimed_by = auth.uid()
   where id = p_car_id and review_status = 'pending';
end;
$$;
grant execute on function public.claim_listing(uuid) to authenticated;

create or replace function public.review_listing(p_car_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_label text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Unknown decision'; end if;
  if p_decision = 'rejected' and (v_reason is null or length(v_reason) < 3) then
    raise exception 'Say what needs to change';
  end if;

  select host_id, make || ' ' || model into v_host, v_label from public.cars where id = p_car_id;
  if v_host is null then raise exception 'Listing not found'; end if;

  perform set_config('cx.car_review', 'on', true);
  if p_decision = 'approved' then
    update public.cars set status = 'published', review_status = 'approved', reviewed_by = auth.uid(), publish_at = now(),
           review_note = null, review_claimed_at = null where id = p_car_id;
    perform public.send_cx_message(v_host, 'Your ' || v_label || ' is live ✓ — renters can find it now.');
  else
    update public.cars set status = 'draft', review_status = 'rejected', reviewed_by = auth.uid(),
           review_note = v_reason, review_claimed_at = null, publish_at = null where id = p_car_id;
    perform public.send_cx_message(v_host, 'We could not publish your ' || v_label || ' yet: ' || v_reason
      || '. Open the listing, fix it and publish again — it only takes a minute.');
  end if;
end;
$$;
grant execute on function public.review_listing(uuid, text, text) to authenticated;

-- A host takes a waiting listing back (it is not published, nothing is sent to the team).
create or replace function public.withdraw_listing(p_car_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('cx.car_review', 'on', true);
  update public.cars
     set review_status = 'rejected', review_note = 'Withdrawn by the host', publish_at = null, review_claimed_at = null
   where id = p_car_id and host_id = auth.uid() and review_status = 'pending';
end;
$$;
grant execute on function public.withdraw_listing(uuid) to authenticated;
