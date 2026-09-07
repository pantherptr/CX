import { supabase } from '../supabase';
import type { Car } from '../../data/types';
import { uploadCarPhoto } from './cars';
import { apiUrl } from '../api';

/**
 * Data access exclusive to the platform Owner (see
 * supabase/migrations/0021_owner_control_center.sql and
 * src/pages/OwnerDashboard.tsx). Everything here relies on the
 * `public.is_owner()`-gated RLS policies that migration adds — a
 * non-owner calling any of these gets the same restricted rows (or a
 * silently-ineffective update) they'd get from the regular data layer.
 *
 * Where a capability already exists on the Admin dashboard's data layer
 * (users, bookings, verifications, basic car status) this file re-uses
 * `./admin` rather than duplicating it — is_admin() already includes the
 * Owner (see the migration), so those functions work unchanged here.
 */

// ---------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

/** Fire-and-forget from the caller's point of view — a logging failure
 *  must never block the actual action it's recording. */
export async function logOwnerAction(
  action: string,
  targetType: string,
  targetId: string | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('owner_audit_log')
    .insert({ actor_id: user.id, action, target_type: targetType, target_id: targetId, detail: detail ?? null });
  if (error) console.error('[owner] audit log write failed', error);
}

interface AuditLogRow {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  actor: { full_name: string | null } | null;
}

export async function fetchAuditLog(limit = 150): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('owner_audit_log')
    .select('id, action, target_type, target_id, detail, created_at, actor:profiles!owner_audit_log_actor_id_fkey (full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as AuditLogRow[]).map((r) => ({
    id: r.id,
    actorName: r.actor?.full_name || 'Owner',
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    detail: r.detail,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------
// Hosts
// ---------------------------------------------------------------------

export interface OwnerHost {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  suspended: boolean;
  carCount: number;
  createdAt: string;
}

interface OwnerHostRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  suspended: boolean;
  created_at: string;
  cars: { count: number }[];
}

export async function fetchAllHosts(): Promise<OwnerHost[]> {
  // profiles<->cars has two relationship paths PostgREST can't
  // disambiguate on its own — the direct cars.host_id fkey, and the
  // many-to-many one via favorites — so the fkey has to be named
  // explicitly here (cars!cars_host_id_fkey), not just `cars(count)`.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, phone, location, bio, suspended, created_at, cars!cars_host_id_fkey(count)')
    .eq('is_host', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as OwnerHostRow[]).map((r) => ({
    id: r.id,
    fullName: r.full_name || 'Unnamed host',
    avatarUrl: r.avatar_url,
    phone: r.phone,
    location: r.location,
    bio: r.bio,
    suspended: r.suspended,
    carCount: r.cars?.[0]?.count ?? 0,
    createdAt: r.created_at,
  }));
}

export async function setHostSuspended(hostId: string, suspended: boolean, hostName: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles').update({ suspended }).eq('id', hostId);
  if (!error) void logOwnerAction(suspended ? 'suspend_host' : 'unsuspend_host', 'host', hostId, { hostName });
  return { error: error?.message ?? null };
}

export interface HostProfilePatch {
  fullName?: string;
  bio?: string;
  phone?: string;
  location?: string;
}

export async function updateHostProfile(hostId: string, patch: HostProfilePatch): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: patch.fullName, bio: patch.bio, phone: patch.phone, location: patch.location })
    .eq('id', hostId);
  if (!error) void logOwnerAction('edit_host_profile', 'host', hostId, { ...patch });
  return { error: error?.message ?? null };
}

/** "Remove" a host — never a real account deletion (that's the user's own
 *  choice via Settings' delete-account flow, api/delete-account.ts).
 *  This suspends the account, revokes host status, and delists every car
 *  they have, all reversibly: nothing here destroys booking or payment
 *  history, and re-flipping is_host + suspended by hand would undo it. */
export async function removeHost(hostId: string, hostName: string): Promise<{ error: string | null }> {
  const [{ error: profileError }, { error: carsError }] = await Promise.all([
    supabase.from('profiles').update({ suspended: true, is_host: false }).eq('id', hostId),
    supabase.from('cars').update({ status: 'removed' }).eq('host_id', hostId),
  ]);
  const error = profileError?.message ?? carsError?.message ?? null;
  if (!error) void logOwnerAction('remove_host', 'host', hostId, { hostName });
  return { error };
}

