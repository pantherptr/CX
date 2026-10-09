-- Spotlight as a real team post (so it can take Respect, comments, saves, shares).
--
-- Publishing a Spotlight now also creates one ordinary post by the CX team
-- (publisher 'cx') whose body is just the marker "[[signal-spotlight]]" — no
-- media, no copy of anything. The post renders as a special card: its photo and
-- creator are still read live from the source Vision, through the Spotlight
-- entry. The entry remembers the post (post_id); if the post is deleted the link
-- is simply cleared. Builds on 0087/0089.

alter table public.signal_spotlight_entries
  add column if not exists post_id uuid references public.empire_posts(id) on delete set null;

-- Admin links the team post the client just created to the entry.
create or replace function public.set_spotlight_post(p_entry_id uuid, p_post_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if not exists (
    select 1 from public.empire_posts
    where id = p_post_id and publisher_type = 'cx' and body = '[[signal-spotlight]]'
  ) then
    raise exception 'Not a Spotlight post';
  end if;
  update public.signal_spotlight_entries set post_id = p_post_id where id = p_entry_id;
end;
$$;
grant execute on function public.set_spotlight_post(uuid, uuid) to authenticated;

-- publish_spotlight now says which entry it made and which post (if any) it
-- already has, so the client creates the post only the first time.
drop function if exists public.publish_spotlight(uuid, uuid, text, text, text);
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
  returning id, post_id into v_id, v_post;
  return jsonb_build_object('entry_id', v_id, 'post_id', v_post);
end;
$$;
grant execute on function public.publish_spotlight(uuid, uuid, text, text, text) to authenticated;

-- The feed also returns the team post, when there is one.
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
  order by e.published_at desc
  limit least(coalesce(p_limit, 6), 20);
$$;
grant execute on function public.fetch_spotlight_feed(integer) to authenticated;
