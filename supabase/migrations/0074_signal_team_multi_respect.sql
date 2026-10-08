-- Owner and Admin can Respect a post more than once: every tap adds one, with
-- no ceiling. Everybody else keeps exactly one Respect per post.
--
-- A Respect is a row in empire_post_likes, and every feed/analytics query
-- already counts rows, so letting the team own several rows is all it takes —
-- the totals (and the Owner/Admin "Performance" line) pick the extra Respects
-- up without touching any of those queries.

-- 1. The (post_id, user_id) uniqueness is what allowed only one row.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.empire_post_likes'::regclass and contype = 'u'
  loop
    execute format('alter table public.empire_post_likes drop constraint %I', c);
  end loop;
end $$;

create index if not exists empire_post_likes_post_user_idx
  on public.empire_post_likes (post_id, user_id);

-- 2. ...so it is enforced here instead, for everyone except the team: a second
--    insert by a non-admin is silently skipped (a double-tap race can't give a
--    regular account two Respects).
create or replace function public.empire_post_likes_single()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin(new.user_id)
     and exists (select 1 from public.empire_post_likes l where l.post_id = new.post_id and l.user_id = new.user_id) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists empire_post_likes_single on public.empire_post_likes;
create trigger empire_post_likes_single
  before insert on public.empire_post_likes
  for each row execute function public.empire_post_likes_single();

-- 3. Add one more Respect (Owner/Admin only). Returns how many the caller has
--    now. The author is notified once, on the first.
create or replace function public.add_empire_post_respect(p_post_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_had boolean;
  v_author uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select exists (select 1 from public.empire_post_likes where post_id = p_post_id and user_id = auth.uid()) into v_had;
  insert into public.empire_post_likes (post_id, user_id) values (p_post_id, auth.uid());
  if not v_had then
    select author_id into v_author from public.empire_posts where id = p_post_id;
    perform public.create_signal_notification(v_author, 'post_respect', p_post_id);
  end if;
  select count(*)::int into v_count from public.empire_post_likes where post_id = p_post_id and user_id = auth.uid();
  return v_count;
end;
$$;
grant execute on function public.add_empire_post_respect(uuid) to authenticated;

-- 4. How many Respects the caller has given this post.
create or replace function public.my_empire_respect_count(p_post_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.empire_post_likes where post_id = p_post_id and user_id = auth.uid();
$$;
grant execute on function public.my_empire_respect_count(uuid) to authenticated;

-- 5. Take all of the caller's Respects back from a post.
create or replace function public.clear_empire_post_respects(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.empire_post_likes where post_id = p_post_id and user_id = auth.uid();
end;
$$;
grant execute on function public.clear_empire_post_respects(uuid) to authenticated;
