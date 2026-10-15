import { collapseAttribution } from '../../lib/mapAttribution';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import type { Car } from '../../data/types';
import { CITY_COORDS } from '../../data/cityCoords';
import { eur } from '../../lib/format';
import { useLocale } from '../../lib/i18n';
import { useHasAccess } from '../../lib/useAccess';

/** Where a car is drawn: the spot its host marked (address search + pin, migration 0109).
 *  - signed in: that exact spot, the pin's tip on the point;
 *  - signed out: the same real place rounded to a block of ~400 m (a true neighbourhood, never an invented one),
 *    so the exact address stays behind the sign-in the listing page already asks for.
 *  A car whose host has not marked a spot yet is NOT drawn: no point is ever made up. */
function positionOf(car: Car, exact: boolean): [number, number] | null {
  if (car.lat == null || car.lng == null) return null;
  if (exact) return [car.lng, car.lat];
  const step = 0.004;
  return [Math.round(car.lng / step) * step, Math.round(car.lat / step) * step];
}

/** A real map of the cars currently listed: one white price pill per car, the
 *  hovered or open car in black. Clicking a pill opens that car. The map follows
 *  the results — it frames the city that has the most cars, with a switcher for
 *  the others. */
export function BrowseMap({
  cars,
  activeId,
  hoverId,
  onSelect,
  className = '',
}: {
  cars: Car[];
  activeId: string | null;
  hoverId: string | null;
  onSelect: (car: Car) => void;
  className?: string;
}) {
  const { t } = useLocale();
  const exact = useHasAccess();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null);
  const markers = useRef<Map<string, { marker: MapLibreMarker; el: HTMLButtonElement }>>(new Map());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  // cities present in the results, busiest first
  const cities = useMemo(() => {
    const n = new Map<string, number>();
    cars.forEach((c) => { if (c.lat != null && c.lng != null) n.set(c.city, (n.get(c.city) ?? 0) + 1); });
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).filter((c) => CITY_COORDS[c]);
  }, [cars]);
  const city = pick && cities.includes(pick) ? pick : cities[0] ?? null;
  // cars shown in the list whose host has not marked the exact spot yet
  const unplaced = useMemo(() => cars.filter((c) => c.lat == null || c.lng == null).length, [cars]);

  useEffect(() => {
    if (!box.current) return;
    let cancelled = false;
    (async () => {
      try {
        const [ml, worker] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'), import('maplibre-gl/dist/maplibre-gl.css')]);
        if (cancelled || !box.current) return;
        ml.setWorkerUrl(worker.default);
        mlRef.current = ml;
        const start = CITY_COORDS[cities[0] ?? 'Milan'] ?? [9.19, 45.46];
        const map = new ml.Map({
          container: box.current,
          style: 'https://tiles.openfreemap.org/styles/positron',
          center: start,
          zoom: 11.6,
          attributionControl: { compact: true },
          cooperativeGestures: true,
          fadeDuration: 0,
        });
        map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
        mapRef.current = map;
        collapseAttribution(map);
        map.on('load', () => { if (!cancelled) setReady(true); });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      markers.current.forEach(({ marker }) => marker.remove());
      markers.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // the map is built once; results are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pins follow the results (and whether the viewer may see the exact spot)
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !map || !ml) return;
    markers.current.forEach(({ marker }) => marker.remove());
    markers.current.clear();
    // cars sharing a spot (same building, or the same block when signed out) get a small sideways step
    const seen = new Map<string, number>();
    cars.forEach((car) => {
      const pos = positionOf(car, exact);
      if (!pos) return;
      const k = `${pos[0].toFixed(5)},${pos[1].toFixed(5)}`;
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      const el = document.createElement('button');
      el.className = 'bm-pin';
      if (exact) el.dataset.exact = '1';
      el.textContent = eur(car.pricePerDay);
      el.setAttribute('aria-label', `${car.make} ${car.model} ${eur(car.pricePerDay)}${exact && car.addressLabel ? ` — ${car.addressLabel}` : ''}`);
      if (exact && car.addressLabel) el.title = car.addressLabel;
      el.addEventListener('click', (e) => { e.stopPropagation(); onSelectRef.current(car); });
      const side = n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 58;
      const marker = new ml.Marker({ element: el, anchor: exact ? 'bottom' : 'center', offset: [side, exact ? -6 : 0] }).setLngLat(pos).addTo(map);
      markers.current.set(car.id, { marker, el });
    });
  }, [cars, ready, exact]);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // fit the busiest city
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !city) return;
    const pts = cars.filter((c) => c.city === city).map((c) => positionOf(c, exact)).filter((p): p is [number, number] => !!p);
    if (pts.length === 0) return;
    const lng = pts.map((p) => p[0]);
    const lat = pts.map((p) => p[1]);
    map.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: 70, maxZoom: exact ? 15.5 : 14, duration: 900 });
  }, [city, cars, ready, exact]);

  // highlight
  useEffect(() => {
    markers.current.forEach(({ el }, id) => {
      el.dataset.on = id === activeId ? 'active' : id === hoverId ? 'hover' : '';
    });
  }, [activeId, hoverId, cars, ready]);

  return (
    <div className={`relative overflow-hidden bg-[#f2f4f7] ${className}`}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label={t('Map of listed cars')} />
      {!ready && !failed && <span className="skeleton absolute inset-0" />}
      {failed && <span className="absolute inset-0 grid place-items-center text-detail text-muted">{t('Map unavailable')}</span>}
      {ready && cities.length > 1 && (
        <div className="scrollbar-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-70px)] gap-1.5 overflow-x-auto rounded-full bg-white/95 p-1 shadow-[0_6px_18px_-6px_rgba(22,22,26,0.3)]">
          {cities.map((c) => (
            <button key={c} onClick={() => setPick(c)} className={`shrink-0 rounded-full px-3 py-1.5 text-caption font-semibold transition-colors ${c === city ? 'bg-ink text-white' : 'text-ink-soft hover:bg-panel'}`}>
              {c}
            </button>
          ))}
        </div>
      )}
      {ready && (
        <div className="pointer-events-none absolute bottom-7 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-1">
          <p className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium text-muted shadow-hair">
            {exact ? t('Pins mark the exact pick-up spots') : t('Approximate area — sign in to see the exact spots')}
          </p>
          {unplaced > 0 && (
            <p className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium text-muted shadow-hair">
              {t('{n} listed without an exact spot yet', { n: unplaced })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
