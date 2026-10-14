import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { shrinkImage } from '../shrinkImage';
import { unsplash } from '../img';
import { apiUrl } from '../api';

/**
 * Real messaging data-access layer. The conversations/
 * conversation_participants/messages tables and their RLS (via the
 * is_conversation_participant() security-definer helper, which avoids a
 * recursive policy on conversation_participants) have existed since
 * migration 0001 — this was the one part of that schema never wired to
 * the frontend. A conversation is scoped to (car, the two participants),
 * not to a specific booking — one ongoing thread per host relationship on
 * a car, matching the schema (`conversations.car_id`, no `booking_id`).
 */

export interface ConversationCar {
  id: string;
  slug: string;
  make: string;
  model: string;
  image: string;
}

/** The verified-badge tier a participant's own account carries — derived
 *  from their real profile flags, same hierarchy as everywhere else in
 *  the app (Owner > Admin > Host > Client). See VerifiedBadge in
 *  primitives.tsx for how each renders. */
export type ParticipantRole = 'owner' | 'admin' | 'host' | 'client' | 'cx';

/** How members see the support account: as the company, never as the person behind it. */
export const CX_PARTICIPANT = { name: 'CX', avatar: '/brand/avatar-cx-flag.webp', role: 'cx' } as const;

export interface ConversationParticipant {
  id: string;
  name: string;
  avatar: string;
  role: ParticipantRole;
}

export function roleFromFlags(flags: { is_owner: boolean; is_admin: boolean; is_host: boolean }): ParticipantRole {
  if (flags.is_owner) return 'owner';
  if (flags.is_admin) return 'admin';
  if (flags.is_host) return 'host';
  return 'client';
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  /** Set only on the Owner's own messages, when they chose to send as the
   *  Owner Assistant identity instead of their real one — see migration
   *  0024_owner_messaging.sql. `null` for every other account's messages,
   *  and for the Owner's own messages sent as themselves. */
  senderRole: 'owner' | 'owner_assistant' | null;
  /** A photo attached to the message (private bucket path); the body is '' for photo-only messages. */
  mediaPath: string | null;
  /** The sender deleted it — only a "message deleted" tombstone is shown. */
  deleted: boolean;
}

export interface Conversation {
  id: string;
  /** 'support' = a request to the CX team (closable), 'notice' = a read-only message from CX, 'chat' = everything else */
  kind: 'chat' | 'support' | 'notice';
  /** set when the team closed it: nobody can write any more */
  closedAt: string | null;
  car: ConversationCar | null;
  other: ConversationParticipant;
  lastMessage: Message | null;
  unreadCount: number;
}

interface ConversationRow {
  id: string;
  car_id: string | null;
  created_at: string;
  kind?: string | null;
  closed_at?: string | null;
  car: {
    id: string;
    slug: string;
    make: string;
    model: string;
    car_images: { url: string; position: number }[];
  } | null;
  participants: {
    user_id: string;
    profile: { id: string; full_name: string | null; avatar_url: string | null; is_owner: boolean; is_admin: boolean; is_host: boolean };
  }[];
  messages: MessageRow[];
}

interface MessageRow {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  read_at: string | null;
  sender_role: Message['senderRole'];
  media_path?: string | null;
  deleted_at?: string | null;
}

// Migration 0104 adds media_path / deleted_at. Until it has run, selecting them errors — so we try
// the extended column list once and fall back to the original one for good if the DB says no.
let extendedColumns: boolean | null = null;
const MSG_BASE = 'id, body, sender_id, created_at, read_at, sender_role';
const msgCols = () => (extendedColumns === false ? MSG_BASE : `${MSG_BASE}, media_path, deleted_at`);
const isMissingColumn = (err: { message?: string; code?: string } | null) =>
  !!err && (err.code === '42703' || /media_path|deleted_at/.test(err.message ?? ''));


// Migration 0131 adds kind / closed_at; the same try-then-fall-back as above.
let supportColumns: boolean | null = null;
const isMissingSupport = (err: { message?: string; code?: string } | null) =>
  !!err && (err.code === '42703' || /\bkind\b|closed_at/.test(err.message ?? ''));

const conversationSelect = () => `
  id, car_id, created_at${supportColumns === false ? '' : ', kind, closed_at'},
  car:cars (id, slug, make, model, car_images(url, position)),
  participants:conversation_participants (user_id, profile:profiles(id, full_name, avatar_url, is_owner, is_admin, is_host)),
  messages (${msgCols()})
`;

