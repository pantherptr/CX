-- Only the Owner gets the "double" multiplier. Admins can still stack Respects /
-- Saves / Views / poll votes, but strictly one per tap: any batch larger than 1
-- from a non-Owner is cut back to 1 here, whatever the app sends.

create or replace function public.add_empire_post_respect(p_post_id uuid, p_amount integer default 1)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_had boolean;
  v_author uuid;
  v_count integer;
  v_n integer := case when public.is_owner() then greatest(1, least(coalesce(p_amount, 1), 100000)) else 1 end;
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

create or replace function public.add_empire_post_save(p_post_id uuid, p_amount integer default 1)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_next integer;
  v_count integer;
  v_n integer := case when public.is_owner() then greatest(1, least(coalesce(p_amount, 1), 100000)) else 1 end;
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

create or replace function public.add_empire_post_view(p_post_id uuid, p_amount integer default 1)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_next integer;
  v_count integer;
  v_n integer := case when public.is_owner() then greatest(1, least(coalesce(p_amount, 1), 100000)) else 1 end;
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

create or replace function public.add_empire_poll_votes(p_option_id uuid, p_amount integer default 1)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_poll uuid;
  v_next integer;
  v_n integer := case when public.is_owner() then greatest(1, least(coalesce(p_amount, 1), 100000)) else 1 end;
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
