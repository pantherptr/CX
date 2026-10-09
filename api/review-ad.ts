import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_lib/cors.js';

/**
 * Decides on a paid sponsorship (supabase/migrations/0100_signal_sponsored_posts.sql).
 *
 *   approve  Owner/Admin  -> live for the days that were paid for, starting now
 *   reject   Owner/Admin  -> full refund, with an optional reason the advertiser sees
 *   cancel   the advertiser, only while it is still waiting for review -> full refund
 *
 * The refund is issued first; the status only changes once Stripe accepted it, so a
 * sponsorship is never marked refunded without the money actually going back.
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in required.' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Not configured on this server yet.' });
  }

  const { adId, action, reason } = (req.body ?? {}) as { adId?: string; action?: 'approve' | 'reject' | 'cancel'; reason?: string };
  if (!adId || !action || !['approve', 'reject', 'cancel'].includes(action)) return res.status(400).json({ error: 'Missing details.' });

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return res.status(401).json({ error: 'Your session has expired — please sign in again.' });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: ad } = await admin
    .from('signal_ads')
    .select('id, post_id, advertiser_id, days, status, stripe_payment_intent_id')
    .eq('id', adId)
    .maybeSingle();
  if (!ad) return res.status(404).json({ error: 'Sponsorship not found.' });
  if (ad.status !== 'pending_review') return res.status(409).json({ error: 'This sponsorship is not waiting for review.' });

  if (action === 'cancel') {
    if (ad.advertiser_id !== user.id) return res.status(403).json({ error: 'Not your sponsorship.' });
  } else {
    const { data: profile } = await caller.from('profiles').select('is_admin, is_owner').eq('id', user.id).maybeSingle();
    if (!profile?.is_admin && !profile?.is_owner) return res.status(403).json({ error: 'Owner or admin access required.' });
  }

  const notify = (type: 'ad_approved' | 'ad_rejected') =>
    admin.from('notifications').insert({ recipient_id: ad.advertiser_id, type, post_id: ad.post_id });

  try {
    if (action === 'approve') {
      const now = new Date();
      const { error } = await admin.from('signal_ads').update({
        status: 'active', reviewed_at: now.toISOString(), reviewed_by: user.id,
        starts_at: now.toISOString(), ends_at: new Date(now.getTime() + ad.days * 86_400_000).toISOString(),
      }).eq('id', ad.id).eq('status', 'pending_review');
      if (error) return res.status(500).json({ error: 'Could not approve it.' });
      await notify('ad_approved');
      return res.status(200).json({ ok: true });
    }

    if (!ad.stripe_payment_intent_id) return res.status(400).json({ error: 'This sponsorship has no payment to refund.' });
    await stripe.refunds.create({ payment_intent: ad.stripe_payment_intent_id });
    const { error } = await admin.from('signal_ads').update({
      status: action === 'reject' ? 'rejected' : 'canceled',
      reviewed_at: new Date().toISOString(), reviewed_by: action === 'reject' ? user.id : null,
      reject_reason: action === 'reject' ? (reason?.trim().slice(0, 300) || null) : null,
      refunded_at: new Date().toISOString(),
    }).eq('id', ad.id);
    if (error) console.error('[review-ad] refunded but could not update', ad.id, error);
    if (action === 'reject') await notify('ad_rejected');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[review-ad] failed', err);
    return res.status(502).json({ error: 'The refund could not be completed. Nothing was changed.' });
  }
}