function mapMessage(conversationId: string, row: MessageRow): Message {
  return {
    id: row.id,
    conversationId,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
    senderRole: row.sender_role ?? null,
    mediaPath: row.media_path ?? null,
    deleted: Boolean(row.deleted_at),
  };
}

function mapConversation(row: ConversationRow, myUserId: string): Conversation {
  const otherParticipant = row.participants.find((p) => p.user_id !== myUserId)?.profile;
  // Support (the Owner account) appears to everyone else as "CX" — the
  // company — not under the Owner's own name, photo and badge.
  const meProfile = row.participants.find((p) => p.user_id === myUserId)?.profile;
  const otherIsCx = Boolean(otherParticipant?.is_owner) && !meProfile?.is_owner;
  const heroId = row.car ? [...row.car.car_images].sort((a, b) => a.position - b.position)[0]?.url ?? '' : '';
  const messages = [...row.messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = messages[messages.length - 1];
  return {
    id: row.id,
    kind: row.kind === 'support' || row.kind === 'notice' ? row.kind : 'chat',
    closedAt: row.closed_at ?? null,
    car: row.car
      ? { id: row.car.id, slug: row.car.slug, make: row.car.make, model: row.car.model, image: heroId ? unsplash(heroId, 240) : '' }
      : null,
    other: otherIsCx
      ? { id: otherParticipant?.id ?? '', ...CX_PARTICIPANT }
      : {
          id: otherParticipant?.id ?? '',
          name: otherParticipant?.full_name ?? 'CX user',
          avatar: otherParticipant?.avatar_url ?? '',
          role: otherParticipant ? roleFromFlags(otherParticipant) : 'client',
        },
    lastMessage: last ? mapMessage(row.id, last) : null,
    unreadCount: row.messages.filter((m) => m.sender_id !== myUserId && !m.read_at).length,
  };
}

export async function fetchConversations(userId: string): Promise<Conversation[]> {
  const { data: myRows, error: myErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId);
  if (myErr) throw myErr;
  const ids = (myRows ?? []).map((r) => r.conversation_id);
  if (!ids.length) return [];

  let { data, error } = await supabase.from('conversations').select(conversationSelect()).in('id', ids);
  for (let attempt = 0; error && attempt < 2; attempt += 1) {
    if (supportColumns !== false && isMissingSupport(error)) supportColumns = false;
    else if (extendedColumns !== false && isMissingColumn(error)) extendedColumns = false;
    else break;
    ({ data, error } = await supabase.from('conversations').select(conversationSelect()).in('id', ids));
  }
  if (error) throw error;
  if (extendedColumns === null) extendedColumns = true;
  if (supportColumns === null) supportColumns = true;

  const mapped = (data as unknown as ConversationRow[]).map((row) => mapConversation(row, userId));
  return mapped.sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? '';
    const bt = b.lastMessage?.createdAt ?? '';
    return bt.localeCompare(at);
  });
}

/** Loads the conversation list and keeps it live for as long as this hook
 *  is mounted — any message INSERT this user is authorized to see (RLS
 *  applies to Realtime the same as it does to a normal query, so no
 *  explicit per-conversation filter is needed) triggers a lightweight
 *  refetch, so a reply landing while you're sitting on the list itself —
 *  not inside that thread — still updates the preview, timestamp, order
 *  and unread badge without a manual reload. Debounced so a burst of
 *  messages across several conversations collapses into one refetch. */
