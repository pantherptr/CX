/**
 * Address search and reverse lookup for placing a car on the map.
 *
 * Uses Photon (OpenStreetMap data, built for search-as-you-type, open CORS) — a free public service
 * with a fair-use limit. Set VITE_GEOAPIFY_KEY (a key restricted to your domain in the Geoapify
 * dashboard) and the same two functions below use Geoapify instead; no other code changes.
 */

const BASE = 'https://photon.komoot.io';
const GEOAPIFY_KEY = (import.meta.env.VITE_GEOAPIFY_KEY as string | undefined) || '';
const GEOAPIFY = 'https://api.geoapify.com/v1/geocode';

export interface Place {
  label: string;
  /** Street + number or the place's own name, without the city (what hosts and renters read first). */
  short: string;
  lat: number;
  lng: number;
  city?: string;
}

interface Feature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string; street?: string; housenumber?: string; postcode?: string;
    city?: string; town?: string; village?: string; district?: string; county?: string; country?: string;
  };
}

function toPlace(f: Feature): Place {
  const p = f.properties;
  const city = p.city || p.town || p.village || p.district || p.county;
  const street = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : '';
  const short = street || p.name || city || '';
  const parts = [p.name && p.name !== street ? p.name : null, street || null, [p.postcode, city].filter(Boolean).join(' ') || null, p.country || null].filter(Boolean) as string[];
  return {
    label: [...new Set(parts)].join(', '),
    short: p.name && street && p.name !== street ? `${p.name}, ${street}` : short,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    city,
  };
}

export async function searchPlaces(query: string, near?: [number, number], signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = new URL(GEOAPIFY_KEY ? `${GEOAPIFY}/autocomplete` : `${BASE}/api/`);
  if (GEOAPIFY_KEY) {
    url.searchParams.set('text', q);
    url.searchParams.set('limit', '6');
    url.searchParams.set('lang', 'en');
    url.searchParams.set('format', 'geojson');
    if (near) url.searchParams.set('bias', `proximity:${near[0]},${near[1]}`);
    url.searchParams.set('apiKey', GEOAPIFY_KEY);
  } else {
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '6');
    url.searchParams.set('lang', 'en');
    if (near) { url.searchParams.set('lon', String(near[0])); url.searchParams.set('lat', String(near[1])); }
  }
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: Feature[] };
    return (json.features ?? []).map(toPlace);
  } catch {
    return [];
  }
}

export async function reversePlace(lat: number, lng: number): Promise<Place | null> {
  try {
    const res = await fetch(
      GEOAPIFY_KEY
        ? `${GEOAPIFY}/reverse?lat=${lat}&lon=${lng}&lang=en&format=geojson&apiKey=${GEOAPIFY_KEY}`
        : `${BASE}/reverse?lat=${lat}&lon=${lng}&lang=en`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: Feature[] };
    const f = json.features?.[0];
    return f ? { ...toPlace(f), lat, lng } : null;
  } catch {
    return null;
  }
}

/** Straight-line distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
