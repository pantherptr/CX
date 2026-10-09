-- Signal Spotlight — CX's editorial selection of a Vision.
--
-- A Spotlight is NOT a post and copies nothing: an entry holds only editorial
-- metadata and a reference to its source Vision (signal_visions). The feed
-- reads the Vision's own media and creator through that reference, so the
-- creator stays the owner of the content, and the Spotlight disappears by
-- itself when the Vision is deleted, the candidacy withdrawn, or the creator
-- switches Visions off. Removing a Spotlight never touches the Vision.
--
-- Additive: no existing table/function other than the Visions RPCs from 0086
-- (replaced here to carry the new link + candidacy fields) is changed.

-- 1. What a Vision can be linked to, and whether it is a Spotlight candidate.
alter table public.signal_visions
  add column if not exists trip_stamp_id uuid references public.signal_trip_stamps(id) on delete set null,
  add column if not exists car_id uuid references public.cars(id) on delete set null,
  add column if not exists spotlight_eligible boolean not null default false;

-- 2. The official CX accounts an admin may publish a Spotlight as.
create table if not exists public.spotlight_publishers (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.spotlight_publishers (label, avatar_url)
values ('CX Team', '/brand/avatar-cx.webp'), ('CX Editorial', '/brand/avatar-cx.webp')
on conflict (label) do nothing;
alter table public.spotlight_publishers enable row level security;

-- 3. The editorial entries: metadata + a reference, nothing else.
create table if not exists public.signal_spotlight_entries (
  id uuid primary key default gen_random_uuid(),
  source_vision_id uuid not null references public.signal_visions(id) on delete cascade,
  publisher_id uuid references public.spotlight_publishers(id),
  curated_by text,
  city text,
  editorial_title text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived', 'removed')),
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists signal_spotlight_one_per_vision on public.signal_spotlight_entries (source_vision_id);
create index if not exists signal_spotlight_published_idx on public.signal_spotlight_entries (published_at desc) where status = 'published';
alter table public.signal_spotlight_entries enable row level security;
-- No policies: every read/write goes through the RPCs below.

-- 4. Visions RPCs, now carrying the link and the candidacy.
drop function if exists public.add_vision(text, text, text, text);
drop function if exists public.update_vision(uuid, text, text);
drop function if exists public.fetch_visions(uuid, integer, timestamptz);

-- A link is valid when it is the caller's own verified trip, or (for a Host)
-- one of their own listed cars. Returns true when the Vision is linked.
create or replace function public._vision_link_ok(p_stamp uuid, p_car uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    (p_stamp is not null and exists (select 1 from public.signal_trip_stamps s where s.id = p_stamp and s.user_id = auth.uid() and s.verified))
    or
    (p_car is not null and exists (select 1 from public.cars c where c.id = p_car and c.host_id = auth.uid() and c.status = 'published'));
$$;

create or replace function public.add_vision(
  p_media_path text, p_media_kind text, p_title text default null, p_caption text default null,
  p_trip_stamp_id uuid default null, p_car_id uuid default null, p_spotlight boolean default false
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_linked boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.signal_visions_profiles where user_id = auth.uid() and enabled) then
    raise exception 'Visions is not enabled';
  end if;
  if p_media_kind not in ('image', 'video') then raise exception 'Bad media kind'; end if;
  if p_media_path is null or split_part(p_media_path, '/', 1) <> auth.uid()::text then
    raise exception 'Media must be in your own folder';
  end if;
  v_linked := public._vision_link_ok(p_trip_stamp_id, p_car_id);
  insert into public.signal_visions (author_id, media_path, media_kind, title, caption, trip_stamp_id, car_id, spotlight_eligible)
  values (
    auth.uid(), p_media_path, p_media_kind,
    nullif(left(btrim(coalesce(p_title, '')), 80), ''),
    nullif(left(btrim(coalesce(p_caption, '')), 400), ''),
    case when v_linked then p_trip_stamp_id end,
    case when v_linked and p_trip_stamp_id is null then p_car_id end,
    coalesce(p_spotlight, false) and v_linked
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_vision(
  p_id uuid, p_title text, p_caption text,
  p_trip_stamp_id uuid default null, p_car_id uuid default null, p_spotlight boolean default false
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_linked boolean; v_want boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  v_linked := public._vision_link_ok(p_trip_stamp_id, p_car_id);
  v_want := coalesce(p_spotlight, false) and v_linked;
  update public.signal_visions
  set title = nullif(left(btrim(coalesce(p_title, '')), 80), ''),
      caption = nullif(left(btrim(coalesce(p_caption, '')), 400), ''),
      trip_stamp_id = case when v_linked then p_trip_stamp_id end,
      car_id = case when v_linked and p_trip_stamp_id is null then p_car_id end,
      spotlight_eligible = v_want
  where id = p_id and author_id = auth.uid();
  -- Withdrawing the candidacy takes any Spotlight of it off the feed for good
  -- (an admin would have to select it again).
  if not v_want then
    update public.signal_spotlight_entries e
    set status = 'removed'
    from public.signal_visions v
    where e.source_vision_id = p_id and v.id = p_id and v.author_id = auth.uid() and e.status in ('draft', 'published');
  end if;
end;
$$;

create or replace function public.fetch_visions(p_author_id uuid, p_limit integer default 60, p_before timestamptz default null)
returns table (
  id uuid, author_id uuid, media_path text, media_kind text, title text, caption text, created_at timestamptz,
  trip_stamp_id uuid, car_id uuid, spotlight_eligible boolean, spotlighted boolean
)
language sql stable security definer set search_path = public
as $$
  select v.id, v.author_id, v.media_path, v.media_kind, v.title, v.caption, v.created_at,
         v.trip_stamp_id, v.car_id,
         v.spotlight_eligible and v.author_id = auth.uid(),
         exists (select 1 from public.signal_spotlight_entries e where e.source_vision_id = v.id and e.status = 'published' and v.spotlight_eligible)
  from public.signal_visions v
  where auth.uid() is not null
    and v.author_id = p_author_id
    and exists (select 1 from public.signal_visions_profiles p where p.user_id = v.author_id and p.enabled)
    and (p_before is null or v.created_at < p_before)
  order by v.created_at desc, v.id desc
  limit least(coalesce(p_limit, 60), 120);
$$;

-- 5. Admin: the Spotlight queue — candidates only, nothing private.
create or replace function public.fetch_spotlight_queue()
returns table (
  vision_id uuid, media_path text, media_kind text, title text, caption text, vision_created_at timestamptz,
  creator_id uuid, creator_name text, creator_username text,
  city text, car_label text,
  entry_id uuid, entry_status text, entry_title text, entry_publisher text, entry_published_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  select v.id, v.media_path, v.media_kind, v.title, v.caption, v.created_at,
         v.author_id, pr.full_name, pr.username,
         s.city,
         trim(concat_ws(' ', c.make, c.model, c.year::text)),
         e.id, e.status, e.editorial_title, sp.label, e.published_at
  from public.signal_visions v
  join public.profiles pr on pr.id = v.author_id
  join public.signal_visions_profiles vp on vp.user_id = v.author_id and vp.enabled
  left join public.signal_trip_stamps s on s.id = v.trip_stamp_id
  left join public.cars c on c.id = coalesce(s.car_id, v.car_id)
  left join public.signal_spotlight_entries e on e.source_vision_id = v.id
  left join public.spotlight_publishers sp on sp.id = e.publisher_id
  where v.spotlight_eligible
    and coalesce(e.status, 'candidate') <> 'removed'
  order by (e.status = 'published') desc nulls last, v.created_at desc
  limit 200;
end;
$$;

create or replace function public.fetch_spotlight_publishers()
returns table (id uuid, label text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query select p.id, p.label from public.spotlight_publishers p where p.is_active order by p.label;
end;
$$;

-- Publish (or re-publish) a candidate as a Spotlight, as an official CX account.
create or replace function public.publish_spotlight(
  p_vision_id uuid, p_publisher_id uuid, p_curated_by text, p_city text, p_title text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from public.spotlight_publishers where id = p_publisher_id and is_active) then
    raise exception 'Choose an official CX account';
  end if;
  if not exists (
    select 1 from public.signal_visions v
    join public.signal_visions_profiles vp on vp.user_id = v.author_id and vp.enabled
    where v.id = p_vision_id and v.spotlight_eligible
  ) then
    raise exception 'This Vision is not a Spotlight candidate';
  end if;
  insert into public.signal_spotlight_entries (source_vision_id, publisher_id, curated_by, city, editorial_title, status, published_at, created_by)
  values (
    p_vision_id, p_publisher_id,
    nullif(left(btrim(coalesce(p_curated_by, '')), 60), ''),
    nullif(left(btrim(coalesce(p_city, '')), 60), ''),
    nullif(left(btrim(coalesce(p_title, '')), 80), ''),
    'published', now(), auth.uid()
  )
  on conflict (source_vision_id) do update
    set publisher_id = excluded.publisher_id, curated_by = excluded.curated_by, city = excluded.city,
        editorial_title = excluded.editorial_title, status = 'published', published_at = now(), created_by = auth.uid()
  returning id into v_id;
  return v_id;
end;
$$;

-- Archive / remove / re-publish an entry, or drop a candidate from the queue
-- (no entry yet → a 'removed' one is recorded so it leaves the queue).
create or replace function public.set_spotlight_status(p_vision_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('archived', 'removed') then raise exception 'Bad status'; end if;
  insert into public.signal_spotlight_entries (source_vision_id, status, created_by)
  values (p_vision_id, p_status, auth.uid())
  on conflict (source_vision_id) do update set status = excluded.status;
end;
$$;

-- 6. The feed: published entries whose Vision is still eligible and public.
create or replace function public.fetch_spotlight_feed(p_limit integer default 6)
returns table (
  entry_id uuid, vision_id uuid, published_at timestamptz,
  publisher_label text, publisher_avatar text, curated_by text, city text, editorial_title text,
  media_path text, media_kind text,
  creator_id uuid, creator_username text, car_label text
)
language sql stable security definer set search_path = public
as $$
  select e.id, v.id, e.published_at,
         sp.label, sp.avatar_url, e.curated_by, e.city, e.editorial_title,
         v.media_path, v.media_kind,
         v.author_id, pr.username,
         nullif(trim(concat_ws(' ', c.make, c.model)), '')
  from public.signal_spotlight_entries e
  join public.signal_visions v on v.id = e.source_vision_id
  join public.signal_visions_profiles vp on vp.user_id = v.author_id and vp.enabled
  join public.profiles pr on pr.id = v.author_id
  left join public.spotlight_publishers sp on sp.id = e.publisher_id
  left join public.signal_trip_stamps s on s.id = v.trip_stamp_id
  left join public.cars c on c.id = coalesce(s.car_id, v.car_id)
  where auth.uid() is not null
    and e.status = 'published'
    and v.spotlight_eligible
  order by e.published_at desc
  limit least(coalesce(p_limit, 6), 20);
$$;

grant execute on function public.add_vision(text, text, text, text, uuid, uuid, boolean) to authenticated;
grant execute on function public.update_vision(uuid, text, text, uuid, uuid, boolean) to authenticated;
grant execute on function public.fetch_visions(uuid, integer, timestamptz) to authenticated;
grant execute on function public.fetch_spotlight_queue() to authenticated;
grant execute on function public.fetch_spotlight_publishers() to authenticated;
grant execute on function public.publish_spotlight(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.set_spotlight_status(uuid, text) to authenticated;
grant execute on function public.fetch_spotlight_feed(integer) to authenticated;