export function useConversations(userId: string | undefined) {
  const instanceId = useId();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // The list is only blanked when the SIGNED-IN USER changes. A refresh (after sending a message,
  // after marking a thread read) keeps showing the current list and swaps in the new one when it
  // arrives — blanking it made the open chat vanish for a moment on every send ("the jump").
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) {
      setConversations([]);
      loadedFor.current = null;
      return;
    }
    let cancelled = false;
    if (loadedFor.current !== userId) {
      setConversations(null);
      loadedFor.current = userId;
    }
    setError(null);
    fetchConversations(userId)
      .then((data) => {
        if (!cancelled) setConversations(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load conversations.');
      });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  useEffect(() => {
    if (!userId) return;
    let debounceHandle: number | null = null;
    const scheduleRefetch = () => {
      if (debounceHandle) window.clearTimeout(debounceHandle);
      debounceHandle = window.setTimeout(() => {
        fetchConversations(userId).then(setConversations).catch(() => {});
      }, 250);
    };
    const channel = supabase
      .channel(`conversation-list:${userId}:${instanceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, scheduleRefetch)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, scheduleRefetch)
      .subscribe();
    return () => {
      if (debounceHandle) window.clearTimeout(debounceHandle);
      supabase.removeChannel(channel);
    };
  }, [userId, instanceId]);

  return { conversations, error, loading: conversations === null && !error, refresh: () => setRefreshKey((k) => k + 1) };
}

/** Latest messages of a thread, oldest first. Capped so a very long thread does not pull its
 *  whole history on every open (and every refresh) — the newest 300 are what anyone reads. */
export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const run = () => supabase
    .from('messages')
    .select(msgCols())
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(300);
  let { data, error } = await run();
  if (error && extendedColumns !== false && isMissingColumn(error)) {
    extendedColumns = false;
    ({ data, error } = await run());
  }
  if (error) throw error;
  if (extendedColumns === null) extendedColumns = true;
  return ((data ?? []) as unknown as MessageRow[]).reverse().map((row) => mapMessage(conversationId, row));
}

// The last thread we loaded for each conversation. Opening one shows these straight away and
// refreshes behind them, so tapping a chat never starts from a "Loading…" screen.
const threadCache = new Map<string, Message[]>();
const inflight = new Map<string, Promise<Message[]>>();

function loadThread(conversationId: string): Promise<Message[]> {
  const running = inflight.get(conversationId);
  if (running) return running;
  const p = fetchMessages(conversationId)
    .then((data) => { threadCache.set(conversationId, data); return data; })
    .finally(() => { inflight.delete(conversationId); });
  inflight.set(conversationId, p);
  return p;
}

/** Warms a thread (call on touch-down of a conversation row, ~100ms before the click lands). */
export function prefetchConversation(conversationId: string): void {
  if (threadCache.has(conversationId) || inflight.has(conversationId)) return;
  void loadThread(conversationId).catch(() => undefined);
}

/** Loads a conversation's messages and subscribes to live INSERTs for the
 *  duration this hook is mounted — the thread updates without a manual
 *  refresh while it's open (see migration 0007 for the Realtime publication). */
export function useConversation(conversationId: string | null) {
  const [state, setState] = useState<{ id: string | null; messages: Message[] | null }>(() => ({
    id: conversationId,
    messages: conversationId ? threadCache.get(conversationId) ?? null : null,
  }));
  // Switching conversation: show that thread's cached messages (or null) in the SAME render, never
  // a flash of the previous thread.
  const messages = state.id === conversationId ? state.messages : conversationId ? threadCache.get(conversationId) ?? null : null;

  const setFor = useCallback((id: string, fn: (prev: Message[] | null) => Message[] | null) => {
    setState((cur) => {
      const prev = cur.id === id ? cur.messages : threadCache.get(id) ?? null;
      const next = fn(prev);
      if (next) threadCache.set(id, next);
      return { id, messages: next };
    });
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setState({ id: null, messages: null });
      return;
    }
    let cancelled = false;
    const id = conversationId;
    // Merge the server's list into what is already on screen: keeps any message that arrived by
    // realtime or from our own send while the request was in flight.
    const sync = () => {
      loadThread(id)
        .then((data) => {
          if (cancelled) return;
          setFor(id, (prev) => {
            if (!prev) return data;
            const ids = new Set(data.map((m) => m.id));
            const extra = prev.filter((m) => !ids.has(m.id) && m.createdAt > (data[data.length - 1]?.createdAt ?? ''));
            return extra.length ? [...data, ...extra] : data;
          });
        })
        .catch(() => {
          // Keep whatever is on screen; show an empty thread rather than "Loading…" forever.
          if (!cancelled) setFor(id, (prev) => prev ?? []);
        });
    };
    setState((cur) => (cur.id === id ? cur : { id, messages: threadCache.get(id) ?? null }));
    sync();

    const channel = supabase
      .channel(`messages:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          const row = payload.new as ConversationRow['messages'][number];
          // Dedupe by id: a message we just sent is already in the list (added from the insert's own
          // response) by the time the realtime event for it arrives.
          setFor(id, (prev) => (prev && !prev.some((m) => m.id === row.id) ? [...prev, mapMessage(id, row)] : prev));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          // Read receipts turning blue and "message deleted" show up live.
          const row = payload.new as MessageRow;
          setFor(id, (prev) => (prev ? prev.map((m) => (m.id === row.id ? mapMessage(id, row) : m)) : prev));
        },
      )
      .subscribe((status) => {
        // Anything sent between the first load and the subscription going live is caught here.
        if (status === 'SUBSCRIBED') { inflight.delete(id); sync(); }
      });

    // Coming back to the tab/app: realtime may have been asleep.
    const onVisible = () => { if (document.visibilityState === 'visible') { inflight.delete(id); sync(); } };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [conversationId, setFor]);

  /** Adds a message we already have (the one we just sent) without waiting for realtime. */
  const append = useCallback((message: Message) => {
    setFor(message.conversationId, (prev) => (prev && !prev.some((m) => m.id === message.id) ? [...prev, message] : prev));
  }, [setFor]);

  return { messages, loading: messages === null, append };
}

