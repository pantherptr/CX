-- Owner/Admin multi-tap: every Respect / Save / View / poll vote can now add a
-- batch instead of exactly one. The app sends p_amount = 1 ("one by one") or
-- the number the team already has ("double": 1, 2, 4, 8…). Capped per call so
-- a runaway doubling can't write millions of rows in one go.

-- Respects --------------------------------------------------------------
drop function if exists public.add_empire_post_respect(uuid);
create or replace function public.add_empire_post_respect(p_post_id uuid, p_amount integer default 1)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_had boolean;
  v_author uuid;
  v_count integer;
  v_n integer := greatest(1, least(coalesce(p_amount, 1), 100000));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select exists (select 1 from public.empire_post_likes where post_id = p_post_id and user_id = auth.uid()) into v_had;
  insert into public.empire_post_likes (post_id, user_id) select p_post_id, auth.uid() from generate_series(1, v_n);
  if not v_had then
    select author_id into v_author from public.empire_posts where id = p_post_id;
    perform public.create_signal_notification(v_author, 'post_respect', p_post_id);
  end if;
  select count(*)::int into v_count from public.empire_post_likes where post_id = p_post_id and user_id = auth.uid();
  return v_count;
end;
$$;
grant execute on function public.add_empire_post_respect(uuid, integer) to authenticated;

-- Saves -----------------------------------------------------------------
drop function if exists public.add_empire_post_save(uuid);
create or replace function public.add_empire_post_save(p_post_id uuid, p_amount integer default 1)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_next integer;
  v_count integer;
  v_n integer := greatest(1, least(coalesce(p_amount, 1), 100000));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select coalesce(max(bump), -1) + 1 into v_next from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
  insert into public.empire_post_saves (post_id, user_id, bump)
    select p_post_id, auth.uid(), v_next + g from generate_series(0, v_n - 1) g;
  select count(*)::int into v_count from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
  return v_count;
end;
$$;
grant execute on function public.add_empire_post_save(uuid, integer) to authenticated;

-- Views -----------------------------------------------------------------
drop function if exists public.add_empire_post_view(uuid);
create or replace function public.add_empire_post_view(p_post_id uuid, p_amount integer default 1)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_next integer;
  v_count integer;
  v_n integer := greatest(1, least(coalesce(p_amount, 1), 100000));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select coalesce(max(bump), -1) + 1 into v_next from public.empire_post_views where post_id = p_post_id and user_id = auth.uid();
  insert into public.empire_post_views (post_id, user_id, bump)
    select p_post_id, auth.uid(), v_next + g from generate_series(0, v_n - 1) g;
  select count(*)::int into v_count from public.empire_post_views where post_id = p_post_id and user_id = auth.uid();
  return v_count;
end;
$$;
grant execute on function public.add_empire_post_view(uuid, integer) to authenticated;

-- Poll votes ------------------------------------------------------------
-- A regular account keeps exactly one vote (bump 0); the team can stack more.
alter table public.empire_poll_votes add column if not exists bump integer not null default 0;
alter table public.empire_poll_votes drop constraint if exists empire_poll_votes_pkey;
alter table public.empire_poll_votes add primary key (poll_id, user_id, bump);

create or replace function public.vote_empire_poll(p_option_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_poll uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select poll_id into v_poll from public.empire_poll_options where id = p_option_id;
  if v_poll is null then raise exception 'Option not found'; end if;
  insert into public.empire_poll_votes (poll_id, user_id, option_id, bump) values (v_poll, auth.uid(), p_option_id, 0)
  on conflict (poll_id, user_id, bump) do update set option_id = excluded.option_id, voted_at = now();
end;
$$;
grant execute on function public.vote_empire_poll(uuid) to authenticated;

create or replace function public.add_empire_poll_votes(p_option_id uuid, p_amount integer default 1)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_poll uuid;
  v_next integer;
  v_n integer := greatest(1, least(coalesce(p_amount, 1), 100000));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select poll_id into v_poll from public.empire_poll_options where id = p_option_id;
  if v_poll is null then raise exception 'Option not found'; end if;
  select coalesce(max(bump), -1) + 1 into v_next from public.empire_poll_votes where poll_id = v_poll and user_id = auth.uid();
  insert into public.empire_poll_votes (poll_id, user_id, option_id, bump)
    select v_poll, auth.uid(), p_option_id, v_next + g from generate_series(0, v_n - 1) g;
end;
$$;
grant execute on function public.add_empire_poll_votes(uuid, integer) to authenticated;

create or replace function public.clear_my_poll_votes(p_poll_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  delete from public.empire_poll_votes where poll_id = p_poll_id and user_id = auth.uid();
end;
$$;
grant execute on function public.clear_my_poll_votes(uuid) to authenticated;

-- The poll list now also says how many votes the caller has on each option.
drop function if exists public.fetch_empire_polls(uuid[]);
create or replace function public.fetch_empire_polls(p_post_ids uuid[])
returns table (post_id uuid, poll_id uuid, option_id uuid, label text, option_position integer, votes integer, my_vote boolean, my_votes integer)
language sql stable security definer set search_path = public
as $$
  select
    p.post_id, p.id, o.id, o.label, o.position,
    (select count(*)::int from public.empire_poll_votes v where v.option_id = o.id),
    exists (select 1 from public.empire_poll_votes v where v.option_id = o.id and v.user_id = auth.uid()),
    (select count(*)::int from public.empire_poll_votes v where v.option_id = o.id and v.user_id = auth.uid())
  from public.empire_polls p
  join public.empire_poll_options o on o.poll_id = p.id
  where auth.uid() is not null and p.post_id = any (p_post_ids)
  order by p.post_id, o.position;
$$;
grant execute on function public.fetch_empire_polls(uuid[]) to authenticated;
