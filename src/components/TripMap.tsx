import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Icon } from './Icon';
import { supabase } from '../lib/supabase';
import { CITY_COORDS } from '../data/cityCoords';
import { collapseAttribution } from '../lib/mapAttribution';
import { distanceKm, searchPlaces } from '../lib/geocode';
import { uiLocale } from '../lib/i18n/uiLocale';
import { useLocale } from '../lib/i18n';

export interface TripMapProps {
  carId: string;
  city: string;
  carLabel: string;
  startDate: string;
  endDate: string;
  fulfillmentType: 'pickup' | 'delivery';
  deliveryAddress?: string | null;
  /** What the booking says the pick-up place is (falls back to the car's pin label). */
  pickupLabel?: string | null;
  phase: 'pending' | 'payment_processing' | 'upcoming' | 'active' | 'completed' | 'cancelled' | 'refunded';
  /** Who is looking: the renter sees "your host", the host sees "your renter". */
  role: 'renter' | 'host';
  otherName?: string;
  /** Link to the conversation with the other person (optional). */
  chatHref?: string;
  className?: string;
}

interface Pt { lat: number; lng: number; label?: string }

const pointCache = new Map<string, Pt | null>();

/** The car's exact spot (migration 0109) — fail soft (null) when it is not set or not readable. */
async function loadCarPoint(carId: string): Promise<Pt | null> {
  if (pointCache.has(carId)) return pointCache.get(carId) ?? null;
  try {
    const { data, error } = await supabase.from('cars').select('lat, lng, address_label').eq('id', carId).maybeSingle();
    if (error || !data || data.lat == null || data.lng == null) { pointCache.set(carId, null); return null; }
    const p = { lat: Number(data.lat), lng: Number(data.lng), label: (data.address_label as string | null) ?? undefined };
    pointCache.set(carId, p);
    return p;
  } catch {
    return null;
  }
}

async function geocodeAddress(address: string, near?: [number, number]): Promise<Pt | null> {
  const key = `cx.geo.${address.trim().toLowerCase()}`;
  try {
    const hit = sessionStorage.getItem(key);
    if (hit) return JSON.parse(hit) as Pt;
  } catch { /* ignore */ }
  const r = await searchPlaces(address, near);
  if (!r[0]) return null;
  const p: Pt = { lat: r[0].lat, lng: r[0].lng, label: r[0].label };
  try { sessionStorage.setItem(key, JSON.stringify(p)); } catch { /* ignore */ }
  return p;
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(uiLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
const dayCount = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));

/**
 * The trip on a map: where the car is, where it is going (a delivery address) and when — for the
 * renter and for the host, after booking. Static data, a live feel: pulsing pins, a flowing route,
 * "now" marked on the timeline.
 */
