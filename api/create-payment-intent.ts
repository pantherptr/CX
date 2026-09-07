import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_lib/cors.js';

/**
 * Starts a real payment for a trip.
 *
 * Called from the "Payment" step of the booking flow (see
 * src/lib/data/payments.ts / src/pages/Booking.tsx) once the renter has
 * chosen dates, extras and a fare tier but before any booking row exists.
 *
 * The amount charged is never taken from the request body — it comes
 * from quote_booking() (see supabase/migrations/0015_stripe_payments.sql,
 * extended by 0019_security_deposit.sql), a Postgres function that
 * recomputes the price the same way prepare_booking() does when a
 * booking is actually inserted, run with the *caller's own* auth so a
 * renter can only quote (and later pay) trips as themselves. The booking
 * row itself is created afterwards, by api/stripe-webhook.ts, only once
 * Stripe confirms the charge went through — this endpoint never touches
 * the bookings table.
 *
 * setup_future_usage: 'off_session' below is what lets the webhook place
 * a security deposit hold moments later without asking the renter to
 * enter their card a second time — it tells Stripe to save the payment
 * method against a Customer so it can be charged (or, here, authorized)
 * again without the renter present. The Customer is created once per
 * renter and cached on profiles.stripe_customer_id.
 *
 * Reservation: a 'pending' hold row IS inserted here, before Stripe is
 * ever contacted — see supabase/migrations/0026_booking_reservations.sql.
 * That insert goes through the same `bookings_no_overlap` exclusion
 * constraint every other booking does, so two renters racing for the same
 * dates get resolved right here, atomically, before either one's card is
 * charged — not after, with no way to undo the loser's charge. The
 * webhook (api/stripe-webhook.ts) confirms this same row on success
 * rather than inserting a fresh one.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

interface CreatePaymentIntentBody {
  carId?: string;
  startDate?: string;
  endDate?: string;
  pickupLocation?: string;
  fareTier?: 'standard' | 'flexible';
  extraIds?: string[];
  rewardId?: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sign in to book a car.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Payments are not configured on this server yet.' });
  }

  const body = (req.body ?? {}) as CreatePaymentIntentBody;
  const { carId, startDate, endDate, pickupLocation, fareTier, extraIds, rewardId } = body;
  if (!carId || !startDate || !endDate || !pickupLocation) {
    return res.status(400).json({ error: 'Missing trip details.' });
  }

  // Scoped to the calling renter via their own JWT — auth.uid() inside
  // quote_booking() resolves from this, so the price (and any reward it
  // validates) can never be computed as someone else.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return res.status(401).json({ error: 'Your session has expired — please sign in again.' });
  }

  const { data: quote, error: quoteError } = await supabase
    .rpc('quote_booking', {
      p_car_id: carId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_fare_tier: fareTier ?? 'standard',
      p_extra_ids: extraIds && extraIds.length > 0 ? extraIds : [],
      p_reward_id: rewardId ?? null,
    })
    .single<{ total: number; currency: string; days: number; deposit: number }>();

  if (quoteError || !quote) {
    return res.status(400).json({ error: quoteError?.message ?? 'Could not price this trip.' });
  }

  const amount = Math.round(Number(quote.total) * 100);
  const depositAmountCents = Math.round(Number(quote.deposit) * 100);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'This trip could not be priced.' });
  }

  // The reservation itself — inserted as the renter (RLS: "Renters create
  // own bookings"), so this can only ever create a hold for the calling
  // user. reward_id/extras are deliberately NOT attached yet: reward
  // consumption happens in confirm_booking_hold() once the charge
  // actually succeeds, so an abandoned or expired hold never costs the
  // renter their reward; extras are attached by the webhook exactly as
  // before. prepare_booking still computes host_id/total_price/reference
  // for this row the same way it always has.
  const HOLD_TTL_MINUTES = 20;
  const { data: hold, error: holdError } = await supabase
    .from('bookings')
    .insert({
      car_id: carId,
      renter_id: user.id,
      start_date: startDate,
      end_date: endDate,
      pickup_location: pickupLocation,
      protection_addon: true,
      fare_tier: fareTier ?? 'standard',
      status: 'pending',
      hold_expires_at: new Date(Date.now() + HOLD_TTL_MINUTES * 60_000).toISOString(),
    })
    .select('id')
    .single();

  if (holdError || !hold) {
    if (holdError?.code === '23P01') {
      return res.status(409).json({ error: 'This car is unavailable for these dates.' });
    }
    return res.status(400).json({ error: holdError?.message ?? 'Could not reserve these dates.' });
  }
  const bookingId = hold.id as string;

  // Everything below this point calls Stripe — wrapped so a Stripe-side
  // rejection (bad key, account restriction, etc.) comes back as a
  // diagnosable JSON error instead of crashing the function outright
  // (Vercel would otherwise report a bare FUNCTION_INVOCATION_FAILED). Any
  // failure here also releases the hold just created above — a Stripe
  // outage must never leave a car's dates blocked for nothing.
  try {
    // One Stripe Customer per renter, reused across bookings — required
    // for setup_future_usage (a PaymentIntent can only save a payment
    // method against a Customer, not anonymously) and cheap to cache.
    const { data: profileRow } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle();
    let customerId = profileRow?.stripe_customer_id ?? undefined;

    const createFreshCustomer = async () => {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabaseUserId: user.id },
      });
      // Best-effort cache — if this write fails, the next payment just
      // creates (and this time successfully saves) another Customer
      // rather than breaking the current one.
      await supabase.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', user.id);
      return customer.id;
    };

    if (!customerId) {
      customerId = await createFreshCustomer();
    }

    const paymentIntentParams = {
      amount,
      currency: quote.currency || 'eur',
      setup_future_usage: 'off_session' as const,
      automatic_payment_methods: { enabled: true },
      // bookingId is what the webhook actually uses to confirm the hold
      // (see confirm_booking_hold in the 0026 migration). The rest of
      // these fields are kept as a fallback: if that hold has somehow
      // gone missing by the time the charge succeeds (expired despite a
      // real payment, or pre-migration data), the webhook falls back to
      // inserting a fresh booking exactly the way it did before this
      // migration, so a successful charge is never silently lost.
      metadata: {
        bookingId,
        carId,
        renterId: user.id,
        startDate,
        endDate,
        pickupLocation,
        fareTier: fareTier ?? 'standard',
        extraIds: (extraIds ?? []).join(','),
        rewardId: rewardId ?? '',
        depositAmountCents: String(depositAmountCents),
      },
    };

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({ ...paymentIntentParams, customer: customerId });
    } catch (err) {
      // A cached stripe_customer_id can point at a Customer that doesn't
      // exist in whatever Stripe account STRIPE_SECRET_KEY now belongs to
      // (e.g. the key was rotated to a different account/sandbox after
      // this renter's first booking) — self-heal by minting a fresh one
      // instead of leaving every future booking permanently broken for
      // them.
      const isMissingCustomer = err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing';
      if (!isMissingCustomer) throw err;
      customerId = await createFreshCustomer();
      paymentIntent = await stripe.paymentIntents.create({ ...paymentIntentParams, customer: customerId });
    }

    if (!paymentIntent.client_secret) {
      await supabase.rpc('release_payment_hold', { p_booking_id: bookingId });
      return res.status(500).json({ error: 'Could not start payment.' });
    }

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      amount: Number(quote.total),
      currency: quote.currency,
      deposit: Number(quote.deposit),
      bookingId,
    });
  } catch (err) {
    console.error('[create-payment-intent] Stripe call failed:', err);
    await supabase.rpc('release_payment_hold', { p_booking_id: bookingId });
    const message = err instanceof Stripe.errors.StripeError ? err.message : 'Could not start payment.';
    return res.status(502).json({ error: message });
  }
}
