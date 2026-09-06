import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_lib/cors.js';

/**
 * Real Stripe balance for the Owner Home dashboard's "Available balance" /
 * "Pending balance" tiles — stripe.balance.retrieve() reflects the
 * platform's actual Stripe account: `available` is money that's cleared
 * and could be paid out today, `pending` is still settling. There is no
 * Stripe Connect / host-payout split anywhere in this codebase (every
 * PaymentIntent in api/create-payment-intent.ts goes straight to the
 * platform's own account, see that file's own comment) — so this is
 * genuinely the platform's whole balance, not a per-host figure.
 *
 * STRIPE_SECRET_KEY never reaches the browser; this endpoint exists
 * because the browser has no legitimate way to call Stripe's Balance API
 * directly (it's a secret-key-only endpoint by design).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sign in required.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey || !process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Not configured on this server yet.' });
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

  // profiles.is_owner is publicly readable ("Profiles are viewable by
  // everyone", migration 0001) — this is the same real check
  // is_owner()-gated RLS policies make server-side, just read directly
  // since there's no privileged mutation here, only a read of Stripe's
  // own balance.
  const { data: profile } = await callerClient.from('profiles').select('is_owner').eq('id', user.id).single();
  if (!profile?.is_owner) {
    return res.status(403).json({ error: 'Owner access required.' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
  try {
    const balance = await stripe.balance.retrieve();
    const sum = (entries: Stripe.Balance.Available[]) => entries.reduce((total, e) => total + e.amount, 0) / 100;
    return res.status(200).json({
      available: sum(balance.available),
      pending: sum(balance.pending),
      currency: balance.available[0]?.currency ?? 'eur',
    });
  } catch (err) {
    console.error('[owner-stripe-balance] Stripe error', err);
    return res.status(500).json({ error: 'Could not reach Stripe.' });
  }
}
