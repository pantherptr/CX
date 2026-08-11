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

export interface Booking {
  id: string;
  reference: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  totalPrice: number;
  protectionAddon: boolean;
  pickupLocation: string | null;
  createdAt: string;
  car: BookingCar;
  host: BookingHost;
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

interface BookingRow {
  id: string;
  reference: string;
  start_date: string;
  end_date: string;
  status: Booking['status'];
  total_price: number;
  protection_addon: boolean;
  pickup_location: string | null;
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
}

const BOOKING_SELECT = `
  id, reference, start_date, end_date, status, total_price, protection_addon, pickup_location, created_at,
  car:cars!bookings_car_id_fkey (id, slug, make, model, trim, year, location, price_per_day, car_images(url, position)),
  host:profiles!bookings_host_id_fkey (id, full_name, avatar_url, response_time)
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
      name: row.host.full_name ?? 'Velora host',
      avatar: row.host.avatar_url ?? '',
      responseTime: row.host.response_time ?? '',
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

export async function fetchBookingById(id: string): Promise<Booking | null> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapBooking(data as unknown as BookingRow);
}

/** Pre-flight UX check — the exclusion constraint is the real guarantee. */
export async function checkAvailability(carId: string, startDate: string, endDate: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('car_id', carId)
    .neq('status', 'cancelled')
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) === 0;
}

export interface CreateBookingInput {
  carId: string;
  renterId: string;
  startDate: string;
  endDate: string;
  pickupLocation: string;
  protectionAddon?: boolean;
}

export async function createBooking(
  input: CreateBookingInput,
): Promise<{ booking: Booking | null; error: string | null }> {
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
    })
    .select(BOOKING_SELECT)
    .single();

  if (error) {
    if (error.code === '23P01') {
      return {
        booking: null,
        error: 'These dates are no longer available for this car — someone just booked over them. Please choose different dates.',
      };
    }
    return { booking: null, error: error.message };
  }
  return { booking: mapBooking(data as unknown as BookingRow), error: null };
}

export async function cancelBooking(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
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
