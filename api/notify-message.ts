import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_lib/cors';
import { sendPushToUser } from './_lib/push';

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

  const { conversationId, preview } = (req.body ?? {}) as { conversationId?: string; preview?: string };
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
    callerClient.from('profiles').select('full_name').eq('id', user.id).single(),
  ]);

  const recipients = ((participants ?? []) as { user_id: string }[])
    .map((p) => p.user_id)
    .filter((id: string) => id !== user.id);
  if (recipients.length === 0) {
    return res.status(200).json({ sent: 0 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const senderName = senderProfile?.full_name || 'Someone';
  const body = preview ? preview.slice(0, 120) : 'Sent you a message';

  await Promise.all(
    recipients.map((recipientId: string) =>
      sendPushToUser(adminClient, recipientId, {
        title: senderName,
        body,
        data: { url: '/messages' },
      }),
    ),
  );

  return res.status(200).json({ sent: recipients.length });
}
