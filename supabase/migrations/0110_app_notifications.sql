-- Platform notifications: one inbox for everything that happens to a host or a renter
-- (bookings, payments, payouts, verification, listing review …), next to the SIGNAL ones (0054).
--
--   app_notifications        — the inbox rows (realtime, one per event).
--   web_push_subscriptions   — browsers that allowed notifications (Web Push), per user.
--   notify_config            — optional: URL + secret so database events can trigger a push by themselves.
--
-- Writers: the API (service role) and the security-definer functions below. Clients only read /
-- mark read.

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  url text,
  skip_push boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists app_notifications_user_idx on public.app_notifications (user_id, created_at desc);
create index if not exists app_notifications_unread_idx on public.app_notifications (user_id) where read_at is null;

alter table public.app_notifications enable row level security;
drop policy if exists "Users read their own app notifications" on public.app_notifications;
create policy "Users read their own app notifications"
  on public.app_notifications for select using (user_id = auth.uid());
-- no insert / update / delete policies: writes go through the functions below.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_notifications'
     ) then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
end $$;

-- ---------------------------------------------------------------- write helpers
create or replace function public.create_app_notification(
  p_user_id uuid, p_kind text, p_title text, p_body text, p_url text default null, p_skip_push boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then return; end if;
  insert into public.app_notifications (user_id, kind, title, body, url, skip_push)
  values (p_user_id, left(p_kind, 40), left(p_title, 140), left(coalesce(p_body, ''), 400), p_url, p_skip_push);
end;
$$;
revoke all on function public.create_app_notification(uuid, text, text, text, text, boolean) from public;

-- ---------------------------------------------------------------- reads / marks
create or replace function public.mark_app_notification_read(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.app_notifications set read_at = coalesce(read_at, now()) where id = p_id and user_id = auth.uid();
$$;

create or replace function public.mark_all_app_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.app_notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

grant execute on function public.mark_app_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_app_notifications_read() to authenticated;

-- ---------------------------------------------------------------- web push subscriptions
create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists web_push_user_idx on public.web_push_subscriptions (user_id);
alter table public.web_push_subscriptions enable row level security;
drop policy if exists "Users manage their own push subscriptions" on public.web_push_subscriptions;
create policy "Users manage their own push subscriptions"
  on public.web_push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A browser may have been used by someone else before: the subscription moves to whoever is signed in.
create or replace function public.save_web_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.web_push_subscriptions where endpoint = p_endpoint and user_id <> auth.uid();
  insert into public.web_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;
grant execute on function public.save_web_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- database → push (optional)
-- Fill this table once (see the note in CLAUDE.md) and rows written by database functions (a listing
-- going live by itself, …) also reach people's phones. Without it they still land in the inbox.
create table if not exists public.notify_config (
  id boolean primary key default true check (id),
  url text not null,
  secret text not null
);
alter table public.notify_config enable row level security;
-- no policies: only the trigger (security definer) reads it.

create or replace function public.fanout_app_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg record;
begin
  if new.skip_push then return new; end if;
  select url, secret into cfg from public.notify_config limit 1;
  if cfg.url is null then return new; end if;
  begin
    perform net.http_post(
      url := cfg.url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cx-secret', cfg.secret),
      body := jsonb_build_object('type', 'fanout', 'userId', new.user_id, 'title', new.title, 'body', new.body, 'url', new.url)
    );
  exception when others then
    null; -- a push must never fail the write that caused it
  end;
  return new;
end;
$$;

drop trigger if exists app_notifications_fanout on public.app_notifications;
create trigger app_notifications_fanout
  after insert on public.app_notifications
  for each row execute function public.fanout_app_notification();

-- ---------------------------------------------------------------- database-side events
-- Verification decisions (0106) — the app already pushes these through the API, so skip_push.
create or replace function public.review_verification(
  p_user_id uuid, p_kind text, p_decision text, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_label text;
  v_body text;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_kind not in ('identity', 'licence') then raise exception 'Unknown kind'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Unknown decision'; end if;
  if p_decision = 'rejected' and (v_reason is null or length(v_reason) < 3) then
    raise exception 'Say why it was not accepted';
  end if;
  if not exists (select 1 from public.verifications where user_id = p_user_id) then
    raise exception 'Nothing submitted';
  end if;

  perform set_config('cx.verif_rpc', 'on', true);

  if p_kind = 'identity' then
    update public.verifications set
      identity_status = p_decision,
      identity_reason = case when p_decision = 'rejected' then v_reason else null end,
      identity_reviewed_at = now(),
      reviewed_by = auth.uid()
    where user_id = p_user_id;
    update public.profiles set is_verified_client = (p_decision = 'approved') where id = p_user_id and not is_host;
    v_label := 'identity';
  else
    update public.verifications set
      licence_status = p_decision,
      licence_reason = case when p_decision = 'rejected' then v_reason else null end,
      licence_reviewed_at = now(),
      status = p_decision,
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where user_id = p_user_id;
    v_label := 'driving licence';
  end if;

  insert into public.verification_events (user_id, kind, action, reason, actor_id)
  values (p_user_id, p_kind, p_decision, case when p_decision = 'rejected' then v_reason end, auth.uid());

  if p_decision = 'approved' then
    v_body := case when p_kind = 'identity'
      then 'Your identity is verified ✓ — your profile now carries the verified badge.'
      else 'Your driving licence is verified ✓ — you are ready to rent.' end;
  else
    v_body := 'We could not accept your ' || v_label || ' this time: ' || v_reason
      || '. You can send it again from Settings → Verification — it only takes a minute.';
  end if;
  perform public.send_cx_message(p_user_id, v_body);

  perform public.create_app_notification(
    p_user_id,
    case when p_decision = 'approved' then 'verification_approved' else 'verification_rejected' end,
    case when p_decision = 'approved' then 'Your ' || v_label || ' is verified' else 'Your ' || v_label || ' needs a new photo' end,
    case when p_decision = 'approved' then 'You are all set.' else v_reason end,
    case when p_kind = 'identity' then '/settings#verification' else '/settings#licence' end,
    true
  );
end;
$$;

-- Listing decisions (0108): inbox row; the team's client also sends the push through the API.
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
    perform public.create_app_notification(v_host, 'listing_live', 'Your ' || v_label || ' is live', 'Renters can find it now.', '/host#cars', true);
  else
    update public.cars set status = 'draft', review_status = 'rejected', reviewed_by = auth.uid(),
           review_note = v_reason, review_claimed_at = null, publish_at = null where id = p_car_id;
    perform public.send_cx_message(v_host, 'We could not publish your ' || v_label || ' yet: ' || v_reason
      || '. Open the listing, fix it and publish again — it only takes a minute.');
    perform public.create_app_notification(v_host, 'listing_rejected', 'Your ' || v_label || ' needs changes', v_reason, '/host#cars', true);
  end if;
end;
$$;

-- A listing going live on its own after the review window.
create or replace function public.promote_due_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  perform set_config('cx.car_review', 'on', true);
  with promoted as (
    update public.cars
       set status = 'published', review_status = 'approved'
     where review_status = 'pending'
       and publish_at is not null
       and publish_at <= now()
       and (review_claimed_at is null or review_claimed_at < now() - interval '10 minutes')
    returning host_id, make, model
  )
  insert into public.app_notifications (user_id, kind, title, body, url, skip_push)
  select host_id, 'listing_live', 'Your ' || make || ' ' || model || ' is live', 'Renters can find it now.', '/host#cars', false
  from promoted;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------- what each person wants to hear about
create table if not exists public.user_notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  trips boolean not null default true,
  messages boolean not null default true,
  promos boolean not null default false,
  push boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.user_notification_prefs enable row level security;
drop policy if exists "Users read their own notification prefs" on public.user_notification_prefs;
create policy "Users read their own notification prefs"
  on public.user_notification_prefs for select using (user_id = auth.uid());

create or replace function public.save_my_notification_prefs(p_trips boolean, p_messages boolean, p_promos boolean, p_push boolean)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_notification_prefs (user_id, trips, messages, promos, push, updated_at)
  values (auth.uid(), p_trips, p_messages, p_promos, p_push, now())
  on conflict (user_id) do update
    set trips = excluded.trips, messages = excluded.messages, promos = excluded.promos, push = excluded.push, updated_at = now();
$$;
grant execute on function public.save_my_notification_prefs(boolean, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------- more events
-- A renter reviewed a host's car.
create or replace function public.notify_host_of_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_label text;
begin
  select host_id, make || ' ' || model into v_host, v_label from public.cars where id = new.car_id;
  if v_host is null or new.author_id is not null and v_host = new.author_id then
    return new;
  end if;
  perform public.create_app_notification(
    v_host, 'review_new',
    'New ' || trim(to_char(new.rating, 'FM9.9')) || '★ review on your ' || v_label,
    left(coalesce(new.body, ''), 140),
    '/host#cars', false
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists reviews_notify_host on public.reviews;
create trigger reviews_notify_host
  after insert on public.reviews
  for each row execute function public.notify_host_of_review();

-- SIGNAL events that deserve a phone buzz (follow, request, accepted, collab, sponsorship, spotlight).
-- The inbox rows already exist (0054+); this only pushes them, and only when notify_config is filled in.
create or replace function public.fanout_signal_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg record;
  v_name text;
  v_title text;
begin
  if new.type not in ('follow', 'follow_request', 'follow_accepted', 'collab_invite', 'ad_approved', 'ad_rejected', 'vision_selected', 'vision_featured') then
    return new;
  end if;
  select url, secret into cfg from public.notify_config limit 1;
  if cfg.url is null then return new; end if;

  select full_name into v_name from public.profiles where id = new.actor_id;
  v_title := case new.type
    when 'follow' then coalesce(v_name, 'Someone') || ' started following you'
    when 'follow_request' then coalesce(v_name, 'Someone') || ' asked to follow you'
    when 'follow_accepted' then coalesce(v_name, 'Someone') || ' accepted your request'
    when 'collab_invite' then coalesce(v_name, 'Someone') || ' invited you to collaborate'
    when 'ad_approved' then 'Your sponsorship is live'
    when 'ad_rejected' then 'Your sponsorship was not approved'
    when 'vision_selected' then 'Your Vision was selected for Spotlight'
    else 'Your Vision is featured on Spotlight'
  end;
  begin
    perform net.http_post(
      url := cfg.url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cx-secret', cfg.secret),
      body := jsonb_build_object('type', 'fanout', 'userId', new.recipient_id, 'title', v_title, 'body', '', 'url', '/notifications')
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists signal_notifications_fanout on public.notifications;
create trigger signal_notifications_fanout
  after insert on public.notifications
  for each row execute function public.fanout_signal_notification();
