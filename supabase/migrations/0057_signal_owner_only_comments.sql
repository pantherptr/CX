-- SIGNAL — tighten comment creation from "CX team" (Owner or Admin) down
-- to Owner only, and let the Owner choose which of the three official
-- voices (Owner / CX Assistant / CX Rent) a comment displays as — the
-- exact same publisher-identity concept posts already have, reused here
-- rather than invented twice.
--
-- 'self' stays a valid value (not user-facing, never produced by the RPC
-- from this point on) specifically so every comment written before this
-- migration — by whoever the real "CX team" was at the time under the
-- previous rule — keeps showing its real author's own live identity
-- (resolveSignalIdentity's existing 'self' case), rather than being
-- silently relabeled as the Owner. The column default backfills every
-- existing row to exactly that.
alter table public.empire_post_comments
  add column publisher_type text not null default 'self'
  check (publisher_type in ('owner', 'assistant', 'cx', 'self'));

drop function if exists public.add_empire_post_comment(uuid, text);
create or replace function public.add_empire_post_comment(p_post_id uuid, p_body text, p_publisher_type text default 'owner')
returns public.empire_post_comments
language plpgsql security definer set search_path = public
as $$
declare
  v_disabled boolean;
  v_author uuid;
  v_comment public.empire_post_comments;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  -- Strictly the real Owner account — is_owner() only, not is_admin()
  -- (which also covers Admin). A comment "as CX Assistant" is still
  -- always inserted under the Owner's own auth.uid(); there is no
  -- separate CX Assistant login that gains this permission.
  if not public.is_owner() then
    raise exception 'Only the Owner can comment';
  end if;
  if p_publisher_type not in ('owner', 'assistant', 'cx') then
    raise exception 'Invalid comment identity';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Comment cannot be empty';
  end if;
  select comments_disabled, author_id into v_disabled, v_author from public.empire_posts where id = p_post_id;
  if v_disabled is null then
    raise exception 'Post not found';
  end if;
  if v_disabled then
    raise exception 'Comments are disabled for this post';
  end if;
  insert into public.empire_post_comments (post_id, user_id, body, publisher_type)
  values (p_post_id, auth.uid(), p_body, p_publisher_type)
  returning * into v_comment;
  perform public.create_signal_notification(v_author, 'post_comment', p_post_id);
  return v_comment;
end;
$$;
grant execute on function public.add_empire_post_comment(uuid, text, text) to authenticated;
