import { supabase } from '../supabase';

/** Filing a report — see supabase/migrations/0023_reports.sql. Available
 *  to any signed-in user; CarDetails.tsx is the current entry point. */
export async function createReport(carId: string, reason: string, message: string): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to report a listing.' };
  const { error } = await supabase.from('reports').insert({ reporter_id: user.id, car_id: carId, reason, message: message || null });
  return { error: error?.message ?? null };
}

/** The Owner Chat Monitor's "Report" action — same table, a conversation
 *  instead of a listing (migration 0025_owner_chat_monitor.sql added
 *  reports.conversation_id for exactly this). */
export async function createConversationReport(conversationId: string, reason: string, message: string): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in required.' };
  const { error } = await supabase.from('reports').insert({ reporter_id: user.id, conversation_id: conversationId, reason, message: message || null });
  return { error: error?.message ?? null };
}

export interface OwnerReport {
  id: string;
  reason: string;
  message: string | null;
  status: 'open' | 'resolved';
  createdAt: string;
  reporterName: string;
  carLabel: string | null;
  carSlug: string | null;
}

interface OwnerReportRow {
  id: string;
  reason: string;
  message: string | null;
  status: 'open' | 'resolved';
  created_at: string;
  reporter: { full_name: string | null } | null;
  car: { make: string; model: string; year: number; slug: string } | null;
}

const OWNER_REPORT_SELECT = `
  id, reason, message, status, created_at,
  reporter:profiles!reports_reporter_id_fkey (full_name),
  car:cars!reports_car_id_fkey (make, model, year, slug)
`;

export async function fetchReports(): Promise<OwnerReport[]> {
  const { data, error } = await supabase.from('reports').select(OWNER_REPORT_SELECT).order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as OwnerReportRow[]).map((r) => ({
    id: r.id,
    reason: r.reason,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    reporterName: r.reporter?.full_name || 'Unnamed user',
    carLabel: r.car ? `${r.car.year} ${r.car.make} ${r.car.model}` : null,
    carSlug: r.car?.slug ?? null,
  }));
}

export async function fetchOpenReportsCount(): Promise<number> {
  const { count } = await supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
  return count ?? 0;
}

export async function resolveReport(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('reports').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id);
  return { error: error?.message ?? null };
}
