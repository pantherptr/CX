-- CX Visions — an optional visual portfolio on a profile.
--
-- Deliberately additive: no existing table, column, function or policy is
-- changed. Two new tables hold the opt-in and the per-post flag, and every
-- read/write goes through small security-definer RPCs.
--
--   signal_visions_profiles   one row per user who ever touched Visions;
--                             `enabled` is the switch. Turning it off keeps
--                             every selection (the rows below stay), the
--                             public RPC simply returns nothing meanwhile.
--   signal_post_visions       the flag on a post (`isVision` = a row exists).
--                             `vision_only` = hide it from the public feed
--                             and the Posts tab, show it only in Visions.
--
-- A Vision is always an ordinary empire_posts row: same media, same Respect,
-- same comments. Only photo/video posts can be flagged.

create table if not exists public.signal_visions_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.signal_post_visions (
  post_id uuid primary key references public.empire_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  vision_only boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists signal_post_visions_author_idx on public.signal_post_visions (author_id, created_at desc);

alter table public.signal_visions_profiles enable row level security;
alter table public.signal_post_visions enable row level security;
-- No policies on purpose: nothing reads or writes these tables directly.

-- Is Visions switched on for this profile? (any signed-in user may ask)
create or replace function public.fetch_visions_enabled(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select v.enabled from public.signal_visions_profiles v where v.user_id = p_user_id),
    false
  ) and auth.uid() is not null;
$$;

-- The signed-in user switches their own Visions on/off. Off keeps all data.
create or replace function public.set_my_visions_enabled(p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.signal_visions_profiles (user_id, enabled, updated_at)
  values (auth.uid(), p_enabled, now())
  on conflict (user_id) do update set enabled = excluded.enabled, updated_at = now();
  return p_enabled;
end;
$$;

-- Flag / unflag one of my own posts. Only a photo/video post can be a
-- Vision, and only while my Visions is on. p_is_vision = false removes it.
create or replace function public.set_post_vision(p_post_id uuid, p_is_vision boolean, p_vision_only boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_author uuid;
  v_media text[];
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select author_id, media_paths into v_author, v_media from public.empire_posts where id = p_post_id;
  if v_author is null or v_author <> auth.uid() then raise exception 'Not your post'; end if;

  if not p_is_vision or coalesce(cardinality(v_media), 0) = 0 then
    delete from public.signal_post_visions where post_id = p_post_id;
    return;
  end if;

  if not exists (select 1 from public.signal_visions_profiles where user_id = auth.uid() and enabled) then
    raise exception 'Visions is not enabled';
  end if;

  insert into public.signal_post_visions (post_id, author_id, vision_only)
  values (p_post_id, auth.uid(), coalesce(p_vision_only, false))
  on conflict (post_id) do update set vision_only = excluded.vision_only;
end;
$$;

-- For a page of posts: which are Visions, and which are Visions-only?
create or replace function public.fetch_post_vision_flags(p_post_ids uuid[])
returns table (post_id uuid, vision_only boolean)
language sql stable security definer set search_path = public
as $$
  select pv.post_id, pv.vision_only
  from public.signal_post_visions pv
  where auth.uid() is not null and pv.post_id = any(p_post_ids);
$$;

-- A profile's public portfolio: the ids of its Visions, newest post first.
-- Empty while the owner has Visions switched off or the post is archived.
create or replace function public.fetch_vision_post_ids(p_author_id uuid, p_limit integer default 60)
returns table (post_id uuid)
language sql stable security definer set search_path = public
as $$
  select pv.post_id
  from public.signal_post_visions pv
  join public.empire_posts p on p.id = pv.post_id
  join public.signal_visions_profiles vp on vp.user_id = pv.author_id and vp.enabled
  where auth.uid() is not null
    and pv.author_id = p_author_id
    and not p.is_archived
    and coalesce(cardinality(p.media_paths), 0) > 0
  order by p.created_at desc, p.id desc
  limit least(coalesce(p_limit, 60), 120);
$$;

grant execute on function public.fetch_visions_enabled(uuid) to authenticated;
grant execute on function public.set_my_visions_enabled(boolean) to authenticated;
grant execute on function public.set_post_vision(uuid, boolean, boolean) to authenticated;
grant execute on function public.fetch_post_vision_flags(uuid[]) to authenticated;
grant execute on function public.fetch_vision_post_ids(uuid, integer) to authenticated;