/** `senderRole` is the Owner Control Center's identity switcher — 'owner'
 *  or 'owner_assistant' to send under that badge, omitted/undefined for
 *  everyone else's ordinary messages. Rejected server-side (migration
 *  0024_owner_messaging.sql) for anyone whose account isn't actually the
 *  Owner, regardless of what a client sends here. */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
  senderRole?: 'owner' | 'owner_assistant',
): Promise<{ error: string | null; message: Message | null }> {
  return insertMessage(conversationId, { sender_id: senderId, body, sender_role: senderRole ?? null }, body);
}

async function insertMessage(
  conversationId: string,
  fields: Record<string, unknown>,
  pushText: string,
): Promise<{ error: string | null; message: Message | null }> {
  const run = () => supabase
    .from('messages')
    .insert({ conversation_id: conversationId, ...fields })
    .select(msgCols())
    .maybeSingle();
  let { data, error } = await run();
  if (error && extendedColumns !== false && isMissingColumn(error)) {
    extendedColumns = false;
    ({ data, error } = await run());
  }
  if (!error) void notifyRecipients(conversationId, pushText);
  return {
    error: error?.message ?? null,
    message: data ? mapMessage(conversationId, data as unknown as MessageRow) : null,
  };
}

// ------------------------------------------------------------------ photos

const CHAT_BUCKET = 'chat-media';

/** Sends a photo (optionally with a caption). Needs migration 0104. */
export async function sendPhotoMessage(
  conversationId: string,
  senderId: string,
  original: File,
  caption: string,
  senderRole?: 'owner' | 'owner_assistant',
): Promise<{ error: string | null; message: Message | null }> {
  if (extendedColumns === false) return { error: 'Photos are not available yet.', message: null };
  const file = await shrinkImage(original, 1600, 0.82);
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(CHAT_BUCKET).upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type || 'image/jpeg' });
  if (up.error) return { error: up.error.message, message: null };
  const res = await insertMessage(conversationId, { sender_id: senderId, body: caption, sender_role: senderRole ?? null, media_path: path }, caption || '📷 Photo');
  if (res.error) await supabase.storage.from(CHAT_BUCKET).remove([path]);
  return res;
}

const signedCache = new Map<string, { url: string; exp: number }>();

/** A short-lived link to a chat photo (cached for most of its hour). */
export async function chatMediaUrl(path: string): Promise<string | null> {
  const hit = signedCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  signedCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

/** Deletes one of your own messages (tombstone) and its photo. Needs migration 0104. */
export async function deleteMyMessage(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('delete_my_message', { p_id: id });
  if (error) return { error: error.message };
  if (typeof data === 'string' && data) await supabase.storage.from(CHAT_BUCKET).remove([data]);
  return { error: null };
}

/** Reports the other person in a conversation (optionally pointing at a message). Needs migration 0104. */
export async function reportChatUser(conversationId: string, messageId: string | null, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('report_chat_user', { p_conversation_id: conversationId, p_message_id: messageId, p_reason: reason });
  return { error: error ? error.message : null };
}

// Fire-and-forget push to the other participant(s) — see
// api/notify-message.ts for why this needs a server call rather than a
// direct client write (device_tokens has no read policy for other users'
// rows). A failure here must never surface as a failed send; the message
// itself is already committed by the time this runs.
async function notifyRecipients(conversationId: string, body: string): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(apiUrl('/api/notify-message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ conversationId, preview: body }),
    });
  } catch (err) {
    console.error('[messages] push notify failed', err);
  }
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .is('read_at', null);
}

