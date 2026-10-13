import { supabase } from '../supabase';
import { apiUrl } from '../api';

/** The host and the renter scanned each other's CX Pass: the booking's handover is verified. */
export async function verifyHandover(bookingId: string, counterpartId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('verify_handover', { p_booking_id: bookingId, p_counterpart: counterpartId });
  return { error: error?.message ?? null };
}

/** Minutes during which a scan can still be taken back (and the payout is held). */
export const UNDO_WINDOW_MS = 5 * 60_000;

/** The scan was a mistake: take it back (only the person who scanned, inside the window, before any payout). */
export async function undoScan(bookingId: string, kind: 'pickup' | 'return'): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('undo_handover', { p_booking_id: bookingId, p_kind: kind });
  return { error: error?.message ?? null };
}

/** The handover is verified: ask the server to release the host's payout (it re-checks everything). The
 *  server holds it for the 5-minute undo window and says how long to wait; this waits and asks once more. */
export async function releasePayoutAfterHandover(bookingId: string, attempt = 0): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(apiUrl('/api/notify-message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ type: 'handover-payout', bookingId }),
    });
    const body = (await res.json().catch(() => null)) as { result?: string; retryInSeconds?: number } | null;
    if (body?.result === 'waiting' && attempt < 2) {
      window.setTimeout(() => void releasePayoutAfterHandover(bookingId, attempt + 1), Math.min(400, body.retryInSeconds ?? 300) * 1000);
    }
  } catch (err) {
    console.error('[handover] payout release failed', err);
  }
}

/** The return: the second scan, closing the trip. */
export async function verifyReturn(bookingId: string, counterpartId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('verify_return', { p_booking_id: bookingId, p_counterpart: counterpartId });
  return { error: error?.message ?? null };
}

export interface HandoverState {
  /** When the trip started (pickup scan), or null. */
  pickupAt: string | null;
  /** When the trip was closed (return scan), or null. */
  returnAt: string | null;
  /** Who scanned at pickup / at return (null before 0122 is run). */
  pickupBy?: string | null;
  returnBy?: string | null;
}

export async function fetchHandoverState(bookingId: string): Promise<HandoverState> {
  const { data, error } = await supabase.rpc('booking_handover_state', { p_booking_id: bookingId });
  const row = (data as { pickup_at: string | null; return_at: string | null; pickup_by?: string | null; return_by?: string | null }[] | null)?.[0];
  if (error || !row) return { pickupAt: null, returnAt: null };
  return { pickupAt: row.pickup_at, returnAt: row.return_at, pickupBy: row.pickup_by ?? null, returnBy: row.return_by ?? null };
}

export async function isHandoverVerified(bookingId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('booking_handover_verified', { p_booking_id: bookingId });
  return !error && data === true;
}

export async function fetchVerifiedHandoversCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('verified_handovers_count', { p_user: userId });
  return error ? 0 : (data as number) ?? 0;
}

/** The profile id inside a scanned CX Pass link, or null if it is not one of ours. */
export function profileIdFromPassUrl(text: string): string | null {
  const m = text.match(/\/signal\/profile\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1].toLowerCase() : null;
}
