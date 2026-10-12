-- 0113 — An Admin who is not the Owner never publishes in SIGNAL under their own account:
-- anything they send as 'owner' or 'self' is stored as the CX team voice instead.
-- A trigger (not a rewrite of the publish functions), so every existing path is covered
-- and nothing else changes. Past posts are left as they are.

create or replace function public.signal_admin_team_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.publisher_type is not distinct from old.publisher_type then
    return new;
  end if;
  if new.publisher_type in ('owner', 'self')
     and public.is_admin(new.author_id)
     and not public.is_owner(new.author_id) then
    new.publisher_type := 'cx';
  end if;
  return new;
end;
$$;

drop trigger if exists empire_posts_admin_team_only on public.empire_posts;
create trigger empire_posts_admin_team_only
  before insert or update of publisher_type on public.empire_posts
  for each row execute function public.signal_admin_team_only();

drop trigger if exists empire_stories_admin_team_only on public.empire_stories;
create trigger empire_stories_admin_team_only
  before insert or update of publisher_type on public.empire_stories
  for each row execute function public.signal_admin_team_only();
