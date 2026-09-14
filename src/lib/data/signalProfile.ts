import { supabase } from '../supabase';

/**
 * The public profile a SIGNAL post's identity opens into (tap an
 * author's name/avatar). Backed by `fetch_signal_profile` — the exact
 * same "safe public projection" philosophy `fetchCarWithHost` already
 * established for a Host's info on `CarDetails.tsx` (never phone,
 * location, suspended, or stripe_customer_id). Cars aren't embedded here
 * — see `fetchHostCars` in `cars.ts`, called separately when `isHost`.
 */
export interface SignalProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  /** `null` until the user has chosen one — see setSignalUsername. */
  username: string | null;
  isHost: boolean;
  isVerifiedClient: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  /** The existing "verified host" flag (HostCard.tsx) — a different
   *  concept from `isVerifiedClient`, kept distinct on purpose. */
  hostVerified: boolean;
  isSuperhost: boolean;
  rating: number;
  trips: number;
  responseTime: string | null;
  responseRate: number | null;
  joined: string | null;
  followersCount: number;
  followingCount: number;
  followedByMe: boolean;
}

interface SignalProfileJson {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  username: string | null;
  is_host: boolean;
  is_verified_client: boolean;
  is_owner: boolean;
  is_admin: boolean;
  verified: boolean;
  is_superhost: boolean;
  rating: number;
  trips: number;
  response_time: string | null;
  response_rate: number | null;
  joined: string | null;
  followers_count: number;
  following_count: number;
  followed_by_me: boolean;
}

export async function fetchSignalProfile(userId: string): Promise<SignalProfile | null> {
  const { data, error } = await supabase.rpc('fetch_signal_profile', { p_user_id: userId });
  if (error) {
    if (error.message.includes('not found')) return null;
    throw error;
  }
  const row = data as SignalProfileJson;
  return {
    id: row.id,
    fullName: row.full_name ?? 'CX Rent user',
    avatarUrl: row.avatar_url,
    bio: row.bio,
    username: row.username,
    isHost: row.is_host,
    isVerifiedClient: row.is_verified_client,
    isOwner: row.is_owner,
    isAdmin: row.is_admin,
    hostVerified: row.verified,
    isSuperhost: row.is_superhost,
    rating: row.rating,
    trips: row.trips,
    responseTime: row.response_time,
    responseRate: row.response_rate,
    joined: row.joined,
    followersCount: row.followers_count,
    followingCount: row.following_count,
    followedByMe: row.followed_by_me,
  };
}

/** Toggles the caller following `userId` — returns the new state (true =
 *  now following). Real server-side enforcement lives in the RPC itself
 *  (no self-follow, target must exist); this is a thin wrapper only. */
export async function toggleProfileFollow(userId: string): Promise<{ following: boolean | null; error: string | null }> {
  const { data, error } = await supabase.rpc('toggle_profile_follow', { p_followee_id: userId });
  if (error) return { following: null, error: error.message };
  return { following: data as boolean, error: null };
}

export interface FollowListUser {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  isHost: boolean;
  isVerifiedClient: boolean;
}

interface FollowListUserJson {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_host: boolean;
  is_verified_client: boolean;
}

function mapFollowListUser(row: FollowListUserJson): FollowListUser {
  return {
    id: row.id,
    fullName: row.full_name ?? 'CX Rent user',
    avatarUrl: row.avatar_url,
    isHost: row.is_host,
    isVerifiedClient: row.is_verified_client,
  };
}

/** Same direct-table-select + FK-embed pattern `fetchEmpirePostComments`
 *  already uses for its own author join — `profile_follows` already
 *  grants read to any signed-in user (0052's own RLS policy), no new RPC
 *  needed just to list rows off it. */