// ---------------------------------------------------------------------
// Vehicles — full edit, beyond AdminDashboard's status-only control
// ---------------------------------------------------------------------

export interface OwnerCarDetail {
  id: string;
  slug: string;
  hostId: string;
  hostName: string;
  make: string;
  model: string;
  trim: string | null;
  year: number;
  category: Car['category'];
  city: string;
  location: string;
  pricePerDay: number;
  transmission: Car['transmission'];
  fuel: Car['fuel'];
  seats: number;
  doors: number;
  mileage: string | null;
  drive: string | null;
  description: string | null;
  features: string[];
  instantBook: boolean;
  status: 'draft' | 'published' | 'suspended' | 'removed';
}

const OWNER_CAR_DETAIL_SELECT = `
  id, slug, host_id, make, model, trim, year, category, city, location, price_per_day,
  transmission, fuel, seats, doors, mileage, drive, description, features, instant_book, status,
  host:profiles!cars_host_id_fkey (full_name)
`;

export async function fetchCarDetail(carId: string): Promise<OwnerCarDetail | null> {
  const { data, error } = await supabase.from('cars').select(OWNER_CAR_DETAIL_SELECT).eq('id', carId).single();
  if (error) throw error;
  const r = data as unknown as OwnerCarDetail & { price_per_day: number; instant_book: boolean; host_id: string; host: { full_name: string | null } | null };
  return {
    id: r.id,
    slug: r.slug,
    hostId: r.host_id,
    hostName: r.host?.full_name || 'Unnamed host',
    make: r.make,
    model: r.model,
    trim: r.trim,
    year: r.year,
    category: r.category,
    city: r.city,
    location: r.location,
    pricePerDay: Number(r.price_per_day),
    transmission: r.transmission,
    fuel: r.fuel,
    seats: r.seats,
    doors: r.doors,
    mileage: r.mileage,
    drive: r.drive,
    description: r.description,
    features: r.features,
    instantBook: r.instant_book,
    status: r.status,
  };
}

export type OwnerCarPatch = Partial<{
  make: string;
  model: string;
  trim: string | null;
  year: number;
  pricePerDay: number;
  city: string;
  location: string;
  description: string | null;
  features: string[];
  instantBook: boolean;
  seats: number;
  doors: number;
  mileage: string | null;
  drive: string | null;
}>;

export async function updateCarAsOwner(carId: string, patch: OwnerCarPatch): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = {};
  if (patch.make !== undefined) row.make = patch.make;
  if (patch.model !== undefined) row.model = patch.model;
  if (patch.trim !== undefined) row.trim = patch.trim;
  if (patch.year !== undefined) row.year = patch.year;
  if (patch.pricePerDay !== undefined) row.price_per_day = patch.pricePerDay;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.features !== undefined) row.features = patch.features;
  if (patch.instantBook !== undefined) row.instant_book = patch.instantBook;
  if (patch.seats !== undefined) row.seats = patch.seats;
  if (patch.doors !== undefined) row.doors = patch.doors;
  if (patch.mileage !== undefined) row.mileage = patch.mileage;
  if (patch.drive !== undefined) row.drive = patch.drive;

  const { error } = await supabase.from('cars').update(row).eq('id', carId);
  if (!error) void logOwnerAction('edit_vehicle', 'car', carId, patch as Record<string, unknown>);
  return { error: error?.message ?? null };
}

/** Approve (-> published), reject/pull back to draft, suspend (reversible
 *  hide) or remove (permanent delist) — never a real DELETE, see the
 *  migration's comment on why. */
