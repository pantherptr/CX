import { supabase } from '../supabase';

export interface ChatReport {
  id: string;
  createdAt: string;
  status: 'open' | 'reviewed' | 'dismissed';
  reason: string;
  reporter: string;
  reported: string;
  reportedId: string;
  conversationId: string;
  messageBody: string | null;
  messageHasPhoto: boolean;
}

interface Row {
  id: string;
  created_at: string;
  status: ChatReport['status'];
  reason: string;
  reported_id: string;
  conversation_id: string;
  reporter: { full_name: string | null } | null;
  reported: { full_name: string | null } | null;
  message: { body: string; media_path: string | null; deleted_at: string | null } | null;
}

/** Owner / admins only (RLS on chat_reports). Needs migration 0104. */
export async function fetchChatReports(): Promise<{ data: ChatReport[]; error: string | null }> {
  const { data, error } = await supabase
    .from('chat_reports')
    .select(`id, created_at, status, reason, reported_id, conversation_id,
      reporter:profiles!chat_reports_reporter_id_fkey(full_name),
      reported:profiles!chat_reports_reported_id_fkey(full_name),
      message:messages(body, media_path, deleted_at)`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { data: [], error: error.message };
  return {
    error: null,
    data: (data as unknown as Row[]).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      status: r.status,
      reason: r.reason,
      reporter: r.reporter?.full_name || 'Someone',
      reported: r.reported?.full_name || 'Someone',
      reportedId: r.reported_id,
      conversationId: r.conversation_id,
      messageBody: r.message && !r.message.deleted_at ? r.message.body : null,
      messageHasPhoto: Boolean(r.message?.media_path),
    })),
  };
}

export async function setChatReportStatus(id: string, status: ChatReport['status']): Promise<{ error: string | null }> {
  const { error } = await supabase.from('chat_reports').update({ status }).eq('id', id);
  return { error: error ? error.message : null };
}
