-- CX Collab: one publication, two people.
--
-- A post or a Vision can be shared with ONE collaborator from the author's CX Circle.
-- Nothing is copied: the content stays a single row; a side table says who the second
-- person is and where the invitation stands:
--
--   pending   invited, not answered — only the author sees "Collaboration pending"
--   accepted  shown on both profiles and to the followers of both, as "@a × @b"
--   declined  quietly gone (nothing public, the author is not told in the feed)
--   left      the collaborator stepped out: the content stays with the author
--   removed   the author took the collaborator off, or narrowed the visibility
--
-- Only public / followers content can have a collaborator (never CX Circle / Only me).
-- Blocks, private profiles and every visibility rule still decide first (signal_can_view).
-- Builds on 0092 / 0095 / 0096 / 0097. Nothing existing is deleted or migrated.

create table if not exists public.signal_collabs (
  content_type text not null check (content_type in ('post', 'vision')),
  content_id uuid not null,
  primary_author_id uuid not null references public.profiles(id) on delete cascade,
  collaborator_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined', 'left', 'removed')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (content_type, content_id),
  check (primary_author_id <> collaborator_id)
);
create index if not exists signal_collabs_collaborator_idx on public.signal_collabs (collaborator_id, status);
create index if not exists signal_collabs_author_idx on public.signal_collabs (primary_author_id);
alter table public.signal_collabs enable row level security;
-- No policies: read and written only through the functions below.

