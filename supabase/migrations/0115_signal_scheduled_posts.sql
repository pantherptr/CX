-- 0115 — SIGNAL scheduled posts.
-- A post written now and published later. The row waits in empire_scheduled_posts; whoever opens
-- SIGNAL (and the daily sweep) calls publish_due_scheduled_posts(), which turns every due row into a
-- real empire_posts row — through the same insert, so the push fan-out, the admin team-only trigger
-- (0113) and everything else behave exactly as for a post made by hand.

create table if not exists public.empire_scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  title text,
  body text not null,
  media_paths text[] not null default '{}',
  publisher_type text not null default 'self',
  vehicle_id uuid,
  comments_disabled boolean not null default false,
  publish_at timestamptz not null,
  created_at timestamptz not null default now(),
  published_post_id uuid
);

create index if not exists empire_scheduled_posts_due_idx
  on public.empire_scheduled_posts (publish_at) where published_post_id is null;

alter table public.empire_scheduled_posts enable row level security;

drop policy if exists "scheduled posts: own rows" on public.empire_scheduled_posts;
create policy "scheduled posts: own rows" on public.empire_scheduled_posts
  for select using (author_id = auth.uid());

create or replace function public.schedule_empire_post(
  p_category text, p_title text, p_body text, p_media_paths text[], p_publisher_type text,
  p_vehicle_id uuid, p_publish_at timestamptz
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_type text := coalesce(p_publisher_type, 'self');
  v_id uuid;
begin
  if auth.uid() is null or not public.can_publish_signal_content() then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post body cannot be empty';
  end if;
  if p_publish_at < now() + interval '1 minute' then
    raise exception 'Pick a time in the future';
  end if;
  if p_publish_at > now() + interval '60 days' then
    raise exception 'You can schedule up to 60 days ahead';
  end if;
  if not public.is_admin() then
    v_type := 'self';
  elsif v_type not in ('owner', 'assistant', 'cx', 'self') then
    raise exception 'Invalid publisher identity';
  end if;
  insert into public.empire_scheduled_posts
    (author_id, category, title, body, media_paths, publisher_type, vehicle_id, publish_at)
  values
    (auth.uid(), p_category, nullif(trim(p_title), ''), p_body, coalesce(p_media_paths, '{}'), v_type, p_vehicle_id, p_publish_at)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.schedule_empire_post(text, text, text, text[], text, uuid, timestamptz) to authenticated;

create or replace function public.my_scheduled_posts()
returns table (id uuid, category text, title text, body text, media_paths text[], publish_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select s.id, s.category, s.title, s.body, s.media_paths, s.publish_at
  from public.empire_scheduled_posts s
  where s.author_id = auth.uid() and s.published_post_id is null
  order by s.publish_at asc;
$$;
grant execute on function public.my_scheduled_posts() to authenticated;

create or replace function public.cancel_scheduled_post(p_id uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from public.empire_scheduled_posts
  where id = p_id and author_id = auth.uid() and published_post_id is null;
$$;
grant execute on function public.cancel_scheduled_post(uuid) to authenticated;

create or replace function public.publish_due_scheduled_posts()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_post uuid;
  n integer := 0;
begin
  for r in
    select * from public.empire_scheduled_posts
    where published_post_id is null and publish_at <= now()
    order by publish_at
    limit 50
    for update skip locked
  loop
    insert into public.empire_posts (author_id, category, title, body, media_paths, comments_disabled, publisher_type, vehicle_id)
    values (r.author_id, r.category, r.title, r.body, r.media_paths, r.comments_disabled, r.publisher_type, r.vehicle_id)
    returning id into v_post;
    update public.empire_scheduled_posts set published_post_id = v_post where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function public.publish_due_scheduled_posts() to authenticated, service_role;
