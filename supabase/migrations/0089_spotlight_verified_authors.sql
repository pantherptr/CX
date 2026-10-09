-- Signal Spotlight, simplified: no nominations, no forms.
--
-- A public Vision (its owner has Visions on) is eligible for Spotlight when its
-- author holds a verification that already exists in CX:
--   * Verified Client            profiles.is_verified_client
--   * Verified Host              profiles.is_host and profiles.verified
--   * Official CX team           profiles.is_owner / profiles.is_admin
-- No new badge or verification type. Eligibility is read live, so a Spotlight
-- hides itself the moment its creator loses the verification, deletes the
-- Vision, or turns Visions off. Removing a Spotlight never touches the Vision.
--
-- 0087's per-Vision candidacy (spotlight_eligible) is no longer used; the column
-- stays, harmlessly. Builds on 0086 and 0087.

create or replace function public._is_verified_author(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = p_user_id
      and (pr.is_verified_client or (pr.is_host and pr.verified) or pr.is_owner or pr.is_admin)
  );
$$;

-- Which verification, for the admin queue.
create or replace function public._author_badge(p_user_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when pr.is_owner or pr.is_admin then 'CX Team'
    when pr.is_host and pr.verified then 'Verified Host'
    when pr.is_verified_client then 'Verified Client'
    else null
  end
  from public.profiles pr where pr.id = p_user_id;
$$;

-- Adding / editing a Vision: only the optional link (for city + car). The old
-- candidacy argument is gone — and editing a Vision must never take its
-- Spotlight down, so the candidacy-withdrawal side effect goes too.
drop function if exists public.add_vision(text, text, text, text, uuid, uuid, boolean);
drop function if exists public.update_vision(uuid, text, text, uuid, uuid, boolean);

create or replace function public.add_vision(
  p_media_path text, p_media_kind text, p_title text default null, p_caption text default null,
  p_trip_stamp_id uuid default null, p_car_id uuid default null
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
  insert into public.signal_visions (author_id, media_path, media_kind, title, caption, trip_stamp_id, car_id)
  values (
    auth.uid(), p_media_path, p_media_kind,
    nullif(left(btrim(coalesce(p_title, '')), 80), ''),
    nullif(left(btrim(coalesce(p_caption, '')), 400), ''),
    case when v_linked then p_trip_stamp_id end,
    case when v_linked and p_trip_stamp_id is null then p_car_id end
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_vision(
  p_id uuid, p_title text, p_caption text, p_trip_stamp_id uuid default null, p_car_id uuid default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_linked boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  v_linked := public._vision_link_ok(p_trip_stamp_id, p_car_id);
  update public.signal_visions
  set title = nullif(left(btrim(coalesce(p_title, '')), 80), ''),
      caption = nullif(left(btrim(coalesce(p_caption, '')), 400), ''),
      trip_stamp_id = case when v_linked then p_trip_stamp_id end,
      car_id = case when v_linked and p_trip_stamp_id is null then p_car_id end
  where id = p_id and author_id = auth.uid();
end;
$$;

grant execute on function public.add_vision(text, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.update_vision(uuid, text, text, uuid, uuid) to authenticated;

-- Visions no longer carry a candidacy flag.
drop function if exists public.fetch_visions(uuid, integer, timestamptz);
create or replace function public.fetch_visions(p_author_id uuid, p_limit integer default 60, p_before timestamptz default null)
returns table (
  id uuid, author_id uuid, media_path text, media_kind text, title text, caption text, created_at timestamptz,
  trip_stamp_id uuid, car_id uuid, spotlighted boolean
)
language sql stable security definer set search_path = public
as $$
  select v.id, v.author_id, v.media_path, v.media_kind, v.title, v.caption, v.created_at,
         v.trip_stamp_id, v.car_id,
         exists (select 1 from public.signal_spotlight_entries e where e.source_vision_id = v.id and e.status = 'published')
           and public._is_verified_author(v.author_id)
  from public.signal_visions v
  where auth.uid() is not null
    and v.author_id = p_author_id
    and exists (select 1 from public.signal_visions_profiles p where p.user_id = v.author_id and p.enabled)
    and (p_before is null or v.created_at < p_before)
  order by v.created_at desc, v.id desc
  limit least(coalesce(p_limit, 60), 120);
$$;

-- Admin queue: every public Vision of a verified account.
drop function if exists public.fetch_spotlight_queue();
create or replace function public.fetch_spotlight_queue()
returns table (
  vision_id uuid, media_path text, media_kind text, title text, caption text, vision_created_at timestamptz,
  creator_id uuid, creator_name text, creator_username text, badge text,
  city text, car_label text,
  entry_id uuid, entry_status text, entry_title text, entry_publisher text, entry_published_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  select v.id, v.media_path, v.media_kind, v.title, v.caption, v.created_at,
         v.author_id, pr.full_name, pr.username, public._author_badge(v.author_id),
         s.city,
         nullif(trim(concat_ws(' ', c.make, c.model, c.year::text)), ''),
         e.id, e.status, e.editorial_title, sp.label, e.published_at
  from public.signal_visions v
  join public.profiles pr on pr.id = v.author_id
  join public.signal_visions_profiles vp on vp.user_id = v.author_id and vp.enabled
  left join public.signal_trip_stamps s on s.id = v.trip_stamp_id
  left join public.cars c on c.id = coalesce(s.car_id, v.car_id)
  left join public.signal_spotlight_entries e on e.source_vision_id = v.id
  left join public.spotlight_publishers sp on sp.id = e.publisher_id
  where (pr.is_verified_client or (pr.is_host and pr.verified) or pr.is_owner or pr.is_admin)
    and coalesce(e.status, 'candidate') <> 'removed'
  order by (e.status = 'published') desc nulls last, v.created_at desc
  limit 200;
end;
$$;

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
    where v.id = p_vision_id and public._is_verified_author(v.author_id)
  ) then
    raise exception 'Only public Visions of verified accounts can be selected';
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

-- The feed: published entries whose Vision still exists, is public, and whose
-- author is still verified.
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
    and public._is_verified_author(v.author_id)
  order by e.published_at desc
  limit least(coalesce(p_limit, 6), 20);
$$;

grant execute on function public.fetch_visions(uuid, integer, timestamptz) to authenticated;
grant execute on function public.fetch_spotlight_queue() to authenticated;
grant execute on function public.publish_spotlight(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.fetch_spotlight_feed(integer) to authenticated;
