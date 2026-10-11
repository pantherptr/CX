import { supabase } from '../supabase';
import type { DocStatus, IdDocType } from './verification';
import type { BookingStatus } from './bookings';
import { apiUrl } from '../api';

/**
 * Data access for the admin dashboard (see src/pages/AdminDashboard.tsx
 * and supabase/migrations/0016_admin_panel.sql). Every query here relies
 * on the "Admins view/update all ..." RLS policies added in that
 * migration — a non-admin calling any of these gets the same
 * renter/host-scoped rows (or an update that silently affects nothing)
 * they'd get from the regular data-access layer, never an error that
 * reveals whether the admin policy exists.
 */

export interface AdminUser {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  isHost: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isVerifiedClient: boolean;
  createdAt: string;
}

interface AdminUserRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_host: boolean;
  is_admin: boolean;
  is_owner: boolean;
  is_verified_client: boolean;
  created_at: string;
}

export async function fetchAllUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, is_host, is_admin, is_owner, is_verified_client, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as AdminUserRow[]).map((r) => ({
    id: r.id,
    fullName: r.full_name || 'Unnamed user',
    avatarUrl: r.avatar_url,
    isHost: r.is_host,
    isAdmin: r.is_admin,
    isOwner: Boolean(r.is_owner),
    isVerifiedClient: r.is_verified_client,
    createdAt: r.created_at,
  }));
}

export interface AdminBooking {
  id: string;
  reference: string;
  status: BookingStatus;
  stripePaymentIntentId: string | null;
  startDate: string;
  endDate: string;
  totalPrice: number;
  carLabel: string;
  renterName: string;
  hostName: string;
  createdAt: string;
  fulfillmentType: 'pickup' | 'delivery';
  deliveryAddress: string | null;
  /** See supabase/migrations/0019_security_deposit.sql — 'not_required'
   *  for bookings placed before the deposit feature shipped or priced
   *  under the deposit floor; 'failed' is the one value that needs an
   *  admin's attention (no hold could be placed, e.g. a non-holdable
   *  card), the others are informational. */
  depositStatus: 'not_required' | 'held' | 'failed' | 'released' | 'captured';
}

interface AdminBookingRow {
  id: string;
  reference: string;
  status: AdminBooking['status'];
  start_date: string;
  end_date: string;
  total_price: number;
  created_at: string;
  deposit_status: AdminBooking['depositStatus'];
  stripe_payment_intent_id: string | null;
  fulfillment_type: 'pickup' | 'delivery';
  delivery_address: string | null;
  car: { make: string; model: string; year: number } | null;
  renter: { full_name: string | null } | null;
  host: { full_name: string | null } | null;
}

const ADMIN_BOOKING_SELECT = `
  id, reference, status, start_date, end_date, total_price, created_at, deposit_status, stripe_payment_intent_id, fulfillment_type, delivery_address,
  car:cars!bookings_car_id_fkey (make, model, year),
  renter:profiles!bookings_renter_id_fkey (full_name),
  host:profiles!bookings_host_id_fkey (full_name)
`;

export async function fetchAllBookingsAdmin(): Promise<AdminBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(ADMIN_BOOKING_SELECT)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as AdminBookingRow[]).map((r) => ({
    id: r.id,
    reference: r.reference,
    status: r.status,
    stripePaymentIntentId: r.stripe_payment_intent_id,
    startDate: r.start_date,
    endDate: r.end_date,
    totalPrice: Number(r.total_price),
    carLabel: r.car ? `${r.car.year} ${r.car.make} ${r.car.model}` : 'Unknown car',
    renterName: r.renter?.full_name || 'Unnamed renter',
    hostName: r.host?.full_name || 'Unnamed host',
    createdAt: r.created_at,
    depositStatus: r.deposit_status,
    fulfillmentType: r.fulfillment_type,
    deliveryAddress: r.delivery_address,
  }));
}

/** Cancels any booking — this is the *same* update the renter/host-facing
 *  cancelBooking() in bookings.ts performs; it works here for a booking
 *  the caller doesn't own only because api/cancel-booking.ts itself
 *  checks is_admin/is_owner, so there's no separate admin-only code path
 *  to keep in sync with the regular one. */
export { cancelBooking as adminCancelBooking } from './bookings';

/** Owner/Admin-only real Stripe refund — see api/refund-booking.ts for
 *  why this is a deliberate, separate action from cancellation rather
 *  than something cancelling ever does automatically. */
export async function refundBookingAdmin(bookingId: string): Promise<{ error: string | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: 'Sign in required.' };
  try {
    const res = await fetch(apiUrl('/api/refund-booking'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ bookingId }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: body?.error ?? 'Could not issue this refund.' };
    return { error: null };
  } catch {
    return { error: 'Could not reach the server — please try again.' };
  }
}

