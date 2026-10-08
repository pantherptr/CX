-- Owner and Admin can Save and View a post more than once (like 0074 did for
-- Respects): every tap adds one, with no ceiling. Everybody else still has at
-- most one Save and one View per post.
--
-- Both tables get a `bump` column. The old one-row-per-person rule becomes
-- "one row per (post, person, bump)": regular accounts only ever write bump 0,
-- so nothing changes for them, while the team's extra rows take bump 1, 2, 3…
-- Every count in the app is count(*) over these rows, so the totals (and the
-- Owner/Admin "Performance" line) include the extras with no other change.

-- ---------------------------------------------------------------- Saves
alter table public.empire_post_saves add column if not exists bump integer not null default 0;

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.empire_post_saves'::regclass and contype = 'u'
  loop
    execute format('alter table public.empire_post_saves drop constraint %I', c);
  end loop;
end $$;

alter table public.empire_post_saves
  add constraint empire_post_saves_post_user_bump_key unique (post_id, user_id, bump);

-- The "Saved" list shows each post once, however many times it was saved.
drop function if exists public.fetch_empire_saved_posts(integer, timestamptz);
create or replace function public.fetch_empire_saved_posts(p_limit integer default 20, p_before timestamptz default null)
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
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s2 where s2.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    true,
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
  join (
    select post_id, max(created_at) as created_at
    from public.empire_post_saves
    where user_id = auth.uid()
    group by post_id
  ) s on s.post_id = p.id
  where auth.uid() is not null
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_saved_posts(integer, timestamptz) to authenticated;

create or replace function public.add_empire_post_save(p_post_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_next integer;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select coalesce(max(bump), -1) + 1 into v_next from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
  insert into public.empire_post_saves (post_id, user_id, bump) values (p_post_id, auth.uid(), v_next);
  select count(*)::int into v_count from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
  return v_count;
end;
$$;
grant execute on function public.add_empire_post_save(uuid) to authenticated;

create or replace function public.my_empire_save_count(p_post_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
$$;
grant execute on function public.my_empire_save_count(uuid) to authenticated;

create or replace function public.clear_empire_post_saves(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
end;
$$;
grant execute on function public.clear_empire_post_saves(uuid) to authenticated;

-- ---------------------------------------------------------------- Views
alter table public.empire_post_views add column if not exists bump integer not null default 0;
alter table public.empire_post_views drop constraint if exists empire_post_views_pkey;
alter table public.empire_post_views add primary key (post_id, user_id, bump);

-- A person's own first view is still recorded once (bump 0).
create or replace function public.mark_empire_post_viewed(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.empire_post_views (post_id, user_id, bump) values (p_post_id, auth.uid(), 0)
  on conflict (post_id, user_id, bump) do nothing;
end;
$$;
grant execute on function public.mark_empire_post_viewed(uuid) to authenticated;

create or replace function public.add_empire_post_view(p_post_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_next integer;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select coalesce(max(bump), -1) + 1 into v_next from public.empire_post_views where post_id = p_post_id and user_id = auth.uid();
  insert into public.empire_post_views (post_id, user_id, bump) values (p_post_id, auth.uid(), v_next);
  select count(*)::int into v_count from public.empire_post_views where post_id = p_post_id and user_id = auth.uid();
  return v_count;
end;
$$;
grant execute on function public.add_empire_post_view(uuid) to authenticated;

create or replace function public.my_empire_view_count(p_post_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.empire_post_views where post_id = p_post_id and user_id = auth.uid();
$$;
grant execute on function public.my_empire_view_count(uuid) to authenticated;

-- Removes only the extras (bump > 0): the account's own natural view stays.
create or replace function public.clear_empire_post_extra_views(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.empire_post_views where post_id = p_post_id and user_id = auth.uid() and bump > 0;
end;
$$;
grant execute on function public.clear_empire_post_extra_views(uuid) to authenticated;
