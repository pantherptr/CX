import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { unsplash } from '../img';

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

export interface ConversationParticipant {
  id: string;
  name: string;
  avatar: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface Conversation {
  id: string;
  car: ConversationCar | null;
  other: ConversationParticipant;
  lastMessage: Message | null;
  unreadCount: number;
}

interface ConversationRow {
  id: string;
  car_id: string | null;
  created_at: string;
  car: {
    id: string;
    slug: string;
    make: string;
    model: string;
    car_images: { url: string; position: number }[];
  } | null;
  participants: { user_id: string; profile: { id: string; full_name: string | null; avatar_url: string | null } }[];
  messages: { id: string; body: string; sender_id: string; created_at: string; read_at: string | null }[];
}

const CONVERSATION_SELECT = `
  id, car_id, created_at,
  car:cars (id, slug, make, model, car_images(url, position)),
  participants:conversation_participants (user_id, profile:profiles(id, full_name, avatar_url)),
  messages (id, body, sender_id, created_at, read_at)
`;

function mapMessage(conversationId: string, row: ConversationRow['messages'][number]): Message {
  return {
    id: row.id,
    conversationId,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

function mapConversation(row: ConversationRow, myUserId: string): Conversation {
  const otherParticipant = row.participants.find((p) => p.user_id !== myUserId)?.profile;
  const heroId = row.car ? [...row.car.car_images].sort((a, b) => a.position - b.position)[0]?.url ?? '' : '';
  const messages = [...row.messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = messages[messages.length - 1];
  return {
    id: row.id,
    car: row.car
      ? { id: row.car.id, slug: row.car.slug, make: row.car.make, model: row.car.model, image: heroId ? unsplash(heroId, 240) : '' }
      : null,
    other: {
      id: otherParticipant?.id ?? '',
      name: otherParticipant?.full_name ?? 'CX user',
      avatar: otherParticipant?.avatar_url ?? '',
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

  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .in('id', ids);
  if (error) throw error;

  const mapped = (data as unknown as ConversationRow[]).map((row) => mapConversation(row, userId));
  return mapped.sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? '';
    const bt = b.lastMessage?.createdAt ?? '';
    return bt.localeCompare(at);
  });
}

export function useConversations(userId: string | undefined) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      return;
    }
    let cancelled = false;
    setConversations(null);
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

  return { conversations, error, loading: conversations === null && !error, refresh: () => setRefreshKey((k) => k + 1) };
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, body, sender_id, created_at, read_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapMessage(conversationId, row));
}

/** Loads a conversation's messages and subscribes to live INSERTs for the
 *  duration this hook is mounted — the thread updates without a manual
 *  refresh while it's open (see migration 0007 for the Realtime publication). */
export function useConversation(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[] | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setMessages(null);
      return;
    }
    let cancelled = false;
    setMessages(null);
    fetchMessages(conversationId).then((data) => {
      if (!cancelled) setMessages(data);
    });

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as ConversationRow['messages'][number];
          setMessages((prev) => (prev ? [...prev, mapMessage(conversationId, row)] : prev));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return { messages, loading: messages === null };
}

export async function sendMessage(conversationId: string, senderId: string, body: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, body });
  return { error: error?.message ?? null };
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
 *  calls — never a fake toast claiming a message was sent. */
export async function findOrCreateConversation(carId: string, myUserId: string, otherUserId: string): Promise<string> {
  const { data: mine, error: mineErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id, conversations!inner(car_id)')
    .eq('user_id', myUserId)
    .eq('conversations.car_id', carId);
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

export function useUnreadMessageCount(userId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    let cancelled = false;
    fetchUnreadCount(userId).then((n) => {
      if (!cancelled) setCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return count;
}
