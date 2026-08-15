import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { unsplash } from '../img';

/**
 * Live bookings data-access layer. Pricing, the host on the booking, and
 * the booking reference are all computed server-side (see
 * supabase/migrations/0003_bookings_integrity.sql`'s `prepare_booking`
 * trigger) — this layer never sends those values, only what the renter
 * actually chose (car, dates, pickup location).
 *
 * Double-booking is prevented at the database level with an exclusion
 * constraint, not just the pre-flight `checkAvailability` check here —
 * that check is a UX nicety, the constraint is what's actually safe
 * against two concurrent requests.
 */

export interface BookingCar {
  id: string;
  slug: string;
  make: string;
  model: string;
  trim?: string;
  year: number;
  image: string;
  location: string;
  pricePerDay: number;
}

export interface BookingHost {
  id: string;
  name: string;
  avatar: string;
  responseTime: string;
}

export interface BookingRenter {
  id: string;
  name: string;
  avatar: string;
}

export type FareTier = 'standard' | 'flexible';

export interface BookingExtra {
  id: string;
  code: string;
  name: string;
  icon: string;
  unitPrice: number;
  quantity: number;
}

/** A selectable extra from the catalogue — the price shown here is the
 *  per-unit rate; per-day extras get multiplied by trip length once a
 *  booking exists (see `prepare_booking_extra` in migration 0005). */
export interface Extra {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  priceModel: 'flat' | 'per_day';
  icon: string;
}

export interface Booking {
  id: string;
  reference: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  totalPrice: number;
  protectionAddon: boolean;
  pickupLocation: string | null;
  fareTier: FareTier;
  extras: BookingExtra[];
  agreementAcceptedAt: string | null;
  createdAt: string;
  car: BookingCar;
  host: BookingHost;
  renter: BookingRenter;
}

/** The DB only tracks upcoming/completed/cancelled; "active" (the trip is
 *  happening right now) and a stale "upcoming" whose end date has already
 *  passed are refined here from today's date rather than needing a
 *  background job to flip statuses. */
export type TripPhase = 'upcoming' | 'active' | 'completed' | 'cancelled';

export function classifyBooking(b: Pick<Booking, 'status' | 'startDate' | 'endDate'>): TripPhase {
  if (b.status === 'cancelled') return 'cancelled';
  if (b.status === 'completed') return 'completed';
  const today = new Date().toISOString().slice(0, 10);
  if (b.endDate < today) return 'completed';
  if (b.startDate <= today) return 'active';
  return 'upcoming';
}

/** A renter's trust tier, derived purely from their own completed trip
 *  count — never stored, so it can't drift out of sync with reality. */
export type RenterTier = 'Explorer' | 'Frequent renter' | 'Road veteran';

export function renterTier(completedCount: number): RenterTier | null {
  if (completedCount >= 15) return 'Road veteran';
  if (completedCount >= 5) return 'Frequent renter';
  if (completedCount >= 1) return 'Explorer';
  return null;
}

interface BookingExtraRow {
  quantity: number;
  unit_price: number;
  extra: {
    id: string;
    code: string;
    name: string;
    icon: string;
  };
}

interface BookingRow {
  id: string;
  reference: string;
  start_date: string;
  end_date: string;
  status: Booking['status'];
  total_price: number;
  protection_addon: boolean;
  pickup_location: string | null;
  fare_tier: FareTier;
  booking_extras: BookingExtraRow[];
  agreement_accepted_at: string | null;
  created_at: string;
  car: {
    id: string;
    slug: string;
    make: string;
    model: string;
    trim: string | null;
    year: number;
    location: string;
    price_per_day: number;
    car_images: { url: string; position: number }[];
  };
  host: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    response_time: string | null;
  };
  renter: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

const BOOKING_SELECT = `
  id, reference, start_date, end_date, status, total_price, protection_addon, pickup_location, fare_tier, agreement_accepted_at, created_at,
  car:cars!bookings_car_id_fkey (id, slug, make, model, trim, year, location, price_per_day, car_images(url, position)),
  host:profiles!bookings_host_id_fkey (id, full_name, avatar_url, response_time),
  renter:profiles!bookings_renter_id_fkey (id, full_name, avatar_url),
  booking_extras (quantity, unit_price, extra:extras_catalog (id, code, name, icon))
`;

