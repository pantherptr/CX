-- Signal, more private and built on relations.
--
-- 1. Content visibility (posts, stories, visions): public / followers / circle /
--    private, kept in a side table so nothing existing changes — no visibility
--    row means public, exactly as before. Nothing is migrated or deleted.
-- 2. One central rule, signal_can_view(), and a helper that tells the app which
--    ids in a list the viewer may NOT see. Admins see everything (moderation).
-- 3. "CX Circle" = two people following each other (derived from profile_follows,
--    no separate friendship). fetch_relation() reports it.
-- 4. Respect is anonymous for everyone: a Respect never names anybody in a
--    notification. Saves are private: no "someone saved your post" notification.
-- 5. Visions: new ones default to 'followers'; Spotlight only considers public ones.
--
-- Builds on 0076/0078 (notifications), 0086/0089/0091 (visions + spotlight).
-- Not part of this migration: follow requests for private profiles and user
-- blocks — neither exists in the product yet.

-- ---------------------------------------------------------------- visibility
create table if not exists public.signal_content_visibility (
  content_type text not null check (content_type in ('post', 'story', 'vision')),
  content_id uuid not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  visibility text not null check (visibility in ('public', 'followers', 'circle', 'private')),
  updated_at timestamptz not null default now(),
  primary key (content_type, content_id)
);
create index if not exists signal_content_visibility_author_idx on public.signal_content_visibility (author_id);
alter table public.signal_content_visibility enable row level security;
-- No policies: read and written only through the functions below.

