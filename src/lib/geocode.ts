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

/** Set once Geoapify has refused the key (wrong key, or the domain is not on its allow-list): for the rest of the
 *  session the public service answers instead, so a key problem never leaves the address search empty. */
let geoapifyRefused = false;
const useGeoapify = () => Boolean(GEOAPIFY_KEY) && !geoapifyRefused;

async function searchGeoapify(q: string, near: [number, number] | undefined, signal?: AbortSignal): Promise<Place[] | null> {
  const url = new URL(`${GEOAPIFY}/autocomplete`);
  url.searchParams.set('text', q);
  url.searchParams.set('limit', '6');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('format', 'geojson');
  if (near) url.searchParams.set('bias', `proximity:${near[0]},${near[1]}`);
  url.searchParams.set('apiKey', GEOAPIFY_KEY);
  try {
    const res = await fetch(url, { signal });
    if (res.status === 401 || res.status === 403) { geoapifyRefused = true; return null; }
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: Feature[] };
    return (json.features ?? []).map(toPlace);
  } catch {
    return null;
  }
}

async function searchPhoton(q: string, near: [number, number] | undefined, signal?: AbortSignal): Promise<Place[]> {
  const url = new URL(`${BASE}/api/`);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '6');
  url.searchParams.set('lang', 'en');
  if (near) { url.searchParams.set('lon', String(near[0])); url.searchParams.set('lat', String(near[1])); }
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: Feature[] };
    return (json.features ?? []).map(toPlace);
  } catch {
    return [];
  }
}

export async function searchPlaces(query: string, near?: [number, number], signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  if (useGeoapify()) {
    const r = await searchGeoapify(q, near, signal);
    if (r !== null) return r;
    if (signal?.aborted) return [];
  }
  return searchPhoton(q, near, signal);
}

/** fetch with a deadline: a slow public geocoder must never keep the host waiting */
async function fetchWithin(url: string, ms: number, signal?: AbortSignal): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const reverseCache = new Map<string, Place | null>();

/** The address at a point. Photon first (3.5 s at most), then Nominatim as a second opinion; remembered per spot. */
export async function reversePlace(lat: number, lng: number, signal?: AbortSignal): Promise<Place | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (reverseCache.has(key)) {
    const hit = reverseCache.get(key);
    return hit ? { ...hit, lat, lng } : null;
  }
  let first: Response | null = null;
  if (useGeoapify()) {
    first = await fetchWithin(`${GEOAPIFY}/reverse?lat=${lat}&lon=${lng}&lang=en&format=geojson&limit=5&apiKey=${GEOAPIFY_KEY}`, 3500, signal);
    if (!first) {
      // a refused key answers 401/403, which fetchWithin reports as null: check once so later calls skip Geoapify
      try {
        const probe = await fetch(`${GEOAPIFY}/reverse?lat=${lat}&lon=${lng}&format=geojson&apiKey=${GEOAPIFY_KEY}`, { signal });
        if (probe.status === 401 || probe.status === 403) geoapifyRefused = true;
      } catch { /* offline or aborted */ }
    }
  }
  if (!first && !signal?.aborted) first = await fetchWithin(`${BASE}/reverse?lat=${lat}&lon=${lng}&lang=en`, 3500, signal);
  if (first) {
    try {
      const json = (await first.json()) as { features?: Feature[] };
      const list = json.features ?? [];
      // a street address is what a pick-up point needs: prefer one with a number, then a street, then whatever came first
      const f = list.find((x) => x.properties.street && x.properties.housenumber) ?? list.find((x) => x.properties.street) ?? list[0];
      if (f) {
        const place = { ...toPlace(f), lat, lng };
        reverseCache.set(key, place);
        return place;
      }
    } catch { /* fall through to the second opinion */ }
  }
  if (signal?.aborted) return null;
  const second = await fetchWithin(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=en&lat=${lat}&lon=${lng}`, 5000, signal);
  if (second) {
    try {
      const j = (await second.json()) as {
        display_name?: string;
        name?: string;
        address?: { house_number?: string; road?: string; pedestrian?: string; postcode?: string; city?: string; town?: string; village?: string; suburb?: string; country?: string };
      };
      const a = j.address ?? {};
      const road = a.road || a.pedestrian || '';
      const street = road ? `${road}${a.house_number ? ` ${a.house_number}` : ''}` : '';
      const city = a.city || a.town || a.village || a.suburb;
      const parts = [street || j.name || null, [a.postcode, city].filter(Boolean).join(' ') || null, a.country || null].filter(Boolean) as string[];
      if (parts.length) {
        const place: Place = { label: parts.join(', '), short: street || j.name || city || '', lat, lng, city };
        reverseCache.set(key, place);
        return place;
      }
    } catch { /* nothing more to try */ }
  }
  return null;
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
