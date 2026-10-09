-- CX Visions, take two: a real portfolio, separate from posts.
--
-- 0085 flagged ordinary posts as Visions. That mixed two things the product
-- keeps apart: everyone posts photos/videos in the normal feed; Visions is a
-- personal, professional portfolio. So a Vision is now its own item — own
-- storage bucket, own table, own upload — and never touches empire_posts.
--
-- Kept from 0085: signal_visions_profiles / fetch_visions_enabled /
-- set_my_visions_enabled (the opt-in switch). Dropped: the per-post flag.
--
-- Any signed-in user with Visions switched on can add items (a photographer
-- needn't be a Host or Verified Client). Switching Visions off hides the
-- portfolio from everyone else but keeps every item.

-- 1. Remove the per-post flag from 0085 (nothing else depends on it).
drop function if exists public.set_post_vision(uuid, boolean, boolean);
drop function if exists public.fetch_post_vision_flags(uuid[]);
drop function if exists public.fetch_vision_post_ids(uuid, integer);
drop table if exists public.signal_post_visions;

-- 2. Storage: a public-read bucket, uploads only into your own folder and
--    only while your Visions is on.
insert into storage.buckets (id, name, public, file_size_limit)
values ('signal-visions', 'signal-visions', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "Visions owners can upload" on storage.objects;
create policy "Visions owners can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'signal-visions'
    and auth.uid()::text = (storage.foldername(name))[1]
    and exists (select 1 from public.signal_visions_profiles v where v.user_id = auth.uid() and v.enabled)
  );

drop policy if exists "Visions owners can delete" on storage.objects;
create policy "Visions owners can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'signal-visions'
    and (public.is_admin() or auth.uid()::text = (storage.foldername(name))[1])
  );

-- 3. The portfolio items.
create table if not exists public.signal_visions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  media_path text not null,
  media_kind text not null check (media_kind in ('image', 'video')),
  title text,
  caption text,
  created_at timestamptz not null default now()
);
create index if not exists signal_visions_author_idx on public.signal_visions (author_id, created_at desc, id desc);
alter table public.signal_visions enable row level security;
-- No policies: everything goes through the RPCs below.

create or replace function public.add_vision(p_media_path text, p_media_kind text, p_title text default null, p_caption text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.signal_visions_profiles where user_id = auth.uid() and enabled) then
    raise exception 'Visions is not enabled';
  end if;
  if p_media_kind not in ('image', 'video') then raise exception 'Bad media kind'; end if;
  if p_media_path is null or split_part(p_media_path, '/', 1) <> auth.uid()::text then
    raise exception 'Media must be in your own folder';
  end if;
  insert into public.signal_visions (author_id, media_path, media_kind, title, caption)
  values (
    auth.uid(), p_media_path, p_media_kind,
    nullif(left(btrim(coalesce(p_title, '')), 80), ''),
    nullif(left(btrim(coalesce(p_caption, '')), 400), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_vision(p_id uuid, p_title text, p_caption text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.signal_visions
  set title = nullif(left(btrim(coalesce(p_title, '')), 80), ''),
      caption = nullif(left(btrim(coalesce(p_caption, '')), 400), '')
  where id = p_id and author_id = auth.uid();
end;
$$;

-- Returns the storage path so the client can remove the file too.
create or replace function public.delete_vision(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_path text;
begin
  delete from public.signal_visions where id = p_id and author_id = auth.uid() returning media_path into v_path;
  return v_path;
end;
$$;

-- A profile's portfolio, newest first. Empty while its owner has Visions off.
create or replace function public.fetch_visions(p_author_id uuid, p_limit integer default 60, p_before timestamptz default null)
returns table (id uuid, author_id uuid, media_path text, media_kind text, title text, caption text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select v.id, v.author_id, v.media_path, v.media_kind, v.title, v.caption, v.created_at
  from public.signal_visions v
  where auth.uid() is not null
    and v.author_id = p_author_id
    and exists (select 1 from public.signal_visions_profiles p where p.user_id = v.author_id and p.enabled)
    and (p_before is null or v.created_at < p_before)
  order by v.created_at desc, v.id desc
  limit least(coalesce(p_limit, 60), 120);
$$;

grant execute on function public.add_vision(text, text, text, text) to authenticated;
grant execute on function public.update_vision(uuid, text, text) to authenticated;
grant execute on function public.delete_vision(uuid) to authenticated;
grant execute on function public.fetch_visions(uuid, integer, timestamptz) to authenticated;
