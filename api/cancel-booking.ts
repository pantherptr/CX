import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { refundFor, isPolicy } from './_lib/cancellationPolicy.js';
import { applyCors } from './_lib/cors.js';
import { sendBookingCancelledEmail } from './_lib/email.js';
import { sendPushToUser } from './_lib/push.js';

/**
 * Server-side cancellation with an automatic, policy-based refund.
 *
 * The host's cancellation policy (snapshotted on the booking at booking
 * time — see migration 0066) decides how much of a paid trip goes back to
 * the renter's card: see api/_lib/cancellationPolicy.ts for the exact
 * rules. A cancellation started by the host or by CX always refunds 100%.
 * Everything lives here, not in the browser, because it moves real money
 * and must not be bypassable.
 *
 * Order matters: the Stripe refund is created first, with an idempotency
 * key, so a retry can never refund twice; only then is the booking marked
 * cancelled. If the refund fails, the booking stays as it was.
 *
 * A 'pending'/'payment_processing' hold has not been charged, so there is
 * nothing to refund — cancelling one just releases the dates.
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

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
    .select('id, renter_id, host_id, status, fare_tier, start_date, total_price, cancellation_policy, stripe_payment_intent_id, stripe_deposit_intent_id, deposit_status')
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

  const initiatedBy = isAdmin ? 'admin' : isHost && !isRenter ? 'host' : 'renter';
  const policy = isPolicy(booking.cancellation_policy) ? booking.cancellation_policy : 'flexible';

  // A trip that has already started can no longer be cancelled by the
  // renter — same as before. (Host/CX cancellations are unaffected.)
  const startsInHours = (new Date(`${booking.start_date}T00:00:00`).getTime() - Date.now()) / 3_600_000;
  if (initiatedBy === 'renter' && booking.status === 'confirmed' && startsInHours < 0) {
    return res.status(400).json({ error: 'This trip has already started and can no longer be cancelled here. Please contact support.' });
  }

  // Only a confirmed trip with a real charge has anything to refund.
  const paid = booking.status === 'confirmed' && Boolean(booking.stripe_payment_intent_id);
  const refund = paid
    ? refundFor(policy, booking.start_date, Number(booking.total_price), {
        initiatedBy,
        // Older "Stay flexible" fares were sold as free cancellation any time before pick-up.
        anytime: booking.fare_tier === 'flexible',
      })
    : { percent: 0, amount: 0, hoursUntilStart: startsInHours };

  const reason = isAdmin ? 'admin_cancelled' : initiatedBy === 'renter' ? 'renter_cancelled' : 'host_cancelled';

  // Service-role from here — the authorization decision above is already
  // made; this just performs it and looks up who to notify.
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let stripeRefundId: string | null = null;
  if (refund.amount > 0) {
    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Refunds are not configured on this server yet.' });
    try {
      const r = await stripe.refunds.create(
        { payment_intent: booking.stripe_payment_intent_id as string, amount: Math.round(refund.amount * 100) },
        { idempotencyKey: `cancel-refund-${bookingId}` },
      );
      stripeRefundId = r.id;
    } catch (err) {
      console.error('[cancel-booking] Stripe refund failed for', bookingId, err);
      const message = err instanceof Stripe.errors.StripeError ? err.message : 'Could not issue the refund.';
      return res.status(502).json({ error: `We could not process your refund, so the booking was not cancelled. ${message}` });
    }
  }

  // Release an uncaptured security deposit hold — never charged on a cancellation.
  let depositStatus = booking.deposit_status;
  if (booking.deposit_status === 'held' && booking.stripe_deposit_intent_id) {
    try {
      await stripe.paymentIntents.cancel(booking.stripe_deposit_intent_id);
      depositStatus = 'released';
    } catch (err) {
      console.error('[cancel-booking] deposit release failed for', bookingId, err);
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      refund_amount: refund.amount,
      refunded_at: refund.amount > 0 ? new Date().toISOString() : null,
      stripe_refund_id: stripeRefundId,
      deposit_status: depositStatus,
    })
    .eq('id', bookingId)
    .in('status', ['pending', 'payment_processing', 'confirmed'])
    .select('id, reference, start_date, end_date, pickup_location, total_price, renter_id, host_id, car_id')
    .maybeSingle();

  if (updateError) {
    if (stripeRefundId) console.error('[cancel-booking] refund', stripeRefundId, 'issued but booking update failed for', bookingId, updateError);
    return res.status(500).json({ error: updateError.message });
  }
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

  return res.status(200).json({ ok: true, refundAmount: refund.amount, refundPercent: refund.percent });
}