export function TripMap(p: TripMapProps) {
  const { t } = useLocale();
  const box = useRef<HTMLDivElement>(null);
  const [car, setCar] = useState<Pt | null | undefined>(undefined);
  const [drop, setDrop] = useState<Pt | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let off = false;
    void loadCarPoint(p.carId).then((c) => { if (!off) setCar(c); });
    return () => { off = true; };
  }, [p.carId]);

  useEffect(() => {
    if (p.fulfillmentType !== 'delivery' || !p.deliveryAddress || car === undefined) { setDrop(null); return; }
    let off = false;
    const near: [number, number] | undefined = car ? [car.lng, car.lat] : CITY_COORDS[p.city];
    void geocodeAddress(p.deliveryAddress, near).then((d) => { if (!off) setDrop(d); });
    return () => { off = true; };
  }, [p.fulfillmentType, p.deliveryAddress, car, p.city]);

  const carCenter: [number, number] | undefined = car ? [car.lng, car.lat] : CITY_COORDS[p.city];
  const km = car && drop ? distanceKm(car, drop) : null;
  const live = p.phase === 'active';

  // Map
  useEffect(() => {
    if (car === undefined) return;
    const center = carCenter;
    if (!box.current || !center) { setFailed(true); return; }
    let map: MapLibreMap | null = null;
    let cancelled = false;
    let timer = 0;
    (async () => {
      try {
        const [maplibregl, worker] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'), import('maplibre-gl/dist/maplibre-gl.css')]);
        if (cancelled || !box.current) return;
        maplibregl.setWorkerUrl(worker.default);
        map = new maplibregl.Map({
          container: box.current,
          style: 'https://tiles.openfreemap.org/styles/positron',
          center,
          zoom: car ? 15 : 12,
          attributionControl: { compact: true },
          fadeDuration: 0,
          dragRotate: false,
          // the page keeps scrolling when a finger / wheel is over the map; two fingers (or Ctrl+wheel) zoom it
          cooperativeGestures: true,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        collapseAttribution(map);

        const pin = (lngLat: [number, number], kind: 'car' | 'drop', label: string) => {
          const el = document.createElement('div');
          el.className = `trip-pin trip-pin--${kind}`;
          el.innerHTML = `<span class="trip-pin__pulse"></span><span class="trip-pin__dot"></span><span class="trip-pin__label">${label.replace(/</g, '&lt;')}</span>`;
          new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map!);
        };

        map.on('load', () => {
          if (cancelled || !map) return;
          pin(center, 'car', t('The car'));
          if (drop) {
            pin([drop.lng, drop.lat], 'drop', t('Delivery'));
            map.addSource('route', {
              type: 'geojson',
              data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [center, [drop.lng, drop.lat]] } },
            });
            map.addLayer({ id: 'route-bg', type: 'line', source: 'route', paint: { 'line-color': '#00a63e', 'line-width': 6, 'line-opacity': 0.12 }, layout: { 'line-cap': 'round' } });
            map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#008536', 'line-width': 3, 'line-dasharray': [0, 2, 2] }, layout: { 'line-cap': 'round' } });
            // flowing dashes
            const seq: number[][] = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
            let i = 0;
            timer = window.setInterval(() => {
              if (!map || !map.getLayer('route')) return;
              i = (i + 1) % seq.length;
              map.setPaintProperty('route', 'line-dasharray', seq[i]);
            }, 90);
            const b = new maplibregl.LngLatBounds(center, center);
            b.extend([drop.lng, drop.lat]);
            map.fitBounds(b, { padding: 70, maxZoom: 15.5, duration: 0 });
          }
          setReady(true);
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; window.clearInterval(timer); map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car, drop?.lat, drop?.lng, p.city]);

  const steps = useMemo(() => {
    const out: { key: string; when: string; title: string; place: string; state: 'done' | 'now' | 'next' }[] = [];
    const afterStart = ['active', 'completed'].includes(p.phase);
    const finished = p.phase === 'completed';
    if (p.fulfillmentType === 'delivery') {
      out.push({ key: 'car', when: '', title: t('Car location'), place: car?.label || p.pickupLabel || p.city, state: 'done' });
      out.push({ key: 'drop', when: fmtDay(p.startDate), title: t('Delivery'), place: p.deliveryAddress || '', state: afterStart ? 'done' : 'next' });
    } else {
      out.push({ key: 'pick', when: fmtDay(p.startDate), title: t('Pick-up'), place: car?.label || p.pickupLabel || p.city, state: afterStart ? 'done' : 'next' });
    }
    out.push({ key: 'ret', when: fmtDay(p.endDate), title: t('Return'), place: car?.label || p.pickupLabel || p.city, state: finished ? 'done' : 'next' });
    if (live) {
      // the trip is happening right now: the last finished step stays "done", the road ahead is "now"
      const idx = out.findIndex((s) => s.state === 'next');
      if (idx > 0) out[idx - 1] = { ...out[idx - 1], state: 'now' };
    }
    return out;
  }, [p.phase, p.fulfillmentType, p.startDate, p.endDate, p.deliveryAddress, p.pickupLabel, p.city, car, live, t]);

  const directions = car
    ? `https://www.google.com/maps/dir/?api=1&destination=${car.lat},${car.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.pickupLabel || p.city)}`;

  const chip = live
    ? { text: t('On the road'), cls: 'bg-accent/10 text-accent', dot: true }
    : p.phase === 'upcoming'
      ? { text: t('Upcoming'), cls: 'bg-warn/15 text-warn-ink', dot: false }
      : p.phase === 'completed'
        ? { text: t('Completed'), cls: 'bg-panel text-muted', dot: false }
        : { text: p.phase === 'cancelled' || p.phase === 'refunded' ? t('Cancelled') : t('Pending'), cls: 'bg-panel text-muted', dot: false };

  return (
    <section className={`overflow-hidden rounded-[24px] border border-line bg-surface shadow-hair ${p.className ?? ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <p className="truncate font-display text-[17px] font-semibold text-ink">{p.carLabel}</p>
          <p className="text-caption text-muted">
            {fmtDay(p.startDate)} → {fmtDay(p.endDate)} · {dayCount(p.startDate, p.endDate)} {dayCount(p.startDate, p.endDate) === 1 ? t('day') : t('days')}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-semibold ${chip.cls}`}>
          {chip.dot && <span className="relative flex h-2 w-2"><span className="absolute h-2 w-2 animate-ping rounded-full bg-accent-bright/60" /><span className="relative h-2 w-2 rounded-full bg-accent-bright" /></span>}
          {chip.text}
        </span>
      </div>

      <div className="grid lg:grid-cols-[1fr_17rem]">
        <div className="relative h-64 bg-[#f2f4f7] sm:h-80 lg:h-[22rem]">
          <div ref={box} style={{ position: 'absolute', inset: 0 }} role="img" aria-label={t('Trip map')} />
          {!ready && !failed && <span className="skeleton absolute inset-0" />}
          {failed && <span className="absolute inset-0 grid place-items-center text-detail text-muted">{p.city}</span>}
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
            <a href={directions} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-caption font-semibold text-ink shadow-pop backdrop-blur">
              <Icon name="arrowUpRight" size={13} /> {t('Directions')}
            </a>
            {km != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/90 px-3.5 py-2 text-caption font-semibold text-white shadow-pop">
                <Icon name="route" size={13} /> {km.toFixed(1)} km
              </span>
            )}
          </div>
        </div>

        <ol className="relative space-y-0 border-t border-line bg-[#fafbf8] p-4 lg:border-l lg:border-t-0">
          {steps.map((s, i) => (
            <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 && <span className="absolute left-[7px] top-4 h-[calc(100%-0.5rem)] w-px bg-line-strong" />}
              <span
                className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
                  s.state === 'done' ? 'border-accent bg-accent' : s.state === 'now' ? 'border-accent bg-white' : 'border-faint bg-white'
                }`}
              >
                {s.state === 'now' && <span className="absolute -inset-1.5 animate-ping rounded-full bg-accent-bright/40" />}
              </span>
              <span className="min-w-0">
                <span className="block text-caption font-semibold uppercase tracking-wide text-muted">{s.title}{s.when ? ` · ${s.when}` : ''}</span>
                <span className="mt-0.5 block text-detail font-medium leading-snug text-ink">{s.place || '—'}</span>
              </span>
            </li>
          ))}
          {p.chatHref && (
            <li className="pt-4">
              <Link to={p.chatHref} className="flex items-center justify-center gap-2 rounded-xl bg-accent/10 py-2.5 text-detail font-semibold text-accent active:scale-[0.98]">
                <Icon name="message" size={15} /> {p.role === 'host' ? t('Message {name}', { name: p.otherName || t('your renter') }) : t('Message {name}', { name: p.otherName || t('your host') })}
              </Link>
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}
