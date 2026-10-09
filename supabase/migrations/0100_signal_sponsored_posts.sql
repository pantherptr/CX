-- Sponsored posts on Signal.
--
-- Someone promotes one of their own PUBLIC community posts: they pick a daily budget
-- (from 1.99 EUR a day, a higher budget shows up more often) and a number of days, and pay
-- first. Then an Owner or Admin approves it; if they reject it (or the advertiser cancels
-- before review) the whole payment is refunded.
--
--   awaiting_payment -> pending_review -> active -> ended
--                                     \-> rejected / canceled   (both refunded)
--
-- A sponsored post is the same post (Respect, comments, saves all work) — it is only shown
-- in the Community feed now and then, marked "Sponsored", while it is live. Nothing about
-- the post itself changes. The payment side lives in api/create-ad-payment.ts,
-- api/stripe-webhook.ts (marks it paid) and api/review-ad.ts (approve / reject / cancel).

create table if not exists public.signal_ads (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.empire_posts(id) on delete cascade,
  advertiser_id uuid not null references public.profiles(id) on delete cascade,
  daily_cents integer not null check (daily_cents between 199 and 9999),
  days integer not null check (days between 1 and 30),
  total_cents integer not null check (total_cents > 0),
  currency text not null default 'eur',
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'pending_review', 'active', 'rejected', 'canceled')),
  stripe_payment_intent_id text unique,
  paid_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reject_reason text,
  refunded_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  impressions integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists signal_ads_status_idx on public.signal_ads (status, ends_at);
create index if not exists signal_ads_advertiser_idx on public.signal_ads (advertiser_id, created_at desc);
alter table public.signal_ads enable row level security;
-- No policies: everything goes through the functions below (and the service role in api/).

create table if not exists public.signal_ad_views (
  ad_id uuid not null references public.signal_ads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (ad_id, user_id)
);
alter table public.signal_ad_views enable row level security;

-- Activity: the advertiser hears about the decision.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'post_respect', 'post_comment', 'post_share', 'post_save',
                  'circle', 'follow_accepted', 'follow_request', 'vision_selected', 'vision_featured',
                  'collab_invite', 'collab_left', 'ad_approved', 'ad_rejected'));

-- A draft, before paying. Validates everything the money depends on; the API then charges
-- exactly total_cents.
create or replace function public.create_ad_draft(p_post_id uuid, p_daily_cents integer, p_days integer)
returns table (ad_id uuid, total_cents integer)
language plpgsql security definer set search_path = public
as $$
declare v_author uuid; v_id uuid; v_total integer;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_daily_cents is null or p_daily_cents < 199 or p_daily_cents > 9999 then
    raise exception 'The daily budget must be between 1.99 and 99.99';
  end if;
  if p_days is null or p_days < 1 or p_days > 30 then raise exception 'Choose between 1 and 30 days'; end if;
  select author_id into v_author from public.empire_posts
  where id = p_post_id and publisher_type = 'self' and not is_archived and body <> '[[signal-spotlight]]';
  if v_author is null or v_author <> auth.uid() then raise exception 'You can only sponsor your own posts'; end if;
  if not public._post_is_public(p_post_id) then raise exception 'Only public posts can be sponsored'; end if;
  if exists (select 1 from public.signal_ads a where a.post_id = p_post_id and a.status in ('pending_review', 'active')
             and (a.status = 'pending_review' or a.ends_at > now())) then
    raise exception 'This post is already being sponsored';
  end if;
  delete from public.signal_ads a where a.post_id = p_post_id and a.advertiser_id = auth.uid() and a.status = 'awaiting_payment';
  v_total := p_daily_cents * p_days;
  insert into public.signal_ads (post_id, advertiser_id, daily_cents, days, total_cents)
  values (p_post_id, auth.uid(), p_daily_cents, p_days, v_total)
  returning id into v_id;
  return query select v_id, v_total;
end;
$$;
grant execute on function public.create_ad_draft(uuid, integer, integer) to authenticated;

-- Live ads for the Community feed: a few at random, a higher daily budget is picked more often.
create or replace function public.fetch_active_ads(p_limit integer default 3)
returns table (ad_id uuid, post_id uuid, daily_cents integer)
language sql stable security definer set search_path = public
as $$
  select a.id, a.post_id, a.daily_cents
  from public.signal_ads a
  join public.empire_posts p on p.id = a.post_id
  where auth.uid() is not null
    and a.status = 'active' and a.ends_at > now()
    and public._post_is_public(a.post_id)
    and not p.is_archived
    and public.signal_can_view(auth.uid(), 'post', p.id, p.author_id)
  order by (-ln(1 - random())) / a.daily_cents
  limit least(coalesce(p_limit, 3), 5);
$$;
grant execute on function public.fetch_active_ads(integer) to authenticated;

-- Counted once per person and ad, and never for the advertiser's own views.
create or replace function public.record_ad_impression(p_ad_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_done integer;
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.signal_ads a where a.id = p_ad_id and a.status = 'active' and a.ends_at > now() and a.advertiser_id <> auth.uid()) then
    return;
  end if;
  insert into public.signal_ad_views (ad_id, user_id) values (p_ad_id, auth.uid()) on conflict do nothing;
  get diagnostics v_done = row_count;
  if v_done > 0 then update public.signal_ads set impressions = impressions + 1 where id = p_ad_id; end if;
end;
$$;
grant execute on function public.record_ad_impression(uuid) to authenticated;

-- The advertiser's own sponsorships.
create or replace function public.fetch_my_ads()
returns table (
  ad_id uuid, post_id uuid, post_text text, status text, daily_cents integer, days integer, total_cents integer,
  impressions integer, created_at timestamptz, starts_at timestamptz, ends_at timestamptz, reject_reason text
)
language sql stable security definer set search_path = public
as $$
  select a.id, a.post_id, left(replace(p.body, chr(8203), ''), 120),
         case when a.status = 'active' and a.ends_at <= now() then 'ended' else a.status end,
         a.daily_cents, a.days, a.total_cents, a.impressions, a.created_at, a.starts_at, a.ends_at, a.reject_reason
  from public.signal_ads a
  join public.empire_posts p on p.id = a.post_id
  where a.advertiser_id = auth.uid() and a.status <> 'awaiting_payment'
  order by a.created_at desc
  limit 50;
$$;
grant execute on function public.fetch_my_ads() to authenticated;

-- Owner / Admin: what is waiting for a decision, and what is live or was decided.
create or replace function public.fetch_ads_queue()
returns table (
  ad_id uuid, post_id uuid, post_text text, media_path text, status text,
  advertiser_id uuid, advertiser_name text, advertiser_username text,
  daily_cents integer, days integer, total_cents integer, impressions integer,
  paid_at timestamptz, starts_at timestamptz, ends_at timestamptz, reject_reason text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
  select a.id, a.post_id, left(replace(p.body, chr(8203), ''), 280), p.media_paths[1],
         case when a.status = 'active' and a.ends_at <= now() then 'ended' else a.status end,
         a.advertiser_id, pr.full_name, pr.username,
         a.daily_cents, a.days, a.total_cents, a.impressions, a.paid_at, a.starts_at, a.ends_at, a.reject_reason
  from public.signal_ads a
  join public.empire_posts p on p.id = a.post_id
  join public.profiles pr on pr.id = a.advertiser_id
  where a.status <> 'awaiting_payment'
  order by (a.status = 'pending_review') desc, coalesce(a.paid_at, a.created_at) desc
  limit 100;
end;
$$;
grant execute on function public.fetch_ads_queue() to authenticated;
