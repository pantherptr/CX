import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_lib/cors.js';

/**
 * Refreshes a host's Connect payout status directly from Stripe — called
 * when the host lands back on /host#payouts?onboarded=1 after finishing
 * (or abandoning) Stripe's hosted onboarding flow, so they see the real
 * result immediately rather than waiting for the Connect webhook
 * (api/stripe-connect-webhook.ts), which is the authoritative background
 * sync for any *later* change (e.g. Stripe restricting the account after
 * the fact) but can lag a few seconds behind the redirect.
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
    return res.status(500).json({ error: 'Payouts are not configured on this server yet.' });
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_connect_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.stripe_connect_account_id) {
    return res.status(200).json({ payoutsEnabled: false });
  }

  try {
    const account = await stripe.accounts.retrieve(profile.stripe_connect_account_id);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    await supabase.from('profiles').update({ stripe_connect_payouts_enabled: payoutsEnabled }).eq('id', user.id);
    return res.status(200).json({ payoutsEnabled });
  } catch (err) {
    console.error('[connect-account-status] Stripe lookup failed for', user.id, err);
    return res.status(502).json({ error: 'Could not check payout account status.' });
  }
}
