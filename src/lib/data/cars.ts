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
  luggage: number;
  mileage: string | null;
  drive: string | null;
  description: string | null;
  features: string[];
  instant_book: boolean;
  rating: number;
  trips: number;
  status: 'draft' | 'published';
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
    luggage: row.luggage,
    mileage: row.mileage ?? '',
    drive: row.drive ?? '',
    images: [...row.car_images].sort((a, b) => a.position - b.position).map((i) => i.url),
    features: row.features ?? [],
    description: row.description ?? '',
    hostId: row.host_id,
    reviews: (row.reviews ?? []).map(mapReview),
    status: row.status,
  };
}

function mapHost(row: HostRow): Host {
  return {
    id: row.id,
    name: row.full_name ?? 'CX host',
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

/** A host's own cars — includes drafts, not just published listings. RLS
 *  already permits this (`status = 'published' or host_id = auth.uid()`,
 *  see 0001_init.sql), so no separate query path is needed beyond the
 *  filter itself. */
export async function fetchHostCars(hostId: string): Promise<Car[]> {
  const { data, error } = await supabase
    .from('cars')
    .select(CAR_SELECT)
    .eq('host_id', hostId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as CarRow[]).map(mapCar);
}

export function useHostCars(hostId: string | undefined) {
  const [cars, setCars] = useState<Car[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hostId) {
      setCars([]);
      return;
    }
    let cancelled = false;
    setCars(null);
    setError(null);
    fetchHostCars(hostId)
      .then((data) => {
        if (!cancelled) setCars(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your cars.');
      });
    return () => {
      cancelled = true;
    };
  }, [hostId]);

  return { cars, error, loading: cars === null && !error };
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

/* ------------------------------------------------------------------
   Creating a listing
   ------------------------------------------------------------------ */

/** URL-safe slug. Diacritics are folded rather than dropped, so a
 *  Huracán becomes `huracan` — the seed data's naive handling produced
 *  `hurac-n`, which we don't want to reproduce for new listings. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip the combining marks NFD split out
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Uploads one listing photo to the public `car-photos` bucket. The path
 *  must start with the user's id — the bucket's insert policy checks
 *  `auth.uid()::text = (storage.foldername(name))[1]` (0001_init.sql).
 *  Same shape as the avatar upload in Settings.tsx. */
export async function uploadCarPhoto(
  userId: string,
  file: File,
): Promise<{ url: string; path: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('car-photos')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('car-photos').getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export interface CreateCarInput {
  hostId: string;
  make: string;
  model: string;
  trim?: string;
  year: number;
  category: Car['category'];
  city: string;
  location: string;
  pricePerDay: number;
  transmission: Car['transmission'];
  fuel: Car['fuel'];
  seats: number;
  doors: number;
  luggage: number;
  mileage?: string;
  drive?: string;
  description?: string;
  features: string[];
  instantBook: boolean;
  status: 'draft' | 'published';
}

const randomSuffix = () => Math.random().toString(36).slice(2, 6);

/**
 * Creates a real listing: uploads the photos, inserts the car, inserts
 * its images, and marks the user as a host.
 *
 * Ordering is deliberate. Photos upload first so a failure there costs
 * nothing but a few orphaned objects (which we then clean up) rather
 * than leaving a half-built row. If the `car_images` insert fails after
 * the car exists we delete the car again — a listing with no images
 * would render broken everywhere, since CarCard reads `images[0]`.
 *
 * `slug` is NOT NULL UNIQUE with no default, so a collision (Postgres
 * 23505) is retried with a short random suffix rather than surfaced.
 */
export async function createCar(
  input: CreateCarInput,
  photos: File[],
): Promise<{ car: Car | null; error: string | null; warning?: string }> {
  if (photos.length === 0) {
    return { car: null, error: 'Add at least one photo before publishing.' };
  }

  // 1. Photos → storage.
  const uploaded: { url: string; path: string }[] = [];
  try {
    for (const file of photos) {
      uploaded.push(await uploadCarPhoto(input.hostId, file));
    }
  } catch (err) {
    if (uploaded.length) {
      await supabase.storage.from('car-photos').remove(uploaded.map((u) => u.path));
    }
    return { car: null, error: err instanceof Error ? err.message : 'Could not upload your photos.' };
  }

  const cleanupPhotos = () =>
    supabase.storage.from('car-photos').remove(uploaded.map((u) => u.path));

  // 2. The car row, retrying only on a slug collision.
  const base = slugify([input.make, input.model, input.trim].filter(Boolean).join(' ')) || 'car';
  let carRow: CarRow | null = null;
  let lastError = 'Could not create your listing.';

  for (let attempt = 0; attempt < 3 && !carRow; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    const { data, error } = await supabase
      .from('cars')
      .insert({
        host_id: input.hostId,
        slug,
        make: input.make,
        model: input.model,
        trim: input.trim || null,
        year: input.year,
        category: input.category,
        city: input.city,
        location: input.location,
        price_per_day: input.pricePerDay,
        transmission: input.transmission,
        fuel: input.fuel,
        seats: input.seats,
        doors: input.doors,
        luggage: input.luggage,
        mileage: input.mileage || null,
        drive: input.drive || null,
        description: input.description || null,
        features: input.features,
        instant_book: input.instantBook,
        status: input.status,
      })
      .select(CAR_SELECT)
      .single();

    if (!error) {
      carRow = data as unknown as CarRow;
      break;
    }
    lastError = error.message;
    if (error.code !== '23505') break; // not a slug clash — don't keep retrying
  }

  if (!carRow) {
    await cleanupPhotos();
    return { car: null, error: lastError };
  }

  // 3. Images.
  const { error: imagesError } = await supabase.from('car_images').insert(
    uploaded.map((u, position) => ({ car_id: carRow!.id, url: u.url, position })),
  );
  if (imagesError) {
    await supabase.from('cars').delete().eq('id', carRow.id);
    await cleanupPhotos();
    return { car: null, error: imagesError.message };
  }

  // 4. Nothing else ever sets this, and HostRoute bounces non-hosts back
  //    to /list-your-car — without it a brand-new host loops forever.
  const { error: hostError } = await supabase
    .from('profiles')
    .update({ is_host: true })
    .eq('id', input.hostId);

  const car = mapCar({
    ...carRow,
    car_images: uploaded.map((u, position) => ({ url: u.url, position })),
  });

  return {
    car,
    error: null,
    warning: hostError
      ? "Your listing was created, but we couldn't switch your account to a host profile. Contact support if the host dashboard stays locked."
      : undefined,
  };
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
