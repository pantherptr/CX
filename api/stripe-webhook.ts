import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendBookingConfirmedEmail, sendNewBookingHostEmail } from './_lib/email.js';
import { sendPushToUser } from './_lib/push.js';

/**
 * The refundable security deposit — see
 * supabase/migrations/0019_security_deposit.sql for the policy and the
 * reasoning behind placing this hold *after* the booking exists rather
 * than in parallel with the rental charge. Placed here, right after the
 * booking insert, using the payment method and customer the rental
 * PaymentIntent just saved (setup_future_usage, set in
 * api/create-payment-intent.ts) — so the renter is never asked for their
 * card twice.
 */
async function placeDepositHold(
  supabase: SupabaseClient,
  stripe: Stripe,
  bookingId: string,
  rentalIntent: Stripe.PaymentIntent,
  depositAmountCents: number,
) {
  if (depositAmountCents <= 0) return; // deposit_status stays its 'not_required' default

  const customerId = typeof rentalIntent.customer === 'string' ? rentalIntent.customer : rentalIntent.customer?.id;
  const paymentMethodId =
    typeof rentalIntent.payment_method === 'string' ? rentalIntent.payment_method : rentalIntent.payment_method?.id;

  if (!customerId || !paymentMethodId) {
    console.error('[stripe-webhook] no saved payment method to hold a deposit against for booking', bookingId);
    await supabase.from('bookings').update({ deposit_status: 'failed' }).eq('id', bookingId);
    return;
  }

  try {
    const depositIntent = await stripe.paymentIntents.create({
      amount: depositAmountCents,
      currency: rentalIntent.currency,
      customer: customerId,
      payment_method: paymentMethodId,
      capture_method: 'manual',
      off_session: true,
      confirm: true,
      metadata: { bookingId, kind: 'deposit' },
    });
    await supabase
      .from('bookings')
      .update({
        stripe_deposit_intent_id: depositIntent.id,
        deposit_status: depositIntent.status === 'requires_capture' ? 'held' : 'failed',
      })
      .eq('id', bookingId);
  } catch (err) {
    // Common causes: the card doesn't support off-session holds, or
    // there's not enough available credit. The rental charge already
    // succeeded either way — this only means the deposit itself needs
    // manual follow-up (visible as deposit_status='failed' in the admin
    // dashboard), never that the booking should be undone.
    console.error('[stripe-webhook] deposit hold failed for booking', bookingId, err);
    await supabase.from('bookings').update({ deposit_status: 'failed' }).eq('id', bookingId);
  }
}

/**
 * The other half of the real-payments flow (see
 * api/create-payment-intent.ts). Stripe calls this once a PaymentIntent
 * created there actually succeeds — that's the moment, and the only
 * moment, a booking gets written to the database. Nothing inserts into
 * `bookings` for a real trip except this handler, so a card that never
 * gets charged never blocks a car's calendar for another renter.
 *
 * Configure this URL as a webhook endpoint in the Stripe dashboard (or
 * via `stripe listen --forward-to localhost:3000/api/stripe-webhook` for
 * local testing with `vercel dev`), subscribed at least to
 * payment_intent.succeeded, and put the resulting signing secret in
 * STRIPE_WEBHOOK_SECRET.
 */