function mapBooking(row: BookingRow): Booking {
  const heroId = [...row.car.car_images].sort((a, b) => a.position - b.position)[0]?.url ?? '';
  const heroImage = heroId ? unsplash(heroId, 700) : '';
  return {
    id: row.id,
    reference: row.reference,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    totalPrice: Number(row.total_price),
    protectionAddon: row.protection_addon,
    pickupLocation: row.pickup_location,
    fareTier: row.fare_tier,
    agreementAcceptedAt: row.agreement_accepted_at,
    extras: (row.booking_extras ?? []).map((be) => ({
      id: be.extra.id,
      code: be.extra.code,
      name: be.extra.name,
      icon: be.extra.icon,
      unitPrice: Number(be.unit_price),
      quantity: be.quantity,
    })),
    createdAt: row.created_at,
    car: {
      id: row.car.id,
      slug: row.car.slug,
      make: row.car.make,
      model: row.car.model,
      trim: row.car.trim ?? undefined,
      year: row.car.year,
      image: heroImage,
      location: row.car.location,
      pricePerDay: Number(row.car.price_per_day),
    },
    host: {
      id: row.host.id,
      name: row.host.full_name ?? 'CX host',
      avatar: row.host.avatar_url ?? '',
      responseTime: row.host.response_time ?? '',
    },
    renter: {
      id: row.renter.id,
      name: row.renter.full_name ?? 'CX renter',
      avatar: row.renter.avatar_url ?? '',
    },
  };
}

export async function fetchMyBookings(userId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('renter_id', userId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data as unknown as BookingRow[]).map(mapBooking);
}

export async function fetchHostBookings(hostId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('host_id', hostId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data as unknown as BookingRow[]).map(mapBooking);
}

export async function fetchBookingById(id: string): Promise<Booking | null> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapBooking(data as unknown as BookingRow);
}

interface ExtraRow {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  price_model: 'flat' | 'per_day';
  icon: string;
}

function mapExtra(row: ExtraRow): Extra {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    priceModel: row.price_model,
    icon: row.icon,
  };
}

export async function fetchExtrasCatalog(): Promise<Extra[]> {
  const { data, error } = await supabase
    .from('extras_catalog')
    .select('id, code, name, description, price, price_model, icon')
    .eq('active', true);
  if (error) throw error;
  return (data as unknown as ExtraRow[]).map(mapExtra);
}