export async function fetchProfileFollowers(userId: string): Promise<FollowListUser[]> {
  const { data, error } = await supabase
    .from('profile_follows')
    .select('follower:profiles!profile_follows_follower_id_fkey(id, full_name, avatar_url, is_host, is_verified_client)')
    .eq('followee_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as { follower: FollowListUserJson }[]).map((row) => mapFollowListUser(row.follower));
}

export async function fetchProfileFollowing(userId: string): Promise<FollowListUser[]> {
  const { data, error } = await supabase
    .from('profile_follows')
    .select('followee:profiles!profile_follows_followee_id_fkey(id, full_name, avatar_url, is_host, is_verified_client)')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as { followee: FollowListUserJson }[]).map((row) => mapFollowListUser(row.followee));
}

/** Uploads a new photo to the exact same `avatars` bucket/path convention
 *  Settings.tsx's own `handleAvatarChange` already uses — this is not a
 *  second avatar system, it's the same one, just reachable from inside
 *  Signal's own profile. Returns the new public URL to pass to
 *  `updateSignalProfile`. */
export async function uploadSignalAvatar(userId: string, file: File): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { cacheControl: '3600', upsert: false });
  if (uploadError) return { url: null, error: uploadError.message };
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  return { url: pub.publicUrl, error: null };
}

/** Updates the real `profiles` row directly — the exact same table
 *  Settings.tsx's own personal-info form and avatar upload already
 *  write to (no RPC exists for this today; Settings.tsx doesn't use one
 *  either). A photo or bio changed here is the SAME photo/bio shown on
 *  the main CX Rent profile, Messages, Bookings, everywhere — there is
 *  only ever one `profiles` row per user. RLS already lets a user update
 *  their own row (Settings.tsx relies on the same policy). */
export async function updateSignalProfile(userId: string, updates: { bio?: string; avatarUrl?: string }): Promise<{ error: string | null }> {
  const payload: Record<string, string> = {};
  if (updates.bio !== undefined) payload.bio = updates.bio;
  if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;
  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  return { error: error?.message ?? null };
}

/** A quick, live-typing check — the RPC never throws (catches its own
 *  validation internally and just returns false), so this is safe to
 *  call on every keystroke without try/catch at the call site. The real
 *  authority is still `setSignalUsername`'s own atomic claim — this is
 *  purely a fast UX hint, per the brief's own "frontend is not the only
 *  protection" rule. */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_signal_username_available', { p_username: username });
  if (error) return false;
  return Boolean(data);
}

/** The actual claim — atomic via the database's own unique index (see
 *  0059's own comment on the RPC), not a check-then-write race. Returns
 *  the normalized username actually stored, or a friendly error message
 *  (reserved / invalid format / already taken) straight from the RPC's
 *  own validation. */
export async function setSignalUsername(username: string): Promise<{ username: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('set_signal_username', { p_username: username });
  if (error) return { username: null, error: error.message };
  return { username: data as string, error: null };
}

export interface SignalPeopleResult {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  username: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  isHost: boolean;
  isVerifiedClient: boolean;
  followedByMe: boolean;
}

interface SignalPeopleResultRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  username: string | null;
  is_owner: boolean;
  is_admin: boolean;
  is_host: boolean;
  is_verified_client: boolean;
  followed_by_me: boolean;
}

/** Ranked people search — exact username, username starts-with, name
 *  starts-with, username contains, name contains, in that order (see
 *  search_signal_people's own comment). `@` is optional search syntax,
 *  stripped server-side. Empty query returns no rows (no "browse
 *  everyone" behavior). */
export async function searchSignalPeople(query: string, limit = 20): Promise<SignalPeopleResult[]> {
  const { data, error } = await supabase.rpc('search_signal_people', { p_query: query, p_limit: limit });
  if (error) throw error;
  return (data as SignalPeopleResultRow[]).map((row) => ({
    id: row.id,
    fullName: row.full_name ?? 'CX Rent user',
    avatarUrl: row.avatar_url,
    username: row.username,
    isOwner: row.is_owner,
    isAdmin: row.is_admin,
    isHost: row.is_host,
    isVerifiedClient: row.is_verified_client,
    followedByMe: row.followed_by_me,
  }));
}
