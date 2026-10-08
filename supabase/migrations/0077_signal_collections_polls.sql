-- SIGNAL: Save-to-collections and polls.

-- ----------------------------------------------------------- Collections
-- A person's own folders for saved posts ("To rent", "Trip ideas"…). Private:
-- every policy is "it's mine".
create table if not exists public.empire_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists empire_collections_user_idx on public.empire_collections (user_id, created_at);

create table if not exists public.empire_collection_posts (
  collection_id uuid not null references public.empire_collections(id) on delete cascade,
  post_id uuid not null references public.empire_posts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, post_id)
);
create index if not exists empire_collection_posts_post_idx on public.empire_collection_posts (post_id);

alter table public.empire_collections enable row level security;
alter table public.empire_collection_posts enable row level security;

drop policy if exists "Own collections" on public.empire_collections;
create policy "Own collections" on public.empire_collections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Own collection posts" on public.empire_collection_posts;
create policy "Own collection posts" on public.empire_collection_posts
  for all
  using (exists (select 1 from public.empire_collections c where c.id = collection_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.empire_collections c where c.id = collection_id and c.user_id = auth.uid()));

-- ----------------------------------------------------------------- Polls
-- A poll belongs to one post (its text is the question). Nobody reads these
-- tables directly: votes go through the functions below, and who voted what
-- is never exposed — only the totals.
create table if not exists public.empire_polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.empire_posts(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.empire_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.empire_polls(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  position integer not null
);
create index if not exists empire_poll_options_poll_idx on public.empire_poll_options (poll_id, position);
create table if not exists public.empire_poll_votes (
  poll_id uuid not null references public.empire_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_id uuid not null references public.empire_poll_options(id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
alter table public.empire_polls enable row level security;
alter table public.empire_poll_options enable row level security;
alter table public.empire_poll_votes enable row level security;
revoke all on public.empire_polls, public.empire_poll_options, public.empire_poll_votes from anon, authenticated;

-- Attach a poll (2–4 options) to a post you wrote.
create or replace function public.create_empire_poll(p_post_id uuid, p_options text[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_poll uuid;
  v_clean text[];
  i integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.empire_posts where id = p_post_id and (author_id = auth.uid() or public.is_admin())) then
    raise exception 'Not authorized';
  end if;
  select array_agg(btrim(o)) into v_clean from unnest(p_options) o where btrim(o) <> '';
  if v_clean is null or array_length(v_clean, 1) < 2 or array_length(v_clean, 1) > 4 then
    raise exception 'A poll needs 2 to 4 options';
  end if;
  insert into public.empire_polls (post_id) values (p_post_id) returning id into v_poll;
  for i in 1..array_length(v_clean, 1) loop
    insert into public.empire_poll_options (poll_id, label, position) values (v_poll, left(v_clean[i], 60), i);
  end loop;
end;
$$;
grant execute on function public.create_empire_poll(uuid, text[]) to authenticated;

-- Vote, or change your vote.
create or replace function public.vote_empire_poll(p_option_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_poll uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select poll_id into v_poll from public.empire_poll_options where id = p_option_id;
  if v_poll is null then
    raise exception 'Option not found';
  end if;
  insert into public.empire_poll_votes (poll_id, user_id, option_id) values (v_poll, auth.uid(), p_option_id)
  on conflict (poll_id, user_id) do update set option_id = excluded.option_id, voted_at = now();
end;
$$;
grant execute on function public.vote_empire_poll(uuid) to authenticated;

-- The polls of a set of posts: options, totals, and which option is mine.
create or replace function public.fetch_empire_polls(p_post_ids uuid[])
returns table (post_id uuid, poll_id uuid, option_id uuid, label text, option_position integer, votes integer, my_vote boolean)
language sql stable security definer set search_path = public
as $$
  select
    p.post_id, p.id, o.id, o.label, o.position,
    (select count(*)::int from public.empire_poll_votes v where v.option_id = o.id),
    exists (select 1 from public.empire_poll_votes v where v.option_id = o.id and v.user_id = auth.uid())
  from public.empire_polls p
  join public.empire_poll_options o on o.poll_id = p.id
  where auth.uid() is not null and p.post_id = any (p_post_ids)
  order by p.post_id, o.position;
$$;
grant execute on function public.fetch_empire_polls(uuid[]) to authenticated;
