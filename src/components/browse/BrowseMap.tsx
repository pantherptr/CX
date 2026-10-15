import { collapseAttribution } from '../../lib/mapAttribution';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import type { Car } from '../../data/types';
import { CITY_COORDS } from '../../data/cityCoords';
import { eur } from '../../lib/format';
import { unsplash } from '../../lib/img';
import { Icon } from '../Icon';
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
  variant = 'side',
}: {
  cars: Car[];
  activeId: string | null;
  hoverId: string | null;
  onSelect: (car: Car) => void;
  className?: string;
  /** 'main': the map IS the page on a phone — one finger moves it, the cars sit below it as a row of cards that
   *  follows the pins, and there is a "where am I" button. 'side': the map beside the list on a wide screen. */
  variant?: 'side' | 'main';
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
  const [focusId, setFocusId] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const youMarker = useRef<MapLibreMarker | null>(null);
  const [locating, setLocating] = useState(false);

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
      youMarker.current?.remove();
      youMarker.current = null;
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
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (variantRef.current === 'main') focusRef.current(car.id, true);
        else onSelectRef.current(car);
      });
      const side = n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 58;
      const marker = new ml.Marker({ element: el, anchor: exact ? 'bottom' : 'center', offset: [side, exact ? -6 : 0] }).setLngLat(pos).addTo(map);
      markers.current.set(car.id, { marker, el });
    });
  }, [cars, ready, exact]);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const variantRef = useRef(variant);
  variantRef.current = variant;

  // cars that have an exact spot, in the order of the list: these are the cards under the map
  const placed = useMemo(() => cars.filter((c) => c.lat != null && c.lng != null), [cars]);

  /** Focus a car: its pin lights up, the map moves to it and (when asked) the card slides into view. */
  const focusCar = (id: string, scrollCard: boolean) => {
    setFocusId(id);
    const car = placed.find((c) => c.id === id);
    const pos = car ? positionOf(car, exact) : null;
    if (pos) mapRef.current?.easeTo({ center: pos, zoom: Math.max(mapRef.current.getZoom(), exact ? 14.5 : 13.5), duration: 450 });
    if (scrollCard) {
      const idx = placed.findIndex((c) => c.id === id);
      const row = strip.current;
      const card = row?.children[idx] as HTMLElement | undefined;
      if (row && card) {
        programmatic.current = true;
        row.scrollTo({ left: card.offsetLeft - (row.clientWidth - card.clientWidth) / 2, behavior: 'smooth' });
        window.setTimeout(() => { programmatic.current = false; }, 600);
      }
    }
  };
  const focusRef = useRef(focusCar);
  focusRef.current = focusCar;

  // a swipe on the cards moves the map to that car
  const onStripScroll = () => {
    if (programmatic.current) return;
    const row = strip.current;
    if (!row || placed.length === 0) return;
    const mid = row.scrollLeft + row.clientWidth / 2;
    let best = 0;
    let bestD = Infinity;
    Array.from(row.children).forEach((el, i) => {
      const c = el as HTMLElement;
      const d = Math.abs(c.offsetLeft + c.clientWidth / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    const id = placed[best]?.id;
    if (id && id !== focusId) {
      setFocusId(id);
      const pos = positionOf(placed[best], exact);
      if (pos) mapRef.current?.easeTo({ center: pos, duration: 350 });
    }
  };

  // "where am I"
  const locate = () => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const ll: [number, number] = [p.coords.longitude, p.coords.latitude];
        if (!youMarker.current) {
          const dot = document.createElement('span');
          dot.style.cssText = 'display:block;width:16px;height:16px;border-radius:50%;background:#2f6bff;border:3px solid #fff;box-shadow:0 0 0 6px rgba(47,107,255,.22),0 2px 6px rgba(0,0,0,.3)';
          youMarker.current = new ml.Marker({ element: dot }).setLngLat(ll).addTo(map);
        } else youMarker.current.setLngLat(ll);
        map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 13.5), duration: 700 });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

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
      el.dataset.on = id === activeId || id === focusId ? 'active' : id === hoverId ? 'hover' : '';
    });
  }, [activeId, hoverId, focusId, cars, ready]);

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
      {ready && variant === 'main' && (
        <button
          type="button"
          onClick={locate}
          aria-label={t('Show where I am')}
          className="absolute right-3 top-[4.7rem] z-10 grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-[0_6px_18px_-6px_rgba(22,22,26,0.4)] active:scale-95"
        >
          <Icon name="compass" size={19} className={locating ? 'animate-spin' : ''} />
        </button>
      )}
      {ready && variant === 'main' && placed.length > 0 && (
        <div
          ref={strip}
          onScroll={onStripScroll}
          className="scrollbar-none absolute inset-x-0 bottom-0 z-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 pt-2"
        >
          {placed.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => (focusId === c.id ? onSelect(c) : focusRef.current(c.id, true))}
              className={`flex w-[16.5rem] shrink-0 snap-center gap-3 rounded-2xl bg-surface p-2 text-left shadow-[0_10px_26px_-10px_rgba(0,0,0,0.5)] ring-1 transition-shadow ${focusId === c.id ? 'ring-ink' : 'ring-line'}`}
            >
              <img src={unsplash(c.images[0], 320)} alt="" loading="lazy" draggable={false} className="h-[4.6rem] w-24 shrink-0 rounded-xl bg-panel object-cover" />
              <span className="min-w-0 flex-1 py-0.5">
                <span className="block truncate text-detail font-semibold text-ink">{c.make} {c.model}</span>
                <span className="mt-0.5 block truncate text-caption text-muted">{exact && c.addressLabel ? c.addressLabel : c.city}</span>
                <span className="mt-1 block text-detail font-bold text-ink">{eur(c.pricePerDay)} <span className="text-caption font-normal text-muted">/ {t('day')}</span></span>
              </span>
            </button>
          ))}
        </div>
      )}
      {ready && (
        <div className={`pointer-events-none absolute left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-1 ${variant === 'main' && placed.length > 0 ? 'bottom-[7.6rem]' : 'bottom-7'}`}>
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
