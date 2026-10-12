import { supabase } from '../supabase';

/** The host and the renter scanned each other's CX Pass: the booking's handover is verified. */
export async function verifyHandover(bookingId: string, counterpartId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('verify_handover', { p_booking_id: bookingId, p_counterpart: counterpartId });
  return { error: error?.message ?? null };
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
