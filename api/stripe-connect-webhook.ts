import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

/**
 * Background sync for host payout accounts — separate from
 * api/stripe-webhook.ts because Stripe delivers Connect account events
 * (account.updated) to a *different* webhook endpoint than the
 * platform's own charge/payment events, configured separately under
 * "Connect" in the Stripe dashboard with its own signing secret
 * (STRIPE_CONNECT_WEBHOOK_SECRET).
 *
 * api/connect-onboarding-link.ts already gives a host instant feedback
 * right after onboarding; this is what keeps stripe_connect_payouts_enabled
 * correct afterwards too — an Express account can go from enabled back to
 * disabled if Stripe later flags something (a KYC document expiring, a
 * dispute, etc.), and a payout must never be attempted against an account
 * that's no longer actually able to receive one.
 */
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
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!signature || typeof signature !== 'string' || !webhookSecret) {
    console.error('[stripe-connect-webhook] missing signature header or STRIPE_CONNECT_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Webhook is not configured.' });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[stripe-connect-webhook] missing Supabase service role configuration');
    return res.status(500).json({ error: 'Webhook is not configured.' });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-connect-webhook] signature verification failed', err);
    return res.status(400).json({ error: 'Invalid signature.' });
  }

  if (event.type !== 'account.updated') {
    return res.status(200).json({ received: true });
  }

  const account = event.data.object as Stripe.Account;
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { error } = await supabase
    .from('profiles')
    .update({ stripe_connect_payouts_enabled: Boolean(account.payouts_enabled) })
    .eq('stripe_connect_account_id', account.id);

  if (error) console.error('[stripe-connect-webhook] failed to sync payouts_enabled for account', account.id, error);

  return res.status(200).json({ received: true });
}