-- How A stands to B: 'mutual' (CX Circle), 'following' (A follows B),
-- 'follower' (B follows A), 'none'.
create or replace function public.signal_relation(p_a uuid, p_b uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when t.a_follows and t.b_follows then 'mutual'
    when t.a_follows then 'following'
    when t.b_follows then 'follower'
    else 'none'
  end
  from (
    select
      exists (select 1 from public.profile_follows where follower_id = p_a and followee_id = p_b) as a_follows,
      exists (select 1 from public.profile_follows where follower_id = p_b and followee_id = p_a) as b_follows
  ) t;
$$;
grant execute on function public.signal_relation(uuid, uuid) to authenticated;

-- The one rule. No row = public (old content is untouched).
create or replace function public.signal_can_view(p_viewer uuid, p_type text, p_id uuid, p_author uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare v text;
begin
  if p_viewer is null then return false; end if;
  if p_author = p_viewer then return true; end if;
  if public.is_admin(p_viewer) then return true; end if;
  select visibility into v from public.signal_content_visibility where content_type = p_type and content_id = p_id;
  v := coalesce(v, 'public');
  if v = 'public' then return true; end if;
  if v = 'followers' then
    return exists (select 1 from public.profile_follows where follower_id = p_viewer and followee_id = p_author);
  end if;
  if v = 'circle' then
    return public.signal_relation(p_viewer, p_author) = 'mutual';
  end if;
  return false; -- private
end;
$$;

-- Of these ids, which exist but must stay hidden from the signed-in viewer?
-- (Failing open on purpose: an id we know nothing about — e.g. demo content — is
-- never reported as hidden.)
create or replace function public.signal_hidden_content(p_type text, p_ids uuid[])
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(t.id), '{}'::uuid[])
  from (
    select p.id, p.author_id from public.empire_posts p where p_type = 'post' and p.id = any(p_ids)
    union all
    select s.id, s.author_id from public.empire_stories s where p_type = 'story' and s.id = any(p_ids)
    union all
    select v.id, v.author_id from public.signal_visions v where p_type = 'vision' and v.id = any(p_ids)
  ) t
  where auth.uid() is not null and not public.signal_can_view(auth.uid(), p_type, t.id, t.author_id);
$$;
grant execute on function public.signal_hidden_content(text, uuid[]) to authenticated;

-- The author sets visibility of their own content.
create or replace function public.set_content_visibility(p_type text, p_id uuid, p_visibility text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_author uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_visibility not in ('public', 'followers', 'circle', 'private') then raise exception 'Bad visibility'; end if;
  if p_type = 'post' then select author_id into v_author from public.empire_posts where id = p_id;
  elsif p_type = 'story' then select author_id into v_author from public.empire_stories where id = p_id;
  elsif p_type = 'vision' then select author_id into v_author from public.signal_visions where id = p_id;
  else raise exception 'Bad content type'; end if;
  if v_author is null or v_author <> auth.uid() then raise exception 'Not your content'; end if;
  insert into public.signal_content_visibility (content_type, content_id, author_id, visibility)
  values (p_type, p_id, auth.uid(), p_visibility)
  on conflict (content_type, content_id) do update set visibility = excluded.visibility, updated_at = now();
end;
$$;
grant execute on function public.set_content_visibility(text, uuid, text) to authenticated;

-- The author reads back the setting of their own content (for the edit screens).
create or replace function public.fetch_my_visibility(p_type text, p_ids uuid[])
returns table (content_id uuid, visibility text)
language sql stable security definer set search_path = public
as $$
  select v.content_id, v.visibility
  from public.signal_content_visibility v
  where v.content_type = p_type and v.content_id = any(p_ids) and v.author_id = auth.uid();
$$;
grant execute on function public.fetch_my_visibility(text, uuid[]) to authenticated;

-- "following" / "mutual" for the profile screen's Follow button.
create or replace function public.fetch_relation(p_user_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case when auth.uid() is null then 'none' else public.signal_relation(auth.uid(), p_user_id) end;
$$;
grant execute on function public.fetch_relation(uuid) to authenticated;

-- ------------------------------------------------- anonymous Respect, private Saves
-- A Save never notifies anyone (the author must not learn who saved, or that
-- anyone did). A Respect never names its giver, whoever you follow.
create or replace function public.create_signal_notification(p_recipient_id uuid, p_type text, p_post_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or p_recipient_id is null or p_recipient_id = auth.uid() then
    return;
  end if;
  if p_type = 'post_save' then
    return;
  end if;

  if p_type <> 'follow' and p_post_id is not null then
    update public.notifications
      set count = count + 1, created_at = now(), read_at = null
      where recipient_id = p_recipient_id and type = p_type and post_id = p_post_id
        and read_at is null and created_at > now() - interval '24 hours'
      returning id into v_id;
  end if;

  if v_id is not null then
    update public.notification_actors set actor_id = auth.uid() where notification_id = v_id;
    return;
  end if;

  insert into public.notifications (recipient_id, type, post_id)
  values (p_recipient_id, p_type, p_post_id)
  returning id into v_id;
  insert into public.notification_actors (notification_id, actor_id) values (v_id, auth.uid());
end;
$$;

drop function if exists public.fetch_my_notifications(integer, timestamptz);
create or replace function public.fetch_my_notifications(p_limit integer default 30, p_before timestamptz default null)
returns table (
  id uuid, type text, created_at timestamptz, read_at timestamptz,
  actor_id uuid, actor_name text, actor_avatar_url text, actor_username text,
  actor_is_owner boolean, actor_is_admin boolean, actor_is_host boolean, actor_is_verified_client boolean,
  post_id uuid, post_body text
)
language sql stable security definer set search_path = public
as $$
  select
    n.id, n.type, n.created_at, n.read_at,
    case when v.visible then pr.id end,
    case when v.visible then pr.full_name end,
    case when v.visible then pr.avatar_url end,
    case when v.visible then pr.username end,
    case when v.visible then coalesce(pr.is_owner, false) else false end,
    case when v.visible then coalesce(pr.is_admin, false) else false end,
    case when v.visible then coalesce(pr.is_host, false) else false end,
    case when v.visible then coalesce(pr.is_verified_client, false) else false end,
    n.post_id, replace(p.body, chr(8203), '')
  from public.notifications n
  left join public.notification_actors na on na.notification_id = n.id
  left join public.profiles pr on pr.id = na.actor_id
  left join public.empire_posts p on p.id = n.post_id
  cross join lateral (
    select (
      n.type = 'follow'
      or (
        n.type not in ('post_respect', 'post_save')
        and exists (
          select 1 from public.profile_follows f
          where (f.follower_id = auth.uid() and f.followee_id = na.actor_id)
             or (f.follower_id = na.actor_id and f.followee_id = auth.uid())
        )
      )
    ) as visible
  ) v
  where n.recipient_id = auth.uid()
    and n.type <> 'post_save'
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_my_notifications(integer, timestamptz) to authenticated;

-- ------------------------------------------------------------ visions
-- Is this Vision public? (no row = public)
create or replace function public._vision_is_public(p_vision_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select v.visibility from public.signal_content_visibility v where v.content_type = 'vision' and v.content_id = p_vision_id),
    'public'
  ) = 'public';
$$;

-- New Visions default to 'followers'; public only when the owner picks it.
drop function if exists public.add_vision(text, text, text, text, uuid, uuid);
create or replace function public.add_vision(
  p_media_path text, p_media_kind text, p_title text default null, p_caption text default null,
  p_trip_stamp_id uuid default null, p_car_id uuid default null, p_visibility text default 'followers'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_linked boolean; v_vis text := coalesce(p_visibility, 'followers');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.signal_visions_profiles where user_id = auth.uid() and enabled) then
    raise exception 'Visions is not enabled';
  end if;
  if p_media_kind not in ('image', 'video') then raise exception 'Bad media kind'; end if;
  if v_vis not in ('public', 'followers', 'circle', 'private') then raise exception 'Bad visibility'; end if;
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
  insert into public.signal_content_visibility (content_type, content_id, author_id, visibility)
  values ('vision', v_id, auth.uid(), v_vis);
  return v_id;
end;
$$;
grant execute on function public.add_vision(text, text, text, text, uuid, uuid, text) to authenticated;

drop function if exists public.update_vision(uuid, text, text, uuid, uuid);
create or replace function public.update_vision(
  p_id uuid, p_title text, p_caption text, p_trip_stamp_id uuid default null, p_car_id uuid default null,
  p_visibility text default null
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
  if p_visibility is not null then
    perform public.set_content_visibility('vision', p_id, p_visibility);
  end if;
end;
$$;
grant execute on function public.update_vision(uuid, text, text, uuid, uuid, text) to authenticated;

-- A profile's Visions: only the ones the viewer may see.
drop function if exists public.fetch_visions(uuid, integer, timestamptz);
create or replace function public.fetch_visions(p_author_id uuid, p_limit integer default 60, p_before timestamptz default null)
returns table (
  id uuid, author_id uuid, media_path text, media_kind text, title text, caption text, created_at timestamptz,
  trip_stamp_id uuid, car_id uuid, spotlighted boolean, visibility text
)
language sql stable security definer set search_path = public
as $$
  select v.id, v.author_id, v.media_path, v.media_kind, v.title, v.caption, v.created_at,
         v.trip_stamp_id, v.car_id,
         exists (select 1 from public.signal_spotlight_entries e where e.source_vision_id = v.id and e.status = 'published')
           and public._is_verified_author(v.author_id) and public._vision_is_public(v.id),
         coalesce((select cv.visibility from public.signal_content_visibility cv where cv.content_type = 'vision' and cv.content_id = v.id and v.author_id = auth.uid()), 'public')
  from public.signal_visions v
  where auth.uid() is not null
    and v.author_id = p_author_id
    and exists (select 1 from public.signal_visions_profiles p where p.user_id = v.author_id and p.enabled)
    and public.signal_can_view(auth.uid(), 'vision', v.id, v.author_id)
    and (p_before is null or v.created_at < p_before)
  order by v.created_at desc, v.id desc
  limit least(coalesce(p_limit, 60), 120);
$$;
grant execute on function public.fetch_visions(uuid, integer, timestamptz) to authenticated;

-- Spotlight only ever considers PUBLIC Visions.
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
    and public._vision_is_public(v.id)
    and coalesce(e.status, 'candidate') <> 'removed'
  order by (e.status = 'published') desc nulls last, v.created_at desc
  limit 200;
end;
$$;
grant execute on function public.fetch_spotlight_queue() to authenticated;

drop function if exists public.fetch_spotlight_feed(integer);
create or replace function public.fetch_spotlight_feed(p_limit integer default 6)
returns table (
  entry_id uuid, vision_id uuid, published_at timestamptz, post_id uuid,
  publisher_label text, publisher_avatar text, curated_by text, city text, editorial_title text,
  media_path text, media_kind text,
  creator_id uuid, creator_username text, car_label text
)
language sql stable security definer set search_path = public
as $$
  select e.id, v.id, e.published_at, e.post_id,
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
    and public._vision_is_public(v.id)
  order by e.published_at desc
  limit least(coalesce(p_limit, 6), 20);
$$;
grant execute on function public.fetch_spotlight_feed(integer) to authenticated;

create or replace function public.publish_spotlight(
  p_vision_id uuid, p_publisher_id uuid, p_curated_by text, p_city text, p_title text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_post uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from public.spotlight_publishers where id = p_publisher_id and is_active) then
    raise exception 'Choose an official CX account';
  end if;
  if not exists (
    select 1 from public.signal_visions v
    join public.signal_visions_profiles vp on vp.user_id = v.author_id and vp.enabled
    where v.id = p_vision_id and public._is_verified_author(v.author_id) and public._vision_is_public(v.id)
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
  returning id, post_id into v_id, v_post;
  return jsonb_build_object('entry_id', v_id, 'post_id', v_post);
end;
$$;
grant execute on function public.publish_spotlight(uuid, uuid, text, text, text) to authenticated;
