import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_lib/cors.js';

/**
 * Starts the payment for a sponsored Signal post (see
 * supabase/migrations/0100_signal_sponsored_posts.sql).
 *
 * The amount is never taken from the request: the draft is created by
 * create_ad_draft() with the caller's own auth — which validates the post
 * (yours, public), the budget (from 1.99 EUR a day) and the days — and the
 * PaymentIntent charges exactly the total that function returned. The charge
 * goes through right away; an Owner/Admin then approves it (api/review-ad.ts).
 * A rejected or cancelled sponsorship is refunded in full there.
 * api/stripe-webhook.ts moves the ad to "pending review" once Stripe confirms.
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in to sponsor a post.' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Payments are not configured on this server yet.' });
  }

  const { postId, dailyCents, days } = (req.body ?? {}) as { postId?: string; dailyCents?: number; days?: number };
  if (!postId || !Number.isInteger(dailyCents) || !Number.isInteger(days)) {
    return res.status(400).json({ error: 'Missing sponsorship details.' });
  }

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return res.status(401).json({ error: 'Your session has expired — please sign in again.' });

  const { data: draft, error: draftError } = await caller
    .rpc('create_ad_draft', { p_post_id: postId, p_daily_cents: dailyCents, p_days: days })
    .single<{ ad_id: string; total_cents: number }>();
  if (draftError || !draft) return res.status(400).json({ error: draftError?.message ?? 'Could not prepare this sponsorship.' });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  try {
    const intent = await stripe.paymentIntents.create({
      amount: draft.total_cents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      description: 'CX Signal — sponsored post',
      metadata: { kind: 'signal_ad', adId: draft.ad_id, userId: user.id },
    });
    await admin.from('signal_ads').update({ stripe_payment_intent_id: intent.id }).eq('id', draft.ad_id);
    return res.status(200).json({ clientSecret: intent.client_secret, adId: draft.ad_id, amount: draft.total_cents / 100, currency: 'eur' });
  } catch (err) {
    await admin.from('signal_ads').delete().eq('id', draft.ad_id).eq('status', 'awaiting_payment');
    console.error('[create-ad-payment] stripe error', err);
    return res.status(502).json({ error: 'The payment provider could not start this payment. Please try again.' });
  }
}