/** Finds an existing conversation about this car shared by both users, or
 *  creates one. This is what every "Message host"/"Contact host" action
 *  calls — never a fake toast claiming a message was sent.
 *
 *  `carId: null` is the Owner Control Center's one exception — the Owner
 *  contacting a host isn't ever about a specific listing, so this opens
 *  (or reuses) a car-less conversation instead. `conversations.car_id` is
 *  nullable for exactly this (migration 0001: `on delete set null`). */
export async function findOrCreateConversation(carId: string | null, myUserId: string, otherUserId: string): Promise<string> {
  const carFilter = supabase
    .from('conversation_participants')
    .select('conversation_id, conversations!inner(car_id)')
    .eq('user_id', myUserId);
  const { data: mine, error: mineErr } = await (carId === null
    ? carFilter.is('conversations.car_id', null)
    : carFilter.eq('conversations.car_id', carId));
  if (mineErr) throw mineErr;

  const myConversationIds = (mine ?? []).map((r) => r.conversation_id);
  if (myConversationIds.length) {
    const { data: shared, error: sharedErr } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', otherUserId)
      .in('conversation_id', myConversationIds);
    if (sharedErr) throw sharedErr;
    if (shared && shared.length) return shared[0].conversation_id;
  }

  // The conversation's id is generated client-side and the insert asks for
  // nothing back: `INSERT ... RETURNING` re-checks the SELECT policy on the
  // new row, and at this exact instant the caller isn't a participant yet
  // (that happens in the next insert), so RETURNING would be rejected even
  // though the INSERT itself is legitimate.
  const conversationId = crypto.randomUUID();
  const { error: convErr } = await supabase.from('conversations').insert({ id: conversationId, car_id: carId });
  if (convErr) throw convErr;

  const { error: partErr } = await supabase.from('conversation_participants').insert([
    { conversation_id: conversationId, user_id: myUserId },
    { conversation_id: conversationId, user_id: otherUserId },
  ]);
  if (partErr) throw partErr;

  return conversationId;
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  const { data: myRows } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId);
  const ids = (myRows ?? []).map((r) => r.conversation_id);
  if (!ids.length) return 0;
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .in('conversation_id', ids)
    .neq('sender_id', userId)
    .is('read_at', null);
  return count ?? 0;
}

// One shared count per signed-in person. The badge is read by several shells at once (BottomNav,
// DashboardShell, AppMobileDrawer, HostDashboard); before, each of them ran its own two queries and
// its own realtime channel on every page. Now they share one fetch and one subscription, ref-counted.
interface UnreadEntry {
  count: number;
  loaded: boolean;
  subs: Set<(n: number) => void>;
  timer: number | null;
  stop: () => void;
}
const unreadEntries = new Map<string, UnreadEntry>();
const unreadInflight = new Map<string, Promise<number>>();

function refreshUnread(userId: string): void {
  let run = unreadInflight.get(userId);
  if (!run) {
    run = fetchUnreadCount(userId).finally(() => unreadInflight.delete(userId));
    unreadInflight.set(userId, run);
  }
  void run.then((n) => {
    const entry = unreadEntries.get(userId);
    if (!entry) return;
    entry.count = n;
    entry.loaded = true;
    entry.subs.forEach((fn) => fn(n));
  }).catch(() => {});
}