// Stripe's signature check needs the exact raw bytes Stripe sent — if
// Vercel parses the body into JSON first, re-serializing it would almost
// certainly not byte-match anymore and every signature check would fail.
export const config = {
  api: { bodyParser: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method not allowed');
  }

  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!signature || typeof signature !== 'string' || !webhookSecret) {
    console.error('[stripe-webhook] missing signature header or STRIPE_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Webhook is not configured.' });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[stripe-webhook] missing Supabase service role configuration');
    return res.status(500).json({ error: 'Webhook is not configured.' });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed', err);
    return res.status(400).json({ error: 'Invalid signature.' });
  }

  // Trusted, RLS-bypassing client — service role, server-side only, never
  // shipped to the browser.
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // The hold created in api/create-payment-intent.ts occupies the
  // renter's dates the instant they reach Payment. If the charge never
  // completes, that hold must not sit there blocking the car forever —
  // release it back to 'cancelled' the moment Stripe tells us the attempt
  // is over, rather than waiting out the full hold TTL.
  if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const bookingId = (pi.metadata as Record<string, string>).bookingId;
    if (bookingId) {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: 'payment_failed' })
        .eq('id', bookingId)
        .in('status', ['pending', 'payment_processing']);
      if (error) console.error('[stripe-webhook] failed to release hold for', bookingId, error);
    }
    return res.status(200).json({ received: true });
  }

  // Fires for payment methods with a genuine async settlement window
  // (Bancontact, some bank redirects) — cards go succeeded/failed
  // directly and rarely pass through this. Purely a status label update;
  // the hold already occupies the dates regardless.
  if (event.type === 'payment_intent.processing') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const bookingId = (pi.metadata as Record<string, string>).bookingId;
    if (bookingId) {
      const { error } = await supabase.from('bookings').update({ status: 'payment_processing' }).eq('id', bookingId).eq('status', 'pending');
      if (error) console.error('[stripe-webhook] failed to mark processing for', bookingId, error);
    }
    return res.status(200).json({ received: true });
  }

  if (event.type !== 'payment_intent.succeeded') {
    // Anything else never had a booking created/held for it — nothing to
    // reconcile.
    return res.status(200).json({ received: true });
  }

  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const meta = paymentIntent.metadata as Record<string, string>;

  if (!meta.carId || !meta.renterId || !meta.startDate || !meta.endDate) {
    console.error('[stripe-webhook] payment_intent.succeeded with incomplete metadata', paymentIntent.id);
    return res.status(400).json({ error: 'Incomplete booking metadata on this payment.' });
  }

  const extraIds = meta.extraIds ? meta.extraIds.split(',').filter(Boolean) : [];
  type ConfirmedBooking = {
    id: string;
    host_id: string;
    reference: string;
    total_price: number;
    start_date: string;
    end_date: string;
    pickup_location: string | null;
    fulfillment_type: 'pickup' | 'delivery';
    delivery_address: string | null;
    delivery_fee: number;
  };

  const attachExtras = async (bookingId: string) => {
    if (extraIds.length === 0) return;
    const { error: extrasError } = await supabase
      .from('booking_extras')
      .insert(extraIds.map((extraId) => ({ booking_id: bookingId, extra_id: extraId })));
    if (extrasError) {
      // The booking (and the charge) is real either way — logged for
      // follow-up rather than failing the whole webhook over an extra.
      console.error('[stripe-webhook] extras insert failed for booking', bookingId, extrasError);
    }
  };

  // Everything below touches the database/Stripe on the strength of a
  // real, already-succeeded charge — wrapped so an unexpected throw comes
  // back as a diagnosable JSON error (and a 500 Stripe will retry)
  // instead of an opaque platform-level crash.
  try {
    let booking: ConfirmedBooking | null = null;

    // The normal path: confirm the hold api/create-payment-intent.ts
    // already inserted, turning it from 'pending'/'payment_processing'
    // into 'confirmed'. Reward validation + consumption happens inside
    // this function, not before, so an abandoned hold never burns a
    // reward for nothing.
    if (meta.bookingId) {
      const { data: confirmedId, error: confirmError } = await supabase.rpc('confirm_booking_hold', {
        p_booking_id: meta.bookingId,
        p_reward_id: meta.rewardId || null,
        p_stripe_payment_intent_id: paymentIntent.id,
      });
      if (confirmError) {
        console.error('[stripe-webhook] confirm_booking_hold failed for', paymentIntent.id, confirmError);
      } else if (confirmedId) {
        const { data: row, error: fetchError } = await supabase
          .from('bookings')
          .select('id, host_id, reference, total_price, start_date, end_date, pickup_location, fulfillment_type, delivery_address, delivery_fee')
          .eq('id', confirmedId)
          .single();
        if (fetchError) console.error('[stripe-webhook] could not re-fetch confirmed booking', confirmedId, fetchError);
        else {
          booking = row;
          await attachExtras(booking.id);
        }
      }
    }

    // Fallback — no confirmable hold existed (the hold expired despite
    // this charge succeeding, or this payment predates the reservation
    // system). Insert a fresh booking exactly the way every booking was
    // created before hold-based reservations existed, so a successful
    // charge is never silently lost. The exclusion constraint and the
    // stripe_payment_intent_id unique index still protect this path.
    if (!booking) {
      const { data: inserted, error: insertError } = await supabase
        .from('bookings')
        .insert({
          car_id: meta.carId,
          renter_id: meta.renterId,
          start_date: meta.startDate,
          end_date: meta.endDate,
          pickup_location: meta.pickupLocation || null,
          protection_addon: true,
          fare_tier: meta.fareTier || 'standard',
          fulfillment_type: meta.fulfillmentType || 'pickup',
          delivery_address: meta.fulfillmentType === 'delivery' ? meta.deliveryAddress || null : null,
          reward_id: meta.rewardId || null,
          status: 'confirmed',
          stripe_payment_intent_id: paymentIntent.id,
        })
        .select('id, host_id, reference, total_price, start_date, end_date, pickup_location, fulfillment_type, delivery_address, delivery_fee')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          // Another delivery of this same event already created the booking.
          return res.status(200).json({ received: true, alreadyProcessed: true });
        }
        // The card has already been charged at this point — this must not be
        // swallowed. Returning 500 makes Stripe retry the webhook; the
        // payment_intent id is also visible in the Stripe dashboard for
        // manual reconciliation if retries don't resolve it.
        console.error('[stripe-webhook] booking insert failed for', paymentIntent.id, insertError);
        return res.status(500).json({ error: insertError.message });
      }
      booking = inserted;
      await attachExtras(booking.id);
    }

    if (!booking) {
      console.error('[stripe-webhook] no booking record after confirm/insert for', paymentIntent.id);
      return res.status(500).json({ error: 'Could not finalize this booking.' });
    }

    const depositAmountCents = Number(meta.depositAmountCents || '0');
    await placeDepositHold(supabase, stripe, booking.id, paymentIntent, depositAmountCents);

    // Confirmation emails — fire-and-forget from the webhook's point of
    // view. Any failure here (a lookup, Resend being down, a missing key)
    // is logged and swallowed: the booking is real and paid for regardless,
    // and Stripe must not be told to retry a payment that already
    // succeeded just because an email didn't send.
    try {
      const [{ data: car }, { data: renterAuth }, { data: hostAuth }, { data: hostProfile }] = await Promise.all([
        supabase.from('cars').select('make, model, year').eq('id', meta.carId).single(),
        supabase.auth.admin.getUserById(meta.renterId),
        supabase.auth.admin.getUserById(booking.host_id),
        supabase.from('profiles').select('full_name').eq('id', booking.host_id).single(),
      ]);
      const { data: renterProfile } = await supabase.from('profiles').select('full_name').eq('id', meta.renterId).single();

      const carLabel = car ? `${car.year} ${car.make} ${car.model}` : 'your car';
      const tripBase = {
        reference: booking.reference,
        carLabel,
        startDate: booking.start_date,
        endDate: booking.end_date,
        pickupLocation: booking.pickup_location || '',
        totalPrice: Number(booking.total_price),
        fulfillmentType: booking.fulfillment_type,
        deliveryAddress: booking.delivery_address || '',
      };

      const renterEmail = renterAuth?.user?.email;
      const hostEmail = hostAuth?.user?.email;

      await Promise.all([
        renterEmail
          ? sendBookingConfirmedEmail(renterEmail, { ...tripBase, otherPartyName: hostProfile?.full_name || 'your host' })
          : Promise.resolve(),
        hostEmail
          ? sendNewBookingHostEmail(hostEmail, { ...tripBase, otherPartyName: renterProfile?.full_name || 'A renter' })
          : Promise.resolve(),
        sendPushToUser(supabase, meta.renterId, {
          title: 'Booking confirmed',
          body: `Your ${carLabel} is booked for ${tripBase.startDate}.`,
          data: { url: '/dashboard#trips' },
        }),
        sendPushToUser(supabase, booking.host_id, {
          title: 'New booking',
          body: `${renterProfile?.full_name || 'A renter'} booked your ${carLabel}.`,
          data: { url: '/host#bookings' },
        }),
      ]);
    } catch (err) {
      console.error('[stripe-webhook] confirmation emails/push failed for booking', booking.id, err);
    }

    return res.status(200).json({ received: true, bookingId: booking.id });
  } catch (err) {
    console.error('[stripe-webhook] unexpected failure processing', paymentIntent.id, err);
    const message = err instanceof Error ? err.message : 'Unexpected error processing this payment.';
    return res.status(500).json({ error: message });
  }
}
