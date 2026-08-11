import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { Car, Host, Review } from '../../data/types';

/**
 * Live data-access layer, backed by Supabase. Every fetcher maps DB rows
 * onto the exact same `Car`/`Host`/`Review` shapes the mock data used
 * (src/data/types.ts) — so CarCard, HostCard, BookingCard etc. needed zero
 * changes to consume real data instead of the seed arrays.
 */

interface CarImageRow {
  url: string;
  position: number;
}

interface ReviewRow {
  id: string;
  rating: number;
  body: string;
  author_name: string;
  author_avatar_url: string | null;
  author_location: string | null;
  created_at: string;
}

interface HostRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  joined: string | null;
  rating: number;
  trips: number;
  response_time: string | null;
  response_rate: number | null;
  verified: boolean;
  is_superhost: boolean;
}

interface CarRow {
  id: string;
  slug: string;
  host_id: string;
  make: string;
  model: string;
  trim: string | null;
  year: number;
  category: Car['category'];
  city: string;
  location: string;
  price_per_day: number;
  transmission: Car['transmission'];
  fuel: Car['fuel'];
  seats: number;
  doors: number;
  mileage: string | null;
  drive: string | null;
  description: string | null;
  features: string[];
  instant_book: boolean;
  rating: number;
  trips: number;
  car_images: CarImageRow[];
  reviews: ReviewRow[];
}

const CAR_SELECT = '*, car_images(url, position), reviews(*)';

const reviewDate = (iso: string) =>
  new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(iso));

function mapReview(row: ReviewRow): Review {
  return {
    id: row.id,
    author: row.author_name,
    avatar: row.author_avatar_url ?? '',
    location: row.author_location ?? '',
    rating: Number(row.rating),
    date: reviewDate(row.created_at),
    body: row.body,
  };
}

function mapCar(row: CarRow): Car {
  return {
    id: row.id,
    slug: row.slug,
    make: row.make,
    model: row.model,
    trim: row.trim ?? undefined,
    year: row.year,
    category: row.category,
    location: row.location,
    city: row.city,
    pricePerDay: Number(row.price_per_day),
    rating: Number(row.rating),
    trips: row.trips,
    instantBook: row.instant_book,
    transmission: row.transmission,
    fuel: row.fuel,
    seats: row.seats,
    doors: row.doors,
    mileage: row.mileage ?? '',
    drive: row.drive ?? '',
    images: [...row.car_images].sort((a, b) => a.position - b.position).map((i) => i.url),
    features: row.features ?? [],
    description: row.description ?? '',
    hostId: row.host_id,
    reviews: (row.reviews ?? []).map(mapReview),
  };
}

function mapHost(row: HostRow): Host {
  return {
    id: row.id,
    name: row.full_name ?? 'Velora host',
    avatar: row.avatar_url ?? '',
    joined: row.joined ?? '',
    rating: Number(row.rating),
    trips: row.trips,
    responseTime: row.response_time ?? '',
    responseRate: row.response_rate ?? 0,
    verified: row.verified,
    isSuperhost: row.is_superhost,
    bio: row.bio ?? '',
  };
}

export async function fetchCars(): Promise<Car[]> {
  const { data, error } = await supabase
    .from('cars')
    .select(CAR_SELECT)
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as CarRow[]).map(mapCar);
}

export async function fetchFeaturedCars(limit = 8): Promise<Car[]> {
  const { data, error } = await supabase
    .from('cars')
    .select(CAR_SELECT)
    .eq('status', 'published')
    .order('rating', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as CarRow[]).map(mapCar);
}

export async function fetchCarWithHost(slug: string): Promise<{ car: Car; host: Host } | null> {
  const { data, error } = await supabase
    .from('cars')
    .select(`${CAR_SELECT}, host:profiles!cars_host_id_fkey(*)`)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as CarRow & { host: HostRow };
  return { car: mapCar(row), host: mapHost(row.host) };
}

export async function fetchSimilarCars(
  category: Car['category'],
  excludeId: string,
  limit = 3,
): Promise<Car[]> {
  const { data, error } = await supabase
    .from('cars')
    .select(CAR_SELECT)
    .eq('status', 'published')
    .eq('category', category)
    .neq('id', excludeId)
    .limit(limit);
  if (error) throw error;
  return (data as unknown as CarRow[]).map(mapCar);
}

/** Loads once on mount; `null` while loading, `[]`/data once resolved. */
export function useCars() {
  const [cars, setCars] = useState<Car[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCars()
      .then((data) => {
        if (!cancelled) setCars(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load cars.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { cars, error, loading: cars === null && !error };
}

/** Same as {@link useCars}, but for the homepage's curated top-rated set. */
export function useFeaturedCars(limit = 8) {
  const [cars, setCars] = useState<Car[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFeaturedCars(limit)
      .then((data) => {
        if (!cancelled) setCars(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load cars.');
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { cars, error, loading: cars === null && !error };
}
