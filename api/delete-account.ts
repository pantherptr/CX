import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_lib/cors';

/**
 * Real account deletion — required by Apple's App Store guidelines
 * (5.1.1(v)) for any app that lets a user create an account. Called from
 * the "Delete Account" flow in Settings.tsx.
 *
 * Two-step trust model, same shape as api/create-payment-intent.ts:
 *   1. Resolve *who's actually calling* from their own bearer token (an
 *      anon-key client scoped to their JWT) — never trust a client-
 *      supplied user id.
 *   2. Use the service-role key, server-side only, to perform the actual
 *      privileged deletion — this key is never sent to or reachable from
 *      the app bundle.
 *
 * `profiles.id references auth.users(id) on delete cascade` (migration
 * 0001), and every other table cascades from `profiles` — so deleting
 * the auth.users row genuinely removes the person's bookings, messages,
 * favorites, reviews, verification documents, everything, in one real
 * operation. There is no "soft delete" flag anywhere in this schema to
 * fall back to; this is the real thing.
 *
 * The one safety check before deleting: an upcoming or active booking,
 * as either renter or host, blocks deletion. Cascading through someone
 * else's confirmed trip (the other party in a booking) the instant one
 * side deletes their account would be a real, silent harm to that other
 * person — Apple's requirement is that the user CAN delete their
 * account, not that this endpoint is obligated to do it instantly no
 * matter what it would break for someone else.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sign in to manage your account.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(500).json({ error: 'Account deletion is not configured on this server yet.' });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();
  if (userError || !user) {
    return res.status(401).json({ error: 'Your session has expired — please sign in again.' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: blockingBookings, error: bookingsError } = await callerClient
    .from('bookings')
    .select('id, reference, end_date, status')
    .or(`renter_id.eq.${user.id},host_id.eq.${user.id}`)
    .neq('status', 'cancelled')
    .gte('end_date', today);

  if (bookingsError) {
    return res.status(500).json({ error: "Couldn't verify your bookings — please try again." });
  }
  if (blockingBookings && blockingBookings.length > 0) {
    return res.status(409).json({
      error: `You have ${blockingBookings.length} upcoming or active ${blockingBookings.length === 1 ? 'trip' : 'trips'} — please complete or cancel ${blockingBookings.length === 1 ? 'it' : 'them'} before deleting your account.`,
      bookingReferences: blockingBookings.map((b: { reference: string }) => b.reference),
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return res.status(500).json({ error: "Couldn't delete your account — please try again or contact support." });
  }

  return res.status(200).json({ success: true });
}
