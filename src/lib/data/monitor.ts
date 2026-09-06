import { supabase } from '../supabase';
import { logOwnerAction } from './owner';
import type { ParticipantRole } from './messages';

/**
 * Owner Chat Monitor — platform-wide read/moderate access to every
 * conversation, via the is_owner()-gated RLS added in
 * supabase/migrations/0025_owner_chat_monitor.sql. Deliberately separate
 * from lib/data/messages.ts: that file's model (exactly one "other"
 * participant, viewed from "my" side) doesn't fit a monitor showing
 * every conversation from a neutral third party's perspective, some of
 * which may have 3 participants once the Owner has intervened.
 */

export type ConversationStatus = 'active' | 'paused' | 'blocked' | 'closed';

export interface MonitorParticipant {
  id: string;
  name: string;
  avatar: string;
  role: ParticipantRole;
}

export interface MonitorConversation {
  id: string;
  status: ConversationStatus;
  carLabel: string | null;
  carSlug: string | null;
  participants: MonitorParticipant[];
  ownerIntervened: boolean;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  messageCount: number;
}

interface MonitorRow {
  id: string;
  status: ConversationStatus;
  car: { make: string; model: string; year: number; slug: string } | null;
  participants: {
    user_id: string;
    profile: { id: string; full_name: string | null; avatar_url: string | null; is_owner: boolean; is_admin: boolean; is_host: boolean };
  }[];
  messages: { body: string; created_at: string; sender_id: string }[];
}

const MONITOR_SELECT = `
  id, status,
  car:cars (make, model, year, slug),
  participants:conversation_participants (user_id, profile:profiles (id, full_name, avatar_url, is_owner, is_admin, is_host)),
  messages (body, created_at, sender_id)
`;

function roleFromFlags(flags: { is_owner: boolean; is_admin: boolean; is_host: boolean }): ParticipantRole {
  if (flags.is_owner) return 'owner';
  if (flags.is_admin) return 'admin';
  if (flags.is_host) return 'host';
  return 'client';
}

function mapMonitorRow(row: MonitorRow, ownerId: string): MonitorConversation {
  const messages = [...row.messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = messages[messages.length - 1];
  return {
    id: row.id,
    status: row.status,
    carLabel: row.car ? `${row.car.year} ${row.car.make} ${row.car.model}` : null,
    carSlug: row.car?.slug ?? null,
    participants: row.participants
      .filter((p) => p.user_id !== ownerId)
      .map((p) => ({ id: p.profile.id, name: p.profile.full_name || 'Unnamed user', avatar: p.profile.avatar_url ?? '', role: roleFromFlags(p.profile) })),
    ownerIntervened: row.participants.some((p) => p.user_id === ownerId),
    lastMessageBody: last?.body ?? null,
    lastMessageAt: last?.created_at ?? null,
    messageCount: messages.length,
  };
}

export async function fetchAllConversationsForMonitor(): Promise<MonitorConversation[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('conversations').select(MONITOR_SELECT).order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  const mapped = (data as unknown as MonitorRow[]).map((row) => mapMonitorRow(row, user?.id ?? ''));
  return mapped.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
}

export async function setConversationStatus(conversationId: string, status: ConversationStatus): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('conversations')
    .update({ status, status_changed_by: user?.id ?? null, status_changed_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (!error) void logOwnerAction(`conversation_${status}`, 'conversation', conversationId, {});
  return { error: error?.message ?? null };
}

/** Adds the Owner as a real, visible participant in this conversation —
 *  not a silent observer. Their own messages already show the Owner/
 *  Owner Assistant badge (sender_role) once they send one; this is what
 *  makes them able to send into a thread they weren't originally part
 *  of. A no-op (no error) if they've already intervened. */
export async function intervene(conversationId: string, ownerId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('conversation_participants')
    .upsert({ conversation_id: conversationId, user_id: ownerId }, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
  if (!error) void logOwnerAction('intervene_conversation', 'conversation', conversationId, {});
  return { error: error?.message ?? null };
}
