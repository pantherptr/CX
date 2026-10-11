import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_lib/cors.js';
import { sendPushToUser, getNotificationPrefs } from './_lib/push.js';
import { getUserLang, text } from './_lib/texts.js';
import { sendVerificationDecisionEmail } from './_lib/email.js';

/**
 * Pushes the other participant(s) in a conversation after a message is
 * sent. Messages themselves are still written directly from the client
 * (see src/lib/data/messages.ts's sendMessage — an ordinary RLS-scoped
 * insert, unchanged), since there's no privileged logic there to move
 * server-side. This endpoint exists only for the one thing the client
 * can't safely do itself: reach a *different* user's device token — the
 * insert's own RLS lets a participant read the conversation's own rows,
 * but device_tokens has no read policy at all (see migration 0020), by
 * design, so only the service-role key here can look one up.
 *
 * Called fire-and-forget right after a successful insert; a failure here
 * must never surface as a failed send, since the message itself already
 * exists.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Database → push: a row written by a database function (notify_config, migration 0110) calls us
  // with a shared secret instead of a user session.
  if ((req.body ?? {}).type === 'fanout') {
    const secret = process.env.NOTIFY_FANOUT_SECRET;
    if (!secret || req.headers['x-cx-secret'] !== secret) return res.status(401).json({ error: 'Unauthorized' });
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const b = req.body as { userId?: string; title?: string; body?: string; url?: string };
    if (!url || !key || !b.userId || !b.title) return res.status(400).json({ error: 'Bad request' });
    const admin = createClient(url, key, { auth: { persistSession: false } });
    await sendPushToUser(admin, b.userId, { title: b.title, body: b.body ?? '', data: { url: b.url ?? '/' } });
    return res.status(200).json({ sent: true });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sign in to send messages.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(200).json({ skipped: true });
  }

  const { conversationId, preview, type, userId, kind, decision, reason } = (req.body ?? {}) as {
    conversationId?: string;
    preview?: string;
    type?: string;
    userId?: string;
    kind?: 'identity' | 'licence';
    decision?: 'approved' | 'rejected';
    reason?: string;
  };

  // Second job of this endpoint (Vercel's plan caps the number of functions): tell someone the
  // result of their identity / licence review, by push and email. Only a reviewer may trigger it.
  if (type === 'verification') {
    if (!userId || !kind || !decision) return res.status(400).json({ error: 'Missing fields.' });
    const reviewerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user: reviewer },
    } = await reviewerClient.auth.getUser();
    if (!reviewer) return res.status(401).json({ error: 'Your session has expired — please sign in again.' });
    const { data: reviewerProfile } = await reviewerClient.from('profiles').select('is_admin, is_owner').eq('id', reviewer.id).single();
    if (!reviewerProfile?.is_admin && !reviewerProfile?.is_owner) return res.status(403).json({ error: 'Not allowed.' });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const what = kind === 'identity' ? 'identity' : 'driving licence';
    const approved = decision === 'approved';
    const lang = await getUserLang(admin, userId);
    const vt = text(`${approved ? 'verif_ok' : 'verif_no'}_${kind}`, lang, { reason: (reason || '').slice(0, 120) });
    await Promise.all([
      sendPushToUser(admin, userId, {
        title: vt?.title ?? (approved ? `Your ${what} is verified ✓` : `Your ${what} needs a new photo`),
        body: vt?.body || (approved ? 'You are ready to rent.' : (reason || 'Tap to see why and send it again.').slice(0, 120)),
        data: { url: approved ? '/settings#verification' : `/settings#${kind === 'identity' ? 'verification' : 'licence'}` },
      }),
      (async () => {
        const { data } = await admin.auth.admin.getUserById(userId);
        const email = data?.user?.email;
        if (email) await sendVerificationDecisionEmail(email, { kind, decision, reason });
      })(),
    ]);
    return res.status(200).json({ sent: true });
  }

  // The team decided on a listing: push the host (the inbox row and the CX chat message are written
  // by the database function).
  if (type === 'listing_decision') {
    const carId = (req.body ?? {}).carId as string | undefined;
    if (!carId || !decision) return res.status(400).json({ error: 'Missing fields.' });
    const teamClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user: reviewer },
    } = await teamClient.auth.getUser();
    if (!reviewer) return res.status(401).json({ error: 'Your session has expired — please sign in again.' });
    const { data: me } = await teamClient.from('profiles').select('is_admin, is_owner').eq('id', reviewer.id).single();
    if (!me?.is_admin && !me?.is_owner) return res.status(403).json({ error: 'Not allowed.' });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: car } = await admin.from('cars').select('host_id, make, model').eq('id', carId).maybeSingle();
    if (!car) return res.status(404).json({ error: 'Not found.' });
    const approved = decision === 'approved';
    const hostLang = await getUserLang(admin, car.host_id as string);
    const lt = text(approved ? 'listing_live' : 'listing_rejected', hostLang, { car: `${car.make} ${car.model}`, reason: (reason || '').slice(0, 120) });
    await sendPushToUser(admin, car.host_id as string, {
      title: lt?.title ?? (approved ? `Your ${car.make} ${car.model} is live` : `Your ${car.make} ${car.model} needs changes`),
      body: lt?.body || (approved ? 'Renters can find it now.' : (reason || 'Open it to see what to fix.').slice(0, 120)),
      data: { url: '/host#cars' },
    });
    return res.status(200).json({ sent: true });
  }

  // Third job of this endpoint: a host just submitted a listing — tell the team, who have a few
  // minutes to look before it goes live on its own. Only the car's own host can trigger it.
  if (type === 'listing_submitted') {
    const carId = (req.body ?? {}).carId as string | undefined;
    if (!carId) return res.status(400).json({ error: 'Missing carId.' });
    const hostClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: car } = await hostClient.from('cars').select('make, model, year, review_status').eq('id', carId).maybeSingle();
    if (!car || car.review_status !== 'pending') return res.status(200).json({ skipped: true });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: team } = await admin.from('profiles').select('id').or('is_admin.eq.true,is_owner.eq.true');
    await Promise.all(
      (team ?? []).map(async (t: { id: string }) => {
        const lang = await getUserLang(admin, t.id);
        const tx = text('listing_submitted', lang, { car: `${car.year} ${car.make} ${car.model}` });
        return sendPushToUser(admin, t.id, {
          title: tx?.title ?? 'New listing to review',
          body: tx?.body ?? `${car.year} ${car.make} ${car.model} — goes live in 5 minutes unless you take a look.`,
          data: { url: '/admin#review' },
        });
      }),
    );
    return res.status(200).json({ notified: (team ?? []).length });
  }

  if (!conversationId) {
    return res.status(400).json({ error: 'Missing conversationId.' });
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

  // Scoped to the caller's own RLS — only returns rows if they're actually
  // a participant of this conversation, so this can't be used to probe an
  // arbitrary conversation id for who's in it.
  const [{ data: participants }, { data: senderProfile }] = await Promise.all([
    callerClient.from('conversation_participants').select('user_id').eq('conversation_id', conversationId),
    callerClient.from('profiles').select('full_name, is_owner').eq('id', user.id).single(),
  ]);

  const recipients = ((participants ?? []) as { user_id: string }[])
    .map((p) => p.user_id)
    .filter((id: string) => id !== user.id);
  if (recipients.length === 0) {
    return res.status(200).json({ sent: 0 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  // Support writes under the company's name, never the Owner's own.
  const senderName = senderProfile?.is_owner ? 'CX' : senderProfile?.full_name || 'Someone';
  const previewText = preview ? preview.slice(0, 120) : null;

  await Promise.all(
    recipients.map(async (recipientId: string) => {
      const prefs = await getNotificationPrefs(adminClient, recipientId);
      if (!prefs.push || !prefs.messages) return;
      const lang = await getUserLang(adminClient, recipientId);
      const body = previewText ?? text('message_fallback', lang)?.body ?? 'Sent you a message';
      return sendPushToUser(adminClient, recipientId, {
        title: senderName,
        body,
        data: { url: `/messages?c=${conversationId}` },
      });
    }),
  );

  return res.status(200).json({ sent: recipients.length });
}
