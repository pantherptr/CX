import { supabase } from '../supabase';
import type { VerificationStatus } from './verification';
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
  createdAt: string;
}

interface AdminUserRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_host: boolean;
  is_admin: boolean;
  created_at: string;
}

export async function fetchAllUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, is_host, is_admin, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as AdminUserRow[]).map((r) => ({
    id: r.id,
    fullName: r.full_name || 'Unnamed user',
    avatarUrl: r.avatar_url,
    isHost: r.is_host,
    isAdmin: r.is_admin,
    createdAt: r.created_at,
  }));
}

export interface AdminVerification {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  licencePhotoPath: string | null;
  selfiePath: string | null;
  status: VerificationStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
}

interface AdminVerificationRow {
  id: string;
  user_id: string;
  licence_photo_path: string | null;
  selfie_path: string | null;
  status: VerificationStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  profile: { full_name: string | null; avatar_url: string | null } | null;
}

const VERIFICATION_SELECT =
  'id, user_id, licence_photo_path, selfie_path, status, submitted_at, reviewed_at, profile:profiles!verifications_user_id_fkey (full_name, avatar_url)';

function mapAdminVerification(row: AdminVerificationRow): AdminVerification {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.profile?.full_name || 'Unnamed user',
    userAvatar: row.profile?.avatar_url ?? null,
    licencePhotoPath: row.licence_photo_path,
    selfiePath: row.selfie_path,
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
  };
}

/** Submitted-but-undecided first (oldest first, so the queue drains in
 *  order), already-reviewed ones after — the admin page shows both, with
 *  pending at the top. */
export async function fetchAllVerifications(): Promise<AdminVerification[]> {
  const { data, error } = await supabase
    .from('verifications')
    .select(VERIFICATION_SELECT)
    .order('submitted_at', { ascending: true, nullsFirst: false });
  if (error) throw error;
  const rows = (data as unknown as AdminVerificationRow[]).map(mapAdminVerification);
  return rows.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return 0;
  });
}

/** Approves or rejects a submission. The status column is otherwise
 *  locked (see lock_verification_status_update in migration 0016) — this
 *  only succeeds because the RLS policy plus that trigger's is_admin()
 *  check both agree the caller is an admin. */
export async function reviewVerification(
  id: string,
  status: Extract<VerificationStatus, 'approved' | 'rejected'>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('verifications').update({ status }).eq('id', id);
  return { error: error?.message ?? null };
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

export interface AdminPlayer {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  cash: number;
  reputation: number;
  businessTier: number;
}

interface AdminPlayerRow {
  user_id: string;
  cash: number;
  reputation: number;
  business_tier: number;
  profile: { full_name: string | null; avatar_url: string | null } | null;
}

const ADMIN_PLAYER_SELECT =
  'user_id, cash, reputation, business_tier, profile:profiles!game_player_state_user_id_fkey (full_name, avatar_url)';

/** Every Luxury Car Empire player and their current cash/reputation/tier
 *  — only visible here via the "Admins view all Empire state" policy
 *  (0034_admin_grant_cash.sql); a regular player's own client only ever
 *  sees their own row. */
export async function fetchAllPlayers(): Promise<AdminPlayer[]> {
  const { data, error } = await supabase
    .from('game_player_state')
    .select(ADMIN_PLAYER_SELECT)
    .order('cash', { ascending: false });
  if (error) throw error;
  return (data as unknown as AdminPlayerRow[]).map((r) => ({
    userId: r.user_id,
    fullName: r.profile?.full_name || 'Unnamed user',
    avatarUrl: r.profile?.avatar_url ?? null,
    cash: Number(r.cash),
    reputation: r.reputation,
    businessTier: r.business_tier,
  }));
}

/** Adds to a player's Empire cash — see admin_grant_cash() in
 *  0034_admin_grant_cash.sql for why this goes through a dedicated RPC
 *  rather than a direct table update. */
export async function adminGrantCash(userId: string, amount: number): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_grant_cash', { p_user_id: userId, p_amount: amount });
  return { error: error?.message ?? null };
}

/** Sets a player's Empire cash to an exact value. */
export async function adminSetCash(userId: string, amount: number): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_cash', { p_user_id: userId, p_amount: amount });
  return { error: error?.message ?? null };
}
