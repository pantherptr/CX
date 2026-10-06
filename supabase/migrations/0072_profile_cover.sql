-- A separate cover photo for SIGNAL profile cards. The profile picture
-- (avatar_url) stays what it is everywhere else on CX; the cover is only
-- the big photo on the SIGNAL card, and falls back to the avatar when empty.
alter table public.profiles add column if not exists cover_url text;

-- Same function as 0059, plus `cover_url` in its safe public projection.
create or replace function public.fetch_signal_profile(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select jsonb_build_object(
    'id', pr.id,
    'full_name', pr.full_name,
    'avatar_url', pr.avatar_url,
    'bio', pr.bio,
    'cover_url', pr.cover_url,
    'username', pr.username,
    'is_host', pr.is_host,
    'is_verified_client', pr.is_verified_client,
    'is_owner', pr.is_owner,
    'is_admin', pr.is_admin,
    'verified', pr.verified,
    'is_superhost', pr.is_superhost,
    'rating', pr.rating,
    'trips', pr.trips,
    'response_time', pr.response_time,
    'response_rate', pr.response_rate,
    'joined', pr.joined,
    'followers_count', (select count(*)::int from public.profile_follows f where f.followee_id = pr.id),
    'following_count', (select count(*)::int from public.profile_follows f where f.follower_id = pr.id),
    'followed_by_me', exists(select 1 from public.profile_follows f where f.follower_id = auth.uid() and f.followee_id = pr.id)
  )
  into v_result
  from public.profiles pr
  where pr.id = p_user_id;
  if v_result is null then
    raise exception 'Profile not found';
  end if;
  return v_result;
end;
$$;
