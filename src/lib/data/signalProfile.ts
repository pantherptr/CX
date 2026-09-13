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
