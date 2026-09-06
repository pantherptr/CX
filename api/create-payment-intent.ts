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
 */

// Pinned explicitly (matching the installed `stripe` package's own default)
// so the PaymentIntent this creates and the Stripe.js Elements that render
// it agree on shape — an account whose dashboard default has since moved to
// a newer API version would otherwise leave Elements trying to parse an
// object it doesn't recognize, which fails silently (the card form just
// never finishes loading rather than throwing a visible error).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-02-24.acacia' });

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

  // One Stripe Customer per renter, reused across bookings — required for
  // setup_future_usage (a PaymentIntent can only save a payment method
  // against a Customer, not anonymously) and cheap to cache.
  const { data: profileRow } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle();
  let customerId = profileRow?.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabaseUserId: user.id },
    });
    customerId = customer.id;
    // Best-effort cache — if this write fails, the next payment just
    // creates (and this time successfully saves) another Customer rather
    // than breaking the current one.
    await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: quote.currency || 'eur',
    customer: customerId,
    setup_future_usage: 'off_session',
    automatic_payment_methods: { enabled: true },
    // Everything the webhook needs to create the booking after the
    // charge succeeds — this is the only record of the renter's choices
    // between "paid" and "booking exists", so it has to be complete.
    // depositAmountCents rides along here too so the webhook's deposit
    // hold (see api/stripe-webhook.ts) charges the exact figure this
    // renter was quoted, not a value recomputed later without their
    // session context.
    metadata: {
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
  });

  if (!paymentIntent.client_secret) {
    return res.status(500).json({ error: 'Could not start payment.' });
  }

  return res.status(200).json({
    clientSecret: paymentIntent.client_secret,
    amount: Number(quote.total),
    currency: quote.currency,
    deposit: Number(quote.deposit),
  });
}