-- The accepted collaborator of a piece of content (null when there is none).
create or replace function public.signal_collab_partner(p_type text, p_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select c.collaborator_id from public.signal_collabs c
  where c.content_type = p_type and c.content_id = p_id and c.status = 'accepted';
$$;

-- Is the accepted collaborator of this post me, or someone I follow?
create or replace function public._collab_partner_followed(p_post_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.signal_collabs c
    where c.content_type = 'post' and c.content_id = p_post_id and c.status = 'accepted'
      and (c.collaborator_id = auth.uid()
           or exists (select 1 from public.profile_follows f where f.follower_id = auth.uid() and f.followee_id = c.collaborator_id))
  );
$$;

-- ------------------------------------------------ the visibility rule, collab-aware
-- The 0096 rule, unchanged, kept as the base for ONE author.
create or replace function public._signal_can_view_base(p_viewer uuid, p_type text, p_id uuid, p_author uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare v text;
begin
  if p_viewer is null then return false; end if;
  if p_author = p_viewer then return true; end if;
  if public.is_admin(p_viewer) then return true; end if;
  if public.signal_is_blocked(p_viewer, p_author) then return false; end if;
  if public.signal_is_private(p_author)
     and not exists (select 1 from public.profile_follows where follower_id = p_viewer and followee_id = p_author) then
    return false;
  end if;
  select visibility into v from public.signal_content_visibility where content_type = p_type and content_id = p_id;
  v := coalesce(v, 'public');
  if v = 'public' then return true; end if;
  if v = 'followers' then
    return exists (select 1 from public.profile_follows where follower_id = p_viewer and followee_id = p_author);
  end if;
  if v = 'circle' then
    return public.signal_relation(p_viewer, p_author) = 'mutual';
  end if;
  return false;
end;
$$;

-- With an accepted collaborator the content is also seen through THEIR audience
-- (their followers, their privacy) — but a block with either of the two always hides it.
create or replace function public.signal_can_view(p_viewer uuid, p_type text, p_id uuid, p_author uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare c uuid;
begin
  if p_viewer is null then return false; end if;
  if p_type in ('post', 'vision') then
    select collaborator_id into c from public.signal_collabs
    where content_type = p_type and content_id = p_id and status = 'accepted' and primary_author_id = p_author;
  end if;
  if public._signal_can_view_base(p_viewer, p_type, p_id, p_author) then
    if c is not null and p_viewer <> c and not public.is_admin(p_viewer) and public.signal_is_blocked(p_viewer, c) then
      return false;
    end if;
    return true;
  end if;
  if c is not null and not public.signal_is_blocked(p_viewer, p_author) then
    return public._signal_can_view_base(p_viewer, p_type, p_id, c);
  end if;
  return false;
end;
$$;

-- Narrowing the visibility to CX Circle / Only me ends any collaboration on it.
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
  if p_visibility not in ('public', 'followers') then
    update public.signal_collabs set status = 'removed'
    where content_type = p_type and content_id = p_id and status in ('pending', 'accepted');
  end if;
end;
$$;
grant execute on function public.set_content_visibility(text, uuid, text) to authenticated;

-- ------------------------------------------------ invite / answer / leave / remove
create or replace function public.invite_collaborator(p_type text, p_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_author uuid; v_vis text; v_status text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_type not in ('post', 'vision') then raise exception 'Bad content type'; end if;
  if p_user_id is null or p_user_id = auth.uid() then raise exception 'Choose someone else'; end if;
  if p_type = 'post' then
    select author_id into v_author from public.empire_posts where id = p_id and publisher_type = 'self';
  else
    select author_id into v_author from public.signal_visions where id = p_id;
  end if;
  if v_author is null or v_author <> auth.uid() then raise exception 'Not your content'; end if;
  select coalesce((select visibility from public.signal_content_visibility where content_type = p_type and content_id = p_id), 'public') into v_vis;
  if v_vis not in ('public', 'followers') then raise exception 'Collab works on public or followers content only'; end if;
  if public.signal_is_blocked(auth.uid(), p_user_id) or public.signal_relation(auth.uid(), p_user_id) <> 'mutual' then
    raise exception 'Only people in your CX Circle can be invited';
  end if;
  if p_type = 'vision' and not exists (select 1 from public.signal_visions_profiles where user_id = p_user_id and enabled) then
    raise exception 'This person has not turned on Visions';
  end if;
  select status into v_status from public.signal_collabs where content_type = p_type and content_id = p_id;
  if v_status in ('pending', 'accepted') then raise exception 'This publication already has a collaborator'; end if;
  insert into public.signal_collabs (content_type, content_id, primary_author_id, collaborator_id, status)
  values (p_type, p_id, auth.uid(), p_user_id, 'pending')
  on conflict (content_type, content_id) do update
    set collaborator_id = excluded.collaborator_id, status = 'pending', invited_at = now(), accepted_at = null;
  perform public.create_signal_notification(
    p_user_id, 'collab_invite',
    case when p_type = 'post' then p_id end, case when p_type = 'vision' then p_id end
  );
end;
$$;
grant execute on function public.invite_collaborator(text, uuid, uuid) to authenticated;

create or replace function public.respond_collab_invite(p_type text, p_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare c public.signal_collabs; v_vis text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into c from public.signal_collabs
  where content_type = p_type and content_id = p_id and collaborator_id = auth.uid() and status = 'pending';
  if not found then raise exception 'This invitation is no longer available'; end if;
  if p_accept then
    select coalesce((select visibility from public.signal_content_visibility where content_type = p_type and content_id = p_id), 'public') into v_vis;
    if v_vis not in ('public', 'followers') or public.signal_is_blocked(auth.uid(), c.primary_author_id) then
      update public.signal_collabs set status = 'removed' where content_type = p_type and content_id = p_id;
      raise exception 'This invitation is no longer available';
    end if;
    if p_type = 'vision' and not exists (select 1 from public.signal_visions_profiles where user_id = auth.uid() and enabled) then
      raise exception 'Turn on Visions to accept';
    end if;
    update public.signal_collabs set status = 'accepted', accepted_at = now()
    where content_type = p_type and content_id = p_id;
  else
    update public.signal_collabs set status = 'declined' where content_type = p_type and content_id = p_id;
  end if;
  update public.notifications set read_at = now()
  where recipient_id = auth.uid() and type = 'collab_invite' and coalesce(post_id, vision_id) = p_id and read_at is null;
end;
$$;
grant execute on function public.respond_collab_invite(text, uuid, boolean) to authenticated;

-- The collaborator steps out: the content stays with the author, who gets a quiet note.
create or replace function public.leave_collab(p_type text, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare c public.signal_collabs;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into c from public.signal_collabs
  where content_type = p_type and content_id = p_id and collaborator_id = auth.uid() and status = 'accepted';
  if not found then return; end if;
  update public.signal_collabs set status = 'left' where content_type = p_type and content_id = p_id;
  perform public.create_signal_notification(
    c.primary_author_id, 'collab_left',
    case when p_type = 'post' then p_id end, case when p_type = 'vision' then p_id end
  );
end;
$$;
grant execute on function public.leave_collab(text, uuid) to authenticated;

-- The author takes the collaborator (or the pending invitation) off. Nobody is notified.
create or replace function public.remove_collab(p_type text, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update public.signal_collabs set status = 'removed'
  where content_type = p_type and content_id = p_id and primary_author_id = auth.uid() and status in ('pending', 'accepted');
end;
$$;
grant execute on function public.remove_collab(text, uuid) to authenticated;

-- Who the collaboration is between, for a list of posts or Visions. An accepted one is
-- shown to everyone who can see the content; a pending one only to the author.
create or replace function public.fetch_collabs(p_type text, p_ids uuid[])
returns table (
  content_id uuid, status text,
  primary_id uuid, primary_name text, primary_username text,
  collaborator_id uuid, collaborator_name text, collaborator_username text, collaborator_avatar_url text
)
language sql stable security definer set search_path = public
as $$
  select c.content_id, c.status,
         a.id, a.full_name, a.username,
         b.id, b.full_name, b.username, b.avatar_url
  from public.signal_collabs c
  join public.profiles a on a.id = c.primary_author_id
  join public.profiles b on b.id = c.collaborator_id
  where auth.uid() is not null
    and c.content_type = p_type and c.content_id = any(p_ids)
    and ((c.status = 'accepted' and not public.signal_is_blocked(auth.uid(), c.collaborator_id))
         or (c.status = 'pending' and c.primary_author_id = auth.uid()));
$$;
grant execute on function public.fetch_collabs(text, uuid[]) to authenticated;

-- The people who can be invited: your CX Circle (you follow each other).
create or replace function public.fetch_my_circle(p_query text default null, p_limit integer default 30)
returns table (id uuid, full_name text, username text, avatar_url text)
language sql stable security definer set search_path = public
as $$
  select pr.id, pr.full_name, pr.username, pr.avatar_url
  from public.profiles pr
  where auth.uid() is not null
    and pr.id <> auth.uid()
    and exists (select 1 from public.profile_follows f where f.follower_id = auth.uid() and f.followee_id = pr.id)
    and exists (select 1 from public.profile_follows f where f.follower_id = pr.id and f.followee_id = auth.uid())
    and not public.signal_is_blocked(auth.uid(), pr.id)
    and (
      coalesce(btrim(p_query), '') = ''
      or pr.full_name ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%'
      or pr.username ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%'
    )
  order by pr.full_name nulls last
  limit least(coalesce(p_limit, 30), 60);
$$;
grant execute on function public.fetch_my_circle(text, integer) to authenticated;

-- ------------------------------------------------ Activity: two new kinds
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'post_respect', 'post_comment', 'post_share', 'post_save',
                  'circle', 'follow_accepted', 'follow_request', 'vision_selected', 'vision_featured',
                  'collab_invite', 'collab_left'));

create or replace function public._notif_actor_visible(p_type text, p_actor uuid, p_recipient uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p_actor is null then false
    when p_type in ('follow', 'follow_request', 'follow_accepted', 'circle', 'collab_invite', 'collab_left') then true
    when p_type in ('vision_selected', 'vision_featured') then false
    when p_type in ('post_respect', 'post_save') then
      exists (select 1 from public.profile_follows f where f.follower_id = p_actor and f.followee_id = p_recipient)
    else
      exists (
        select 1 from public.profile_follows f
        where (f.follower_id = p_recipient and f.followee_id = p_actor)
           or (f.follower_id = p_actor and f.followee_id = p_recipient)
      )
  end;
$$;

drop function if exists public.fetch_my_notifications(integer, timestamptz);
create or replace function public.fetch_my_notifications(p_limit integer default 30, p_before timestamptz default null)
returns table (
  id uuid, type text, created_at timestamptz, read_at timestamptz, count integer,
  actor_id uuid, actor_name text, actor_avatar_url text, actor_username text,
  actor_is_owner boolean, actor_is_admin boolean, actor_is_host boolean, actor_is_verified_client boolean,
  post_id uuid, post_body text, vision_id uuid, available boolean, pending_request boolean
)
language sql stable security definer set search_path = public
as $$
  select
    n.id, n.type, n.created_at, n.read_at, n.count,
    case when v.visible then pr.id end,
    case when v.visible then pr.full_name end,
    case when v.visible then pr.avatar_url end,
    case when v.visible then pr.username end,
    case when v.visible then coalesce(pr.is_owner, false) else false end,
    case when v.visible then coalesce(pr.is_admin, false) else false end,
    case when v.visible then coalesce(pr.is_host, false) else false end,
    case when v.visible then coalesce(pr.is_verified_client, false) else false end,
    n.post_id,
    case when a.ok then replace(p.body, chr(8203), '') end,
    case when a.ok then n.vision_id end,
    a.ok,
    (n.type = 'follow_request' and exists (
      select 1 from public.profile_follow_requests r where r.requester_id = na.actor_id and r.target_id = n.recipient_id
    ))
    or (n.type = 'collab_invite' and exists (
      select 1 from public.signal_collabs c
      where c.collaborator_id = n.recipient_id and c.status = 'pending'
        and c.content_id = coalesce(n.post_id, n.vision_id)
    ))
  from public.notifications n
  left join public.notification_actors na on na.notification_id = n.id
  left join public.profiles pr on pr.id = na.actor_id
  left join public.empire_posts p on p.id = n.post_id
  left join public.signal_visions sv on sv.id = n.vision_id
  cross join lateral (select public._notif_actor_visible(n.type, na.actor_id, n.recipient_id) as visible) v
  cross join lateral (
    select case
      when n.post_id is not null then p.id is not null and public.signal_can_view(auth.uid(), 'post', p.id, p.author_id)
      when n.type in ('collab_invite', 'collab_left') and n.vision_id is not null then
        sv.id is not null and public.signal_can_view(auth.uid(), 'vision', sv.id, sv.author_id)
      when n.type in ('vision_selected', 'vision_featured') then
        sv.id is not null and sv.author_id = auth.uid() and public._vision_is_public(sv.id)
        and exists (select 1 from public.signal_visions_profiles vp where vp.user_id = sv.author_id and vp.enabled)
      else true
    end as ok
  ) a
  where n.recipient_id = auth.uid()
    and not public.signal_is_blocked(auth.uid(), na.actor_id)
    and (n.type <> 'post_save' or v.visible)
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_my_notifications(integer, timestamptz) to authenticated;

-- ------------------------------------------------ profile: posts and Visions of both
drop function if exists public.fetch_empire_posts_by_author(uuid, integer, timestamptz);
create or replace function public.fetch_empire_posts_by_author(p_author_id uuid, p_limit integer default 20, p_before timestamptz default null)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_username text,
  author_is_owner boolean, author_is_admin boolean, author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  pinned_to_profile boolean, is_archived boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.username,
    pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.pinned_to_profile, p.is_archived,
    p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type,
    (
      select jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'make', c.make, 'model', c.model, 'year', c.year,
        'city', c.city, 'price_per_day', c.price_per_day,
        'image_url', (select ci.url from public.car_images ci where ci.car_id = c.id order by ci.position asc limit 1)
      )
      from public.cars c where c.id = p.vehicle_id
    )
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and public.signal_can_view(auth.uid(), 'post', p.id, p.author_id)
    and (p.author_id = p_author_id or public.signal_collab_partner('post', p.id) = p_author_id)
    and (not p.is_archived or p.author_id = auth.uid())
    and (p_before is null or p.created_at < p_before)
  order by (p.pinned_to_profile and p.author_id = p_author_id) desc, p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_posts_by_author(uuid, integer, timestamptz) to authenticated;

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
    and (v.author_id = p_author_id or public.signal_collab_partner('vision', v.id) = p_author_id)
    and exists (select 1 from public.signal_visions_profiles p where p.user_id = p_author_id and p.enabled)
    and public.signal_can_view(auth.uid(), 'vision', v.id, v.author_id)
    and (p_before is null or v.created_at < p_before)
  order by v.created_at desc, v.id desc
  limit least(coalesce(p_limit, 60), 120);
$$;
grant execute on function public.fetch_visions(uuid, integer, timestamptz) to authenticated;

-- ------------------------------------------------ "Following" and the For-you boost
drop function if exists public.fetch_for_you_feed(integer, integer, integer, timestamptz, text, text, text);
create or replace function public.fetch_for_you_feed(
  p_limit integer default 20, p_offset integer default 0, p_seed integer default 0,
  p_since timestamptz default null, p_mode text default 'foryou',
  p_publisher_scope text default 'community', p_author_kind text default null
)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  with pool as (
    select p.id, p.created_at
    from public.empire_posts p
    join public.profiles pr on pr.id = p.author_id
    where auth.uid() is not null
      and public.signal_can_view(auth.uid(), 'post', p.id, p.author_id)
      and not p.is_pinned
      and not p.is_featured
      and (
        p_publisher_scope is null
        or (p_publisher_scope = 'official' and p.publisher_type in ('owner', 'assistant', 'cx'))
        or (p_publisher_scope = 'community' and p.publisher_type = 'self')
      )
      and (
        p_author_kind is null
        or (p_author_kind = 'host' and pr.is_host)
        or (p_author_kind = 'verified_client' and pr.is_verified_client)
      )
      and (
        p_mode <> 'following'
        or p.author_id = auth.uid()
        or exists (select 1 from public.profile_follows f where f.follower_id = auth.uid() and f.followee_id = p.author_id)
        or public._collab_partner_followed(p.id)
      )
    order by p.created_at desc, p.id desc
    limit 600
  ),
  scored as (
    select
      pool.id, pool.created_at,
      (
        exp(- greatest(extract(epoch from (coalesce(p_since, now()) - pool.created_at)), 0) / 3600.0 / 72.0)
        + 0.6 * least(
            ln(1 + (select count(*) from public.empire_post_likes l where l.post_id = pool.id)
                 + 2 * (select count(*) from public.empire_post_comments c where c.post_id = pool.id)) / ln(61.0),
            1.2)
        + case when exists (
            select 1 from public.empire_post_views v
            where v.post_id = pool.id and v.user_id = auth.uid() and v.viewed_at < coalesce(p_since, now())
          ) then -0.7 else 0.4 end
        + case when exists (
            select 1 from public.empire_posts q join public.profile_follows f on f.followee_id = q.author_id
            where q.id = pool.id and f.follower_id = auth.uid()
          ) or public._collab_partner_followed(pool.id) then 0.5 else 0 end
        + 0.9 * ((abs(hashtext(pool.id::text || ':' || p_seed::text)::bigint) % 10000) / 10000.0)
      ) as score
    from pool
  ),
  page as (
    select s.id
    from scored s
    order by
      case when p_mode = 'following' then 0 else s.score end desc nulls last,
      s.created_at desc, s.id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(coalesce(p_limit, 20), 50)
  )
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type,
    (
      select jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'make', c.make, 'model', c.model, 'year', c.year,
        'city', c.city, 'price_per_day', c.price_per_day,
        'image_url', (select ci.url from public.car_images ci where ci.car_id = c.id order by ci.position asc limit 1)
      )
      from public.cars c where c.id = p.vehicle_id
    )
  from page
  join public.empire_posts p on p.id = page.id
  join public.profiles pr on pr.id = p.author_id
  join (
    select s.id, row_number() over (
      order by case when p_mode = 'following' then 0 else s.score end desc nulls last, s.created_at desc, s.id desc
    ) as rn
    from scored s
  ) ord on ord.id = page.id
  order by ord.rn;
$$;
grant execute on function public.fetch_for_you_feed(integer, integer, integer, timestamptz, text, text, text) to authenticated;
