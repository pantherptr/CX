import { collapseAttribution } from '../../lib/mapAttribution';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import type { Car } from '../../data/types';
import { CITY_COORDS } from '../../data/cityCoords';
import { eur } from '../../lib/format';
import { useLocale } from '../../lib/i18n';

/** Where a car is drawn: its city centre nudged by a stable, car-specific offset,
 *  so pins spread over the city but never reveal an exact address. */
function approxPosition(car: Car): [number, number] | null {
  const c = CITY_COORDS[car.city];
  if (!c) return null;
  let h = 2166136261;
  for (let i = 0; i < car.id.length; i++) h = Math.imul(h ^ car.id.charCodeAt(i), 16777619);
  const a = ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
  const r = 0.006 + (((h >>> 12) & 1023) / 1023) * 0.026;
  return [c[0] + Math.cos(a) * r * 1.45, c[1] + Math.sin(a) * r];
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
    cars.forEach((c) => n.set(c.city, (n.get(c.city) ?? 0) + 1));
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).filter((c) => CITY_COORDS[c]);
  }, [cars]);
  const city = pick && cities.includes(pick) ? pick : cities[0] ?? null;

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

  // pins follow the results
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !map || !ml) return;
    const wanted = new Map(cars.map((c) => [c.id, c]));
    markers.current.forEach(({ marker }, id) => {
      if (!wanted.has(id)) { marker.remove(); markers.current.delete(id); }
    });
    cars.forEach((car) => {
      const pos = approxPosition(car);
      if (!pos) return;
      const existing = markers.current.get(car.id);
      if (existing) { existing.el.textContent = eur(car.pricePerDay); return; }
      const el = document.createElement('button');
      el.className = 'bm-pin';
      el.textContent = eur(car.pricePerDay);
      el.setAttribute('aria-label', `${car.make} ${car.model} ${eur(car.pricePerDay)}`);
      el.addEventListener('click', (e) => { e.stopPropagation(); onSelectRef.current(car); });
      const marker = new ml.Marker({ element: el }).setLngLat(pos).addTo(map);
      markers.current.set(car.id, { marker, el });
    });
  }, [cars, ready]);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // fit the busiest city
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !city) return;
    const pts = cars.filter((c) => c.city === city).map(approxPosition).filter((p): p is [number, number] => !!p);
    if (pts.length === 0) return;
    const lng = pts.map((p) => p[0]);
    const lat = pts.map((p) => p[1]);
    map.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: 70, maxZoom: 12.8, duration: 900 });
  }, [city, cars, ready]);

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
      {ready && <p className="pointer-events-none absolute bottom-7 left-3 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium text-muted shadow-hair">{t('Pins show the approximate area')}</p>}
    </div>
  );
}