function openUnreadEntry(userId: string): UnreadEntry {
  const entry: UnreadEntry = { count: 0, loaded: false, subs: new Set(), timer: null, stop: () => {} };
  const schedule = () => {
    if (entry.timer) window.clearTimeout(entry.timer);
    entry.timer = window.setTimeout(() => refreshUnread(userId), 250);
  };
  const channel = supabase
    .channel(`unread-count:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, schedule)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, schedule)
    .subscribe();
  entry.stop = () => {
    if (entry.timer) window.clearTimeout(entry.timer);
    supabase.removeChannel(channel);
  };
  unreadEntries.set(userId, entry);
  refreshUnread(userId);
  return entry;
}

/** The unread-messages badge shown in the nav shells (Navbar, BottomNav,
 *  DashboardShell, HostDashboard) — every one of them shares this same
 *  hook, and now the same single fetch + realtime subscription behind it,
 *  so a new or read message updates the badge everywhere without each
 *  caller having to wire its own. */
export function useUnreadMessageCount(userId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    const entry = unreadEntries.get(userId) ?? openUnreadEntry(userId);
    entry.subs.add(setCount);
    if (entry.loaded) setCount(entry.count);

    return () => {
      entry.subs.delete(setCount);
      if (entry.subs.size === 0 && unreadEntries.get(userId) === entry) {
        entry.stop();
        unreadEntries.delete(userId);
      }
    };
  }, [userId]);

  return count;
}

// ---------------------------------------------------------------------
// Owner-only: message any account directly, without waiting to be
// contacted first. Everyone else already reaches this same
// findOrCreateConversation via a specific car's "Message host" — this is
// the generic version, searching every profile by name rather than only
// a car's host.
// ---------------------------------------------------------------------

export interface MessagingSearchResult {
  id: string;
  name: string;
  avatar: string;
  role: ParticipantRole;
}

/** The one real "Official Support" identity in this schema — the Owner
 *  account, same one that can reply under the Owner Assistant badge (see
 *  migration 0024_owner_messaging.sql). Used by CX Concierge's "Talk to a
 *  real person" escalation, and anywhere else in the app that needs a
 *  genuine human to hand a conversation to, rather than a fabricated
 *  "Support" account that doesn't exist. */
export async function fetchSupportAccountId(): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('id').eq('is_owner', true).maybeSingle();
  return data?.id ?? null;
}

/** Starts (or reopens) a conversation with CX about a car. This is what
 *  "Contact" does before a booking exists: the member talks to CX, not
 *  straight to the host. Resolves to `null` when there is nobody to talk
 *  to (no support account, or the caller *is* the support account). */
export async function findOrCreateCxConversation(carId: string | null, myUserId: string): Promise<string | null> {
  const r = await openSupportConversation(carId, myUserId);
  return r?.id ?? null;
}

/** The open support conversation with CX for this car (or none), else a brand new one — a closed one is never reused. */
export async function openSupportConversation(
  carId: string | null,
  myUserId: string,
): Promise<{ id: string; created: boolean } | null> {
  const supportId = await fetchSupportAccountId();
  if (!supportId || supportId === myUserId) return null;

  const base = supabase.from('conversation_participants').select('conversation_id, conversations!inner(car_id)').eq('user_id', myUserId);
  const { data: mine } = await (carId === null ? base.is('conversations.car_id', null) : base.eq('conversations.car_id', carId));
  const mineIds = (mine ?? []).map((r) => r.conversation_id);
  if (mineIds.length) {
    const { data: shared } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', supportId)
      .in('conversation_id', mineIds);
    const sharedIds = (shared ?? []).map((r) => r.conversation_id);
    if (sharedIds.length) {
      // before migration 0131 there are no kind / closed_at columns: then the first shared one is reused, as it always was
      const { data: info, error } = await supabase.from('conversations').select('id, kind, closed_at, created_at').in('id', sharedIds);
      if (error) return { id: sharedIds[0], created: false };
      const open = (info ?? [])
        .filter((c) => !c.closed_at && c.kind !== 'notice')
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
      if (open) return { id: open.id, created: false };
    }
  }

  const id = crypto.randomUUID();
  let { error } = await supabase.from('conversations').insert({ id, car_id: carId, kind: 'support' });
  if (error && isMissingSupport(error)) ({ error } = await supabase.from('conversations').insert({ id, car_id: carId }));
  if (error) throw error;
  const { error: partErr } = await supabase.from('conversation_participants').insert([
    { conversation_id: id, user_id: myUserId },
    { conversation_id: id, user_id: supportId },
  ]);
  if (partErr) throw partErr;
  return { id, created: true };
}

/** The team closes a support conversation (needs migration 0131). */
export async function closeSupportConversation(conversationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('close_support_conversation', { p_conversation: conversationId });
  return { error: error?.message ?? null };
}

export async function searchUsersForMessaging(query: string): Promise<MessagingSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, is_owner, is_admin, is_host')
    .ilike('full_name', `%${q}%`)
    .limit(10);
  if (error || !data) return [];
  return data.map((p) =>
    p.is_owner
      ? { id: p.id, ...CX_PARTICIPANT }
      : {
          id: p.id,
          name: p.full_name || 'Unnamed user',
          avatar: p.avatar_url ?? '',
          role: roleFromFlags(p),
        },
  );
}
