import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_lib/cors.js';
import { sendBookingRefundedEmail } from './_lib/email.js';
import { sendPushToUser } from './_lib/push.js';

/**
 * Owner/Admin-only: issues a real Stripe refund for a booking's rental
 * charge and marks it 'refunded' — distinct from a plain cancellation
 * (see api/cancel-booking.ts), which never moves money. Renters don't get
 * a self-service refund button; refund eligibility/amount policy isn't
 * something this schema encodes (fare-tier only governs whether a
 * cancellation is *possible*, not whether it's refundable), so this stays
 * a deliberate, reviewable action taken by someone with platform
 * authority rather than an automatic consequence of cancelling.
 *
 * Also releases the security deposit hold (if still held/uncaptured) —
 * refunding the rental charge but leaving a deposit hold in place would
 * be a confusing, indefensible state for a renter to be in.
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
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !process.env.STRIPE_SECRET_KEY) {
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

  const { data: profile } = await callerClient.from('profiles').select('is_admin, is_owner').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin && !profile?.is_owner) {
    return res.status(403).json({ error: 'Owner or admin access required.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, reference, status, total_price, stripe_payment_intent_id, stripe_deposit_intent_id, deposit_status, start_date, end_date, pickup_location, renter_id, host_id, car_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (fetchError || !booking) return res.status(404).json({ error: 'Booking not found.' });
  if (booking.status === 'refunded') return res.status(409).json({ error: 'This booking was already refunded.' });
  if (!booking.stripe_payment_intent_id) return res.status(400).json({ error: 'This booking has no real charge to refund.' });

  try {
    const refund = await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id });

    // Best-effort: an uncaptured deposit hold should be released too, but
    // a failure here must not block the refund that already succeeded —
    // it's just left for the daily deposit-release sweep to catch instead.
    if (booking.deposit_status === 'held' && booking.stripe_deposit_intent_id) {
      try {
        await stripe.paymentIntents.cancel(booking.stripe_deposit_intent_id);
      } catch (err) {
        console.error('[refund-booking] deposit release failed for', bookingId, err);
      }
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        stripe_refund_id: refund.id,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: 'refunded',
        deposit_status: booking.deposit_status === 'held' ? 'released' : booking.deposit_status,
      })
      .eq('id', bookingId);
    if (updateError) {
      // The refund is real money already moved — surfacing this clearly
      // rather than pretending the whole operation failed.
      console.error('[refund-booking] refund succeeded but status update failed for', bookingId, updateError);
      return res.status(500).json({ error: `Refund issued (${refund.id}) but the booking record could not be updated: ${updateError.message}` });
    }

    try {
      const [{ data: car }, { data: renterAuth }] = await Promise.all([
        supabase.from('cars').select('make, model, year').eq('id', booking.car_id).single(),
        supabase.auth.admin.getUserById(booking.renter_id),
      ]);
      const carLabel = car ? `${car.year} ${car.make} ${car.model}` : 'your car';
      const tripBase = {
        reference: booking.reference,
        carLabel,
        startDate: booking.start_date,
        endDate: booking.end_date,
        pickupLocation: booking.pickup_location || '',
        totalPrice: Number(booking.total_price),
      };
      if (renterAuth?.user?.email) await sendBookingRefundedEmail(renterAuth.user.email, tripBase);
      await sendPushToUser(supabase, booking.renter_id, {
        title: 'Refund issued',
        body: `You've been refunded for your ${carLabel} booking (${booking.reference}).`,
        data: { url: '/dashboard#trips' },
      });
    } catch (err) {
      console.error('[refund-booking] notification failed for', bookingId, err);
    }

    return res.status(200).json({ ok: true, refundId: refund.id });
  } catch (err) {
    console.error('[refund-booking] Stripe refund failed for', bookingId, err);
    const message = err instanceof Stripe.errors.StripeError ? err.message : 'Could not issue this refund.';
    return res.status(502).json({ error: message });
  }
}