export function useExtrasCatalog() {
  const [extras, setExtras] = useState<Extra[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchExtrasCatalog()
      .then((data) => {
        if (!cancelled) setExtras(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load extras.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { extras, error, loading: extras === null && !error };
}

/** Pre-flight UX check — the exclusion constraint is the real guarantee.
 *  `excludeBookingId` lets a booking being modified check availability
 *  without colliding with its own current row. */
export async function checkAvailability(
  carId: string,
  startDate: string,
  endDate: string,
  excludeBookingId?: string,
): Promise<boolean> {
  let query = supabase
    .from('bookings')
    .select('id')
    .eq('car_id', carId)
    .neq('status', 'cancelled')
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .limit(1);
  if (excludeBookingId) query = query.neq('id', excludeBookingId);
  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) === 0;
}

export interface BookedRange {
  startDate: string;
  endDate: string;
}

/** Real booked date ranges for a car, via the `car_booked_ranges` security-
 *  definer function (migration 0009) — bookings' own RLS hides renter
 *  identity/price from anyone but the renter/host, so a plain SELECT here
 *  would silently return nothing for a browsing customer. This function
 *  exposes only the dates, nothing else. */
export async function fetchBookedRanges(carId: string): Promise<BookedRange[]> {
  const { data, error } = await supabase.rpc('car_booked_ranges', { p_car_id: carId });
  if (error) throw error;
  return (data ?? []).map((r: { start_date: string; end_date: string }) => ({
    startDate: r.start_date,
    endDate: r.end_date,
  }));
}

export function useBookedRanges(carId: string | null) {
  const [ranges, setRanges] = useState<BookedRange[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!carId) {
      setRanges(null);
      return;
    }
    let cancelled = false;
    setRanges(null);
    setError(null);
    fetchBookedRanges(carId)
      .then((data) => {
        if (!cancelled) setRanges(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load availability.');
      });
    return () => {
      cancelled = true;
    };
  }, [carId]);

  return { ranges, error, loading: ranges === null && !error };
}

/** Bulk version for Browse's date filter — one round trip for every
 *  candidate car instead of N. Same narrow date-only exposure. */
export async function fetchBookedRangesBulk(carIds: string[]): Promise<Map<string, BookedRange[]>> {
  const map = new Map<string, BookedRange[]>();
  if (carIds.length === 0) return map;
  const { data, error } = await supabase.rpc('car_booked_ranges_bulk', { p_car_ids: carIds });
  if (error) throw error;
  for (const r of (data ?? []) as { car_id: string; start_date: string; end_date: string }[]) {
    const existing = map.get(r.car_id) ?? [];
    existing.push({ startDate: r.start_date, endDate: r.end_date });
    map.set(r.car_id, existing);
  }
  return map;
}

/** Does `[startDate, endDate]` overlap any range in `ranges`? Both ends
 *  inclusive, matching the DB's `daterange(..., '[]')` exclusion constraint. */
export function rangesOverlap(startDate: string, endDate: string, ranges: BookedRange[]): boolean {
  return ranges.some((r) => startDate <= r.endDate && endDate >= r.startDate);
}

export interface CreateBookingInput {
  carId: string;
  renterId: string;
  startDate: string;
  endDate: string;
  pickupLocation: string;
  protectionAddon?: boolean;
  fareTier?: FareTier;
  extraIds?: string[];
}

const OVERLAP_MESSAGE =
  'These dates are no longer available for this car — someone just booked over them. Please choose different dates.';

export async function createBooking(
  input: CreateBookingInput,
): Promise<{ booking: Booking | null; error: string | null; extrasError?: string }> {
  const { data, error } = await supabase
    .from('bookings')
    // host_id, total_price and reference are deliberately omitted — the
    // prepare_booking trigger computes and overwrites them server-side.
    .insert({
      car_id: input.carId,
      renter_id: input.renterId,
      start_date: input.startDate,
      end_date: input.endDate,
      pickup_location: input.pickupLocation,
      protection_addon: input.protectionAddon ?? true,
      fare_tier: input.fareTier ?? 'standard',
    })
    .select(BOOKING_SELECT)
    .single();

  if (error) {
    if (error.code === '23P01') {
      return { booking: null, error: OVERLAP_MESSAGE };
    }
    return { booking: null, error: error.message };
  }

  let booking = mapBooking(data as unknown as BookingRow);

  // Extras are inserted in a follow-up call — unit_price is computed
  // server-side by the booking_extras_prepare trigger from the real
  // catalogue price, and an AFTER INSERT trigger folds it into
  // total_price. Re-fetch so the returned record reflects that total.
  if (input.extraIds && input.extraIds.length > 0) {
    const { error: extrasError } = await supabase
      .from('booking_extras')
      .insert(input.extraIds.map((extraId) => ({ booking_id: booking.id, extra_id: extraId })));
    if (extrasError) {
      return { booking, error: null, extrasError: extrasError.message };
    }
    const refreshed = await fetchBookingById(booking.id);
    if (refreshed) booking = refreshed;
  }

  return { booking, error: null };
}

export async function modifyBookingDates(
  id: string,
  startDate: string,
  endDate: string,
): Promise<{ booking: Booking | null; error: string | null }> {
  const { data, error } = await supabase
    .from('bookings')
    // total_price is recomputed server-side by the
    // bookings_recompute_on_date_change trigger — never sent from here.
    .update({ start_date: startDate, end_date: endDate })
    .eq('id', id)
    .select(BOOKING_SELECT)
    .single();

  if (error) {
    if (error.code === '23P01') {
      return { booking: null, error: OVERLAP_MESSAGE };
    }
    return { booking: null, error: error.message };
  }
  return { booking: mapBooking(data as unknown as BookingRow), error: null };
}

export async function cancelBooking(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
  return { error: error?.message ?? null };
}

export async function acceptRentalAgreement(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('bookings')
    .update({ agreement_accepted_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error?.message ?? null };
}

export function useMyBookings(userId: string | undefined) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setBookings([]);
      return;
    }
    let cancelled = false;
    setBookings(null);
    setError(null);
    fetchMyBookings(userId)
      .then((data) => {
        if (!cancelled) setBookings(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your trips.');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { bookings, error, loading: bookings === null && !error };
}

export function useHostBookings(hostId: string | undefined) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hostId) {
      setBookings([]);
      return;
    }
    let cancelled = false;
    setBookings(null);
    setError(null);
    fetchHostBookings(hostId)
      .then((data) => {
        if (!cancelled) setBookings(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load bookings.');
      });
    return () => {
      cancelled = true;
    };
  }, [hostId]);

  return { bookings, error, loading: bookings === null && !error };
}
