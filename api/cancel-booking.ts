import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_lib/cors.js';
import { sendBookingCancelledEmail } from './_lib/email.js';
import { sendPushToUser } from './_lib/push.js';

/**
 * Server-side cancellation — replaces the old direct `bookings.update()`
 * from the browser (src/lib/data/bookings.ts's old `cancelBooking`) so two
 * things that only make sense enforced centrally actually are:
 *
 *  1. The standard-fare 24h cancellation window. It previously existed
 *     only as a disabled button in TripDetails.tsx — trivially bypassable
 *     by calling the Supabase update directly, since the RLS policy that
 *     lets a renter update their own booking has no concept of "but not
 *     this field, not this close to pick-up". A renter cancelling their
 *     own confirmed trip now has that window checked here; hosts/admins
 *     cancelling (a different, existing capability) are unaffected — that
 *     was never fare-tier-gated before, and isn't invented here either.
 *
 *  2. A cancellation notification. Nothing fired one before because
 *     nothing server-side ever ran on cancellation.
 *
 * A 'pending'/'payment_processing' hold can also be released through
 * here (the same endpoint every "give up these dates" action goes
 * through), though the common case for that is release_payment_hold()
 * directly from the client via RLS (see src/lib/data/bookings.ts) — this
 * path exists so an admin/owner can also clear a stuck hold if needed.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sign in required.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(500).json({ error: 'Not configured on this server yet.' });
  }

  const { bookingId } = (req.body ?? {}) as { bookingId?: string };
  if (!bookingId) return res.status(400).json({ error: 'Missing bookingId.' });

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

  // Read via the caller's own RLS-scoped client — a renter/host who
  // shouldn't see this row at all gets a plain 404, not a permission leak.
  const { data: booking, error: fetchError } = await callerClient
    .from('bookings')
    .select('id, renter_id, host_id, status, fare_tier, start_date')
    .eq('id', bookingId)
    .maybeSingle();
  if (fetchError || !booking) return res.status(404).json({ error: 'Booking not found.' });

  const { data: profile } = await callerClient.from('profiles').select('is_admin, is_owner').eq('id', user.id).maybeSingle();
  const isAdmin = Boolean(profile?.is_admin || profile?.is_owner);
  const isRenter = booking.renter_id === user.id;
  const isHost = booking.host_id === user.id;
  if (!isAdmin && !isRenter && !isHost) {
    return res.status(403).json({ error: 'You cannot cancel this booking.' });
  }

  if (!['pending', 'payment_processing', 'confirmed'].includes(booking.status)) {
    return res.status(400).json({ error: 'This booking can no longer be cancelled.' });
  }

  // Only a renter's own voluntary cancellation is fare-tier-gated —
  // matches TripDetails.tsx's existing `canCancel` intent, just enforced
  // where it can't be bypassed. Parsed as local midnight (not UTC), so
  // the boundary lands on the right side of midnight regardless of the
  // server's or renter's timezone.
  if (isRenter && !isAdmin && !isHost && booking.fare_tier !== 'flexible') {
    const hoursUntilStart = (new Date(`${booking.start_date}T00:00:00`).getTime() - Date.now()) / 3_600_000;
    if (hoursUntilStart < 24) {
      return res.status(400).json({ error: 'This booking is within its non-refundable cancellation window and can no longer be cancelled.' });
    }
  }

  const reason = isAdmin ? 'admin_cancelled' : isRenter ? 'renter_cancelled' : 'host_cancelled';

  // Service-role from here — the authorization decision above is already
  // made; this just performs it and looks up who to notify.
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: reason })
    .eq('id', bookingId)
    .in('status', ['pending', 'payment_processing', 'confirmed'])
    .select('id, reference, start_date, end_date, pickup_location, total_price, renter_id, host_id, car_id')
    .maybeSingle();

  if (updateError) return res.status(500).json({ error: updateError.message });
  if (!updated) return res.status(409).json({ error: 'This booking was already cancelled.' });

  // Notify the other party — fire-and-forget, a notification failure must
  // never surface as a failed cancellation.
  try {
    const [{ data: car }, { data: renterAuth }, { data: hostAuth }, { data: renterProfile }, { data: hostProfile }] = await Promise.all([
      supabase.from('cars').select('make, model, year').eq('id', updated.car_id).single(),
      supabase.auth.admin.getUserById(updated.renter_id),
      supabase.auth.admin.getUserById(updated.host_id),
      supabase.from('profiles').select('full_name').eq('id', updated.renter_id).single(),
      supabase.from('profiles').select('full_name').eq('id', updated.host_id).single(),
    ]);
    const carLabel = car ? `${car.year} ${car.make} ${car.model}` : 'the car';
    const tripBase = {
      reference: updated.reference,
      carLabel,
      startDate: updated.start_date,
      endDate: updated.end_date,
      pickupLocation: updated.pickup_location || '',
      totalPrice: Number(updated.total_price),
    };

    // Whoever didn't initiate the cancellation is who gets told.
    const notifyRenter = !isRenter;
    const notifyHost = !isHost;

    await Promise.all([
      notifyRenter && renterAuth?.user?.email
        ? sendBookingCancelledEmail(renterAuth.user.email, { ...tripBase, otherPartyName: hostProfile?.full_name || 'Your host' })
        : Promise.resolve(),
      notifyHost && hostAuth?.user?.email
        ? sendBookingCancelledEmail(hostAuth.user.email, { ...tripBase, otherPartyName: renterProfile?.full_name || 'The renter' })
        : Promise.resolve(),
      notifyRenter
        ? sendPushToUser(supabase, updated.renter_id, {
            title: 'Booking cancelled',
            body: `Your ${carLabel} booking (${updated.reference}) was cancelled.`,
            data: { url: '/dashboard#trips' },
          })
        : Promise.resolve(),
      notifyHost
        ? sendPushToUser(supabase, updated.host_id, {
            title: 'Booking cancelled',
            body: `The ${carLabel} booking (${updated.reference}) was cancelled.`,
            data: { url: '/host#bookings' },
          })
        : Promise.resolve(),
    ]);
  } catch (err) {
    console.error('[cancel-booking] notification failed for', bookingId, err);
  }

  return res.status(200).json({ ok: true });
}