export interface AdminCar {
  id: string;
  slug: string;
  label: string;
  /** 'suspended'/'removed' (see supabase/migrations/0021_owner_control_center.sql)
   *  only ever come from the Owner Control Center's richer controls — this
   *  plain admin view still only toggles between draft/published, but
   *  renders whichever status a car actually has. */
  status: 'draft' | 'published' | 'suspended' | 'removed';
  pricePerDay: number;
  hostName: string;
  createdAt: string;
}

interface AdminCarRow {
  id: string;
  slug: string;
  make: string;
  model: string;
  year: number;
  status: AdminCar['status'];
  price_per_day: number;
  created_at: string;
  host: { full_name: string | null } | null;
}

const ADMIN_CAR_SELECT = `
  id, slug, make, model, year, status, price_per_day, created_at,
  host:profiles!cars_host_id_fkey (full_name)
`;

export async function fetchAllCarsAdmin(): Promise<AdminCar[]> {
  const { data, error } = await supabase
    .from('cars')
    .select(ADMIN_CAR_SELECT)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as AdminCarRow[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    label: `${r.year} ${r.make} ${r.model}`,
    status: r.status,
    pricePerDay: Number(r.price_per_day),
    hostName: r.host?.full_name || 'Unnamed host',
    createdAt: r.created_at,
  }));
}

/** Publishes or pulls a listing — the same moderation lever a host has
 *  over their own car, usable here on anyone's via the "Admins update
 *  all cars" policy. */
export async function adminSetCarStatus(id: string, status: 'draft' | 'published'): Promise<{ error: string | null }> {
  const { error } = await supabase.from('cars').update({ status }).eq('id', id);
  return { error: error?.message ?? null };
}


// ---------------------------------------------------------------------------
// Verification queue v2 (migration 0106): identity and driving licence are reviewed separately.
// ---------------------------------------------------------------------------

export interface VerificationCase {
  userId: string;
  userName: string;
  userAvatar: string | null;
  docType: IdDocType | null;
  identityStatus: DocStatus;
  identityReason: string | null;
  identityFront: string | null;
  identityBack: string | null;
  selfie: string | null;
  identitySubmittedAt: string | null;
  licenceStatus: DocStatus;
  licenceReason: string | null;
  licenceFront: string | null;
  licenceBack: string | null;
  licenceSubmittedAt: string | null;
}

interface CaseRow {
  user_id: string;
  identity_doc_type: IdDocType | null;
  identity_status: DocStatus;
  identity_reason: string | null;
  identity_front_path: string | null;
  identity_back_path: string | null;
  selfie_path: string | null;
  identity_submitted_at: string | null;
  licence_status: DocStatus;
  licence_reason: string | null;
  licence_photo_path: string | null;
  licence_back_path: string | null;
  licence_submitted_at: string | null;
  profile: { full_name: string | null; avatar_url: string | null } | null;
}

export async function fetchVerificationCases(): Promise<VerificationCase[]> {
  const { data, error } = await supabase
    .from('verifications')
    .select(
      'user_id, identity_doc_type, identity_status, identity_reason, identity_front_path, identity_back_path, selfie_path, identity_submitted_at, licence_status, licence_reason, licence_photo_path, licence_back_path, licence_submitted_at, profile:profiles!verifications_user_id_fkey (full_name, avatar_url)',
    )
    .or('identity_status.neq.none,licence_status.neq.none')
    .limit(300);
  if (error) throw error;
  const rows = (data as unknown as CaseRow[]).map<VerificationCase>((r) => ({
    userId: r.user_id,
    userName: r.profile?.full_name || 'Unnamed user',
    userAvatar: r.profile?.avatar_url ?? null,
    docType: r.identity_doc_type,
    identityStatus: r.identity_status,
    identityReason: r.identity_reason,
    identityFront: r.identity_front_path,
    identityBack: r.identity_back_path,
    selfie: r.selfie_path,
    identitySubmittedAt: r.identity_submitted_at,
    licenceStatus: r.licence_status,
    licenceReason: r.licence_reason,
    licenceFront: r.licence_photo_path,
    licenceBack: r.licence_back_path,
    licenceSubmittedAt: r.licence_submitted_at,
  }));
  const waiting = (c: VerificationCase) => c.identityStatus === 'pending' || c.licenceStatus === 'pending';
  const when = (c: VerificationCase) => Math.min(
    ...[c.identitySubmittedAt, c.licenceSubmittedAt].filter(Boolean).map((d) => new Date(d as string).getTime()),
    Number.MAX_SAFE_INTEGER,
  );
  return rows.sort((a, b) => (waiting(a) === waiting(b) ? when(a) - when(b) : waiting(a) ? -1 : 1));
}

/** Approve or reject one part of someone's verification; a rejection must say why (the person receives it as a message from CX). */
export async function decideVerification(
  userId: string,
  kind: 'identity' | 'licence',
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_verification', {
    p_user_id: userId,
    p_kind: kind,
    p_decision: decision,
    p_reason: reason ?? null,
  });
  return { error: error ? error.message : null };
}