export async function setCarStatusAsOwner(
  carId: string,
  status: OwnerCarDetail['status'],
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('cars').update({ status }).eq('id', carId);
  if (!error) void logOwnerAction('set_vehicle_status', 'car', carId, { status });
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------
// Vehicle photos
// ---------------------------------------------------------------------

export interface OwnerCarImage {
  id: string;
  url: string;
  position: number;
}

export async function fetchCarImages(carId: string): Promise<OwnerCarImage[]> {
  const { data, error } = await supabase.from('car_images').select('id, url, position').eq('car_id', carId).order('position');
  if (error) throw error;
  return data as OwnerCarImage[];
}

/** Uploaded under the Owner's own storage folder — the `car-photos`
 *  bucket's insert policy requires the path's first segment to equal
 *  auth.uid() (migration 0001), which for this call is the Owner, not
 *  the car's host. The row in car_images itself has no such restriction
 *  (see "Admins manage all car images"), so which folder the file
 *  physically lives under doesn't matter for who can see or manage it. */
export async function addCarImageAsOwner(ownerId: string, carId: string, file: File): Promise<{ error: string | null }> {
  try {
    const { url } = await uploadCarPhoto(ownerId, file);
    const { data: existing } = await supabase.from('car_images').select('position').eq('car_id', carId).order('position', { ascending: false }).limit(1);
    const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;
    const { error } = await supabase.from('car_images').insert({ car_id: carId, url, position: nextPosition });
    if (!error) void logOwnerAction('add_vehicle_photo', 'car', carId, {});
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Upload failed.' };
  }
}

function storagePathFromPublicUrl(url: string): string | null {
  const marker = '/car-photos/';
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

export async function deleteCarImage(carId: string, image: OwnerCarImage): Promise<{ error: string | null }> {
  const { error } = await supabase.from('car_images').delete().eq('id', image.id);
  if (error) return { error: error.message };
  const path = storagePathFromPublicUrl(image.url);
  if (path) await supabase.storage.from('car-photos').remove([path]);
  void logOwnerAction('delete_vehicle_photo', 'car', carId, {});
  return { error: null };
}

/** Swaps this image's position with its immediate neighbor in the given
 *  direction — a minimal, dependency-free reorder control (up/down
 *  arrows) rather than drag-and-drop. */
export async function moveCarImage(carId: string, imageId: string, direction: 'up' | 'down'): Promise<{ error: string | null }> {
  const images = await fetchCarImages(carId);
  const idx = images.findIndex((i) => i.id === imageId);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= images.length) return { error: null };
  const a = images[idx];
  const b = images[swapIdx];
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from('car_images').update({ position: b.position }).eq('id', a.id),
    supabase.from('car_images').update({ position: a.position }).eq('id', b.id),
  ]);
  return { error: e1?.message ?? e2?.message ?? null };
}

/** Moves one image to position 0 (the cover photo — see CarCard/
 *  CarDetails, which both render the lowest-position image first),
 *  shifting everything before it back by one to keep the rest in order. */
export async function setCoverPhoto(carId: string, imageId: string): Promise<{ error: string | null }> {
  const images = await fetchCarImages(carId);
  const idx = images.findIndex((i) => i.id === imageId);
  if (idx <= 0) return { error: null };
  const reordered = [images[idx], ...images.slice(0, idx), ...images.slice(idx + 1)];
  const updates = reordered.map((img, position) => supabase.from('car_images').update({ position }).eq('id', img.id));
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (!failed) void logOwnerAction('set_cover_photo', 'car', carId, {});
  return { error: failed?.error?.message ?? null };
}

// ---------------------------------------------------------------------
// Needs Attention — real operational signals, not invented metrics.
// Every count here is a query against a real table with a real
// consequence if ignored (a stuck deposit, an unreviewed ID, a pickup
// today) — nothing here is a placeholder or a static number.
// ---------------------------------------------------------------------

export interface AttentionItem {
  id: string;
  label: string;
  count: number;
  tone: 'danger' | 'warn' | 'info';
  tab: 'verifications' | 'bookings' | 'hosts' | 'reports';
}

export async function fetchNeedsAttention(): Promise<AttentionItem[]> {
  const today = new Date().toISOString().slice(0, 10);
  const [pendingVerifications, failedDeposits, suspendedHosts, pickupsToday, openReports] = await Promise.all([
    supabase.from('verifications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('deposit_status', 'failed'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_host', true).eq('suspended', true),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'confirmed').eq('start_date', today),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);

  const items: AttentionItem[] = [];
  if ((openReports.count ?? 0) > 0) {
    items.push({ id: 'reports', label: 'Reports waiting for review', count: openReports.count!, tone: 'danger', tab: 'reports' });
  }
  if ((pendingVerifications.count ?? 0) > 0) {
    items.push({ id: 'verifications', label: 'Identity verifications waiting for review', count: pendingVerifications.count!, tone: 'warn', tab: 'verifications' });
  }
  if ((failedDeposits.count ?? 0) > 0) {
    items.push({ id: 'deposits', label: 'Security deposits that failed to hold', count: failedDeposits.count!, tone: 'danger', tab: 'bookings' });
  }
  if ((suspendedHosts.count ?? 0) > 0) {
    items.push({ id: 'suspended', label: 'Hosts currently suspended', count: suspendedHosts.count!, tone: 'info', tab: 'hosts' });
  }
  if ((pickupsToday.count ?? 0) > 0) {
    items.push({ id: 'pickups', label: 'Pick-ups scheduled today', count: pickupsToday.count!, tone: 'info', tab: 'bookings' });
  }
  return items;
}

