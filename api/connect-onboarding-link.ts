import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_lib/cors.js';

/**
 * Starts (or resumes) Stripe Express onboarding for a host's payout
 * account — see supabase/migrations/0068_stripe_connect_payouts.sql. This
 * account only ever *receives* transfers (the base rental price, sent by
 * the daily sweep in api/send-pickup-reminders.ts once a trip completes)
 * — it never takes a card payment of its own, so it only requests the
 * `transfers` capability, not `card_payments`.
 *
 * One Express account per host, reused across calls (mirrors
 * api/create-payment-intent.ts's stripe_customer_id caching): if the host
 * already has an account but hasn't finished onboarding, this just issues
 * a fresh Account Link for the same account rather than creating a
 * second one.
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
  const siteUrl = process.env.SITE_URL;
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Payouts are not configured on this server yet.' });
  }
  if (!siteUrl) {
    return res.status(500).json({ error: 'SITE_URL is not set — onboarding needs somewhere to send the host back to.' });
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

  // Service-role from here: stripe_connect_account_id is locked against
  // direct client writes (trg_lock_connect_columns, 0068) since it must
  // only ever be set by this endpoint or the Connect webhook.
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_connect_account_id')
      .eq('id', user.id)
      .maybeSingle();

    let accountId = profile?.stripe_connect_account_id ?? undefined;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
        metadata: { supabaseUserId: user.id },
      });
      accountId = account.id;
      await supabase.from('profiles').update({ stripe_connect_account_id: accountId }).eq('id', user.id);
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/host#payouts`,
      return_url: `${siteUrl}/host?onboarded=1#payouts`,
      type: 'account_onboarding',
    });

    return res.status(200).json({ url: accountLink.url });
  } catch (err) {
    console.error('[connect-onboarding-link] failed for', user.id, err);
    const message = err instanceof Stripe.errors.StripeError ? err.message : 'Could not start payout onboarding.';
    return res.status(502).json({ error: message });
  }
}