// ---------------------------------------------------------------------
// Global search — real queries across hosts, vehicles and bookings.
// Users search is folded into the hosts search (fetchAllHosts already
// covers every host; a platform-wide free-text user search beyond that
// would need email, which only auth.admin can read — out of scope for a
// client-side search box).
// ---------------------------------------------------------------------

export interface OwnerSearchResult {
  type: 'host' | 'vehicle' | 'booking';
  id: string;
  title: string;
  subtitle: string;
}

export async function searchPlatform(query: string): Promise<OwnerSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const [hosts, cars, bookings] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('is_host', true).ilike('full_name', like).limit(8),
    supabase.from('cars').select('id, slug, make, model, year').or(`make.ilike.${like},model.ilike.${like}`).limit(8),
    supabase.from('bookings').select('id, reference').ilike('reference', like).limit(8),
  ]);

  const results: OwnerSearchResult[] = [];
  for (const h of hosts.data ?? []) results.push({ type: 'host', id: h.id, title: h.full_name || 'Unnamed host', subtitle: 'Host' });
  for (const c of cars.data ?? []) results.push({ type: 'vehicle', id: c.id, title: `${c.year} ${c.make} ${c.model}`, subtitle: c.slug });
  for (const b of bookings.data ?? []) results.push({ type: 'booking', id: b.id, title: b.reference, subtitle: 'Booking' });
  return results;
}

// ---------------------------------------------------------------------
// Stripe balance — the platform's real available/pending funds (see
// api/owner-stripe-balance.ts for why this needs a server round-trip:
// the secret key that can call Stripe's Balance API never reaches the
// browser).
// ---------------------------------------------------------------------

export interface PlatformBalance {
  available: number;
  pending: number;
  currency: string;
}

export async function fetchPlatformBalance(): Promise<PlatformBalance | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  try {
    const res = await fetch(apiUrl('/api/owner-stripe-balance'), {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    // A plain `vite` dev server has no serverless runtime and serves this
    // route's raw source file instead of running it — content-type is
    // the one reliable signal that didn't actually happen, versus a real
    // failure response from Vercel (still valid JSON either way).
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Real gross revenue — every booking's total_price, excluding cancelled
 *  trips (nothing was ultimately collected/kept for those), and no longer
 *  for refunded ones either (see supabase/migrations/0026_booking_reservations.sql
 *  — refunded is a real, separate terminal state, not a flavor of
 *  cancelled). 'pending'/'payment_processing' holds are excluded too:
 *  nothing has actually been charged and kept yet at that point. There is
 *  no commission or host-payout split anywhere in this schema (every
 *  PaymentIntent goes straight to the platform's own Stripe account —
 *  see api/create-payment-intent.ts), so this figure IS the platform's
 *  earnings today; a separate "platform take" number would have to
 *  invent a commission rate that doesn't exist in the product. */
export async function fetchTotalRevenue(): Promise<number> {
  const { data, error } = await supabase.from('bookings').select('total_price, status').in('status', ['confirmed', 'completed']);
  if (error || !data) return 0;
  return data.reduce((sum, b) => sum + Number(b.total_price), 0);
}

/** Bookings currently in progress — start_date <= today <= end_date,
 *  status 'confirmed' (renamed from 'upcoming' in 0026 — same meaning;
 *  the schema still never introduces an 'active' status distinct from it,
 *  classifyBooking in lib/data/bookings.ts derives the same "active"
 *  phase client-side from these same dates). */
export async function fetchActiveRentalsCount(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .lte('start_date', today)
    .gte('end_date', today);
  return count ?? 0;
}
