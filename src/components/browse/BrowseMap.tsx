import { collapseAttribution } from '../../lib/mapAttribution';
import { applyCxMapStyle } from '../../lib/cxMapStyle';
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

export interface AreaBounds { west: number; south: number; east: number; north: number }

type Pin = { car: Car; pos: [number, number] };

/** Greedy clustering in screen pixels: pins closer than `radius` px become one bubble with a count. */
function clusterPins(pins: Pin[], project: (p: [number, number]) => { x: number; y: number }, radius = 44) {
  const out: { x: number; y: number; items: Pin[] }[] = [];
  for (const it of pins) {
    const p = project(it.pos);
    const hit = out.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < radius);
    if (hit) {
      hit.x = (hit.x * hit.items.length + p.x) / (hit.items.length + 1);
      hit.y = (hit.y * hit.items.length + p.y) / (hit.items.length + 1);
      hit.items.push(it);
    } else out.push({ x: p.x, y: p.y, items: [it] });
  }
  return out;
}

/** A real map of the cars currently listed: one price pill per car (the tip on the exact spot), nearby cars
 *  gathered into a counted bubble that opens up as you zoom, the hovered or open car in black. The map follows
 *  the results — it frames the city that has the most cars, with a switcher for the others — and "Search this
 *  area" turns whatever you are looking at into the results. */
export function BrowseMap({
  cars,
  activeId,
  hoverId,
  onSelect,
  className = '',
  variant = 'side',
  areaActive = false,
  onAreaChange,
  cityPick,
  onCities,
  locked = false,
}: {
  cars: Car[];
  activeId: string | null;
  hoverId: string | null;
  onSelect: (car: Car) => void;
  className?: string;
  /** 'main': the map IS the page on a phone — one finger moves it, a sheet below holds the cars (a row of cards
   *  that follows the pins, pulled up into the full list), and there is a "where am I" button.
   *  'side': the map beside the list on a wide screen. */
  variant?: 'side' | 'main';
  /** the results are limited to a map area: the map stays where the person put it */
  areaActive?: boolean;
  onAreaChange?: (b: AreaBounds | null) => void;
  /** phone: the page owns the city chips (they sit in the filter row); this is the chosen one, and the map reports its cities back */
  cityPick?: string | null;
  onCities?: (cities: string[], current: string | null) => void;
  /** signed out: the map is only to look at: no controls, the pins framed above the sign-in card */
  locked?: boolean;
}) {
  const { t } = useLocale();
  const exact = useHasAccess();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null);
  const markers = useRef<{ marker: MapLibreMarker; el: HTMLButtonElement; ids: string[] }[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const youMarker = useRef<MapLibreMarker | null>(null);
  const [locating, setLocating] = useState(false);
  const [moved, setMoved] = useState(false);
  const [searching, setSearching] = useState(false);
  // the small print under the bars (exact / approximate pins) is shown for a few seconds, then gets out of the way
  const [noteOn, setNoteOn] = useState(true);
  useEffect(() => {
    if (variant !== 'main') return;
    const id = window.setTimeout(() => setNoteOn(false), 6000);
    return () => window.clearTimeout(id);
  }, [variant]);
  const autoTimer = useRef<number | undefined>(undefined);
  const autoRef = useRef<() => void>(() => {});

  // cities present in the results, busiest first
  const cities = useMemo(() => {
    const n = new Map<string, number>();
    cars.forEach((c) => { if (c.lat != null && c.lng != null) n.set(c.city, (n.get(c.city) ?? 0) + 1); });
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).filter((c) => CITY_COORDS[c]);
  }, [cars]);
  const chosen = onCities ? cityPick ?? null : pick;
  const city = chosen && cities.includes(chosen) ? chosen : cities[0] ?? null;
  useEffect(() => { onCities?.(cities, city); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities.join('|'), city]);
  // cars shown in the list whose host has not marked the exact spot yet
  const unplaced = useMemo(() => cars.filter((c) => c.lat == null || c.lng == null).length, [cars]);
  // cars that have an exact spot, in the order of the list: these are the cards under the map
  const placed = useMemo(() => cars.filter((c) => c.lat != null && c.lng != null), [cars]);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const variantRef = useRef(variant);
  variantRef.current = variant;
  const placedRef = useRef(placed);
  placedRef.current = placed;
  const exactRef = useRef(exact);
  exactRef.current = exact;
  const drawRef = useRef<() => void>(() => {});
  const highlightRef = useRef<() => void>(() => {});

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
        if (variantRef.current !== 'main') map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
        mapRef.current = map;
        collapseAttribution(map);
      applyCxMapStyle(map);
        map.on('load', () => { if (!cancelled) setReady(true); });
        map.on('zoomend', () => drawRef.current());
        // only a move made by the person (not the map framing the results) offers "Search this area"
        map.on('moveend', (e) => {
          if (!(e as { originalEvent?: unknown }).originalEvent) return;
          setMoved(true);
          if (variantRef.current === 'main') {
            // like a map app: the results follow the map a moment after it stops
            setSearching(true);
            window.clearTimeout(autoTimer.current);
            autoTimer.current = window.setTimeout(() => { autoRef.current(); setSearching(false); }, 650);
          }
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      markers.current.forEach(({ marker }) => marker.remove());
      markers.current = [];
      youMarker.current?.remove();
      youMarker.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // the map is built once; results are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Focus a car: its pin lights up, the map moves to it and (when asked) its card comes into view. */
  /** The part of the map you can really see on a phone: below the top bars, above the half-open sheet. */
  const insets = () => {
    const h = box.current?.clientHeight ?? window.innerHeight;
    const sheetTop = Math.round(window.innerHeight * 0.5);
    const bar = document.querySelector('[data-browse-top]')?.getBoundingClientRect().bottom;
    return { top: Math.round((bar ?? 150) + 12), bottom: Math.max(150, h - sheetTop + 16) };
  };
  const focusCar = (id: string, scrollCard: boolean) => {
    setFocusId(id);
    const car = placedRef.current.find((c) => c.id === id);
    const pos = car ? positionOf(car, exactRef.current) : null;
    const map = mapRef.current;
    if (pos && map) map.easeTo({ center: pos, zoom: Math.max(map.getZoom(), exactRef.current ? 14.5 : 13.5), padding: variantRef.current === 'main' ? insets() : undefined, duration: 450 });
    if (!scrollCard) return;
    const idx = placedRef.current.findIndex((c) => c.id === id);
    const row = strip.current;
    const card = row?.children[idx] as HTMLElement | undefined;
    if (row && card) {
      programmatic.current = true;
      row.scrollTo({ left: card.offsetLeft - (row.clientWidth - card.clientWidth) / 2, behavior: 'smooth' });
      window.setTimeout(() => { programmatic.current = false; }, 600);
    } else {
      box.current?.parentElement?.querySelector(`[data-card="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };
  const focusRef = useRef(focusCar);
  focusRef.current = focusCar;

  // draw the pins and the bubbles for the current zoom
  const draw = () => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !map || !ml) return;
    markers.current.forEach(({ marker }) => marker.remove());
    markers.current = [];
    const pins: Pin[] = [];
    placedRef.current.forEach((car) => {
      const pos = positionOf(car, exactRef.current);
      if (pos) pins.push({ car, pos });
    });
    const ex = exactRef.current;
    clusterPins(pins, (p) => map.project(p)).forEach((cl) => {
      if (cl.items.length === 1) {
        const { car, pos } = cl.items[0];
        const el = document.createElement('button');
        el.className = 'bm-pin';
        if (ex) el.dataset.exact = '1';
        el.textContent = eur(car.pricePerDay);
        el.setAttribute('aria-label', `${car.make} ${car.model} ${eur(car.pricePerDay)}${ex && car.addressLabel ? ` — ${car.addressLabel}` : ''}`);
        if (ex && car.addressLabel) el.title = car.addressLabel;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (variantRef.current === 'main') focusRef.current(car.id, true);
          else onSelectRef.current(car);
        });
        const marker = new ml.Marker({ element: el, anchor: ex ? 'bottom' : 'center', offset: [0, ex ? -6 : 0] }).setLngLat(pos).addTo(map);
        markers.current.push({ marker, el, ids: [car.id] });
        return;
      }
      // a bubble: the middle of its cars
      const lng = cl.items.reduce((a, i) => a + i.pos[0], 0) / cl.items.length;
      const lat = cl.items.reduce((a, i) => a + i.pos[1], 0) / cl.items.length;
      const el = document.createElement('button');
      el.className = 'bm-cluster';
      el.textContent = String(cl.items.length);
      el.setAttribute('aria-label', `${cl.items.length}`);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const lngs = cl.items.map((i) => i.pos[0]);
        const lats = cl.items.map((i) => i.pos[1]);
        const same = Math.max(...lngs) - Math.min(...lngs) < 1e-6 && Math.max(...lats) - Math.min(...lats) < 1e-6;
        if (same || map.getZoom() >= 17) {
          // the same building: open the cars one by one
          if (variantRef.current === 'main') focusRef.current(cl.items[0].car.id, true);
          else onSelectRef.current(cl.items[0].car);
          return;
        }
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 90, maxZoom: 17, duration: 500 });
      });
      const marker = new ml.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      markers.current.push({ marker, el, ids: cl.items.map((i) => i.car.id) });
    });
    highlightRef.current();
  };
  drawRef.current = draw;

  useEffect(() => { draw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [placed, ready, exact]);

  // highlight
  highlightRef.current = () => {
    markers.current.forEach(({ el, ids }) => {
      const on = ids.some((id) => id === activeId || id === focusId);
      const hover = ids.some((id) => id === hoverId);
      el.dataset.on = on ? 'active' : hover ? 'hover' : '';
    });
  };
  useEffect(() => { highlightRef.current(); }, [activeId, hoverId, focusId, placed, ready]);

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
      if (pos) mapRef.current?.easeTo({ center: pos, padding: insets(), duration: 350 });
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

  // fit the busiest city (not while the results are an area the person chose: the map stays put)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !city || areaActive) return;
    const pts = cars.filter((c) => c.city === city).map((c) => positionOf(c, exact)).filter((p): p is [number, number] => !!p);
    if (pts.length === 0) return;
    const lng = pts.map((p) => p[0]);
    const lat = pts.map((p) => p[1]);
    // on a phone the card sheet covers the bottom of the map: the pins are framed above it
    const fit = locked ? { top: 50, bottom: window.innerWidth < 640 ? 330 : 240 } : variant === 'main' && placed.length > 0 ? insets() : { top: 70, bottom: 70 };
    map.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: { top: fit.top, left: 50, right: 50, bottom: fit.bottom }, maxZoom: exact ? 15.5 : 14, duration: 900 });
    setMoved(false);
  }, [city, cars, ready, exact, areaActive, variant, placed.length]);

  const applyArea = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    onAreaChange?.({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    setMoved(false);
  };
  autoRef.current = applyArea;

  const showSheet = variant === 'main' && placed.length > 0;

  return (
    <div className={`relative overflow-hidden ${variant === 'main' ? 'bg-bg' : 'bg-[#f2f4f7]'} ${className}`}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label={t('Map of listed cars')} />
      {!ready && !failed && <span className="skeleton absolute inset-0" />}
      {failed && <span className="absolute inset-0 grid place-items-center text-detail text-muted">{t('Map unavailable')}</span>}
      {ready && !locked && cities.length > 1 && !onCities && (
        <div className={`scrollbar-none absolute left-3 z-10 flex max-w-[calc(100%-70px)] gap-1.5 overflow-x-auto rounded-full bg-white/95 p-1 shadow-[0_6px_18px_-6px_rgba(22,22,26,0.3)] ${variant === 'main' ? 'top-[8.6rem]' : 'top-3'}`}>
          {cities.map((c) => (
            <button key={c} onClick={() => setPick(c)} className={`shrink-0 rounded-full px-3 py-1.5 text-caption font-semibold transition-colors ${c === city ? 'bg-ink text-white' : 'text-ink-soft hover:bg-panel'}`}>
              {c}
            </button>
          ))}
        </div>
      )}

      {ready && onAreaChange && variant !== 'main' && (moved || areaActive) && (
        <div className={`absolute left-1/2 z-20 -translate-x-1/2 ${cities.length > 1 ? 'top-14' : 'top-3'}`}>
          {areaActive ? (
            <button
              type="button"
              onClick={() => { onAreaChange(null); setMoved(false); }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-caption font-semibold text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)]"
            >
              {cars.length === 0 ? t('No cars in this area') : t('Showing this area')} <Icon name="x" size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={applyArea}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-caption font-semibold text-ink shadow-[0_8px_20px_-8px_rgba(0,0,0,0.5)] active:scale-95"
            >
              <Icon name="search" size={14} /> {t('Search this area')}
            </button>
          )}
        </div>
      )}

      {ready && !locked && variant === 'main' && (
        <div
          className={`absolute left-1/2 top-[calc(var(--browse-top,8.6rem)+0.5rem)] z-20 -translate-x-1/2 transition-[opacity,transform] duration-200 ease-out ${
            searching || areaActive ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'
          }`}
          aria-live="polite"
        >
          {searching ? (
            <span className="flex h-9 items-center gap-2 rounded-full bg-white/95 px-4 text-caption font-semibold text-ink shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)] backdrop-blur">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-ink" />
              {t('Searching')}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => { onAreaChange?.(null); setMoved(false); }}
              className="flex h-9 items-center gap-2 rounded-full bg-white/95 pl-4 pr-1.5 text-caption font-semibold text-ink shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)] backdrop-blur active:scale-95"
            >
              {cars.length === 0 ? t('No cars in this area') : t('Showing this area')}
              <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-white"><Icon name="x" size={12} /></span>
            </button>
          )}
        </div>
      )}

      {ready && !locked && variant === 'main' && (
        <button
          type="button"
          onClick={locate}
          aria-label={t('Show where I am')}
          className="absolute right-3 top-[calc(var(--browse-top,8.6rem)+0.5rem)] z-10 grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-[0_6px_18px_-6px_rgba(22,22,26,0.4)] active:scale-95"
        >
          <Icon name="locate" size={19} className={locating ? 'animate-pulse' : ''} />
        </button>
      )}

      {ready && showSheet && focusId && (
        <div
          ref={strip}
          onScroll={onStripScroll}
          style={{ touchAction: 'pan-x' }}
          className="scrollbar-none absolute inset-x-0 bottom-[4.4rem] z-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1"
        >
          {placed.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => (focusId === c.id ? onSelect(c) : focusRef.current(c.id, true))}
              className={`flex h-[5.4rem] w-[16.5rem] shrink-0 snap-center gap-3 rounded-2xl bg-surface p-2 text-left shadow-[0_8px_20px_-10px_rgba(0,0,0,0.5)] ring-1 transition-shadow ${focusId === c.id ? 'ring-ink' : 'ring-line'}`}
            >
              <img src={unsplash(c.images[0], 320)} alt="" loading="lazy" draggable={false} className="h-full w-24 shrink-0 rounded-xl bg-panel object-cover" />
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
        <div className={`pointer-events-none absolute left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-1 transition-opacity duration-500 ${variant === 'main' ? `top-[calc(var(--browse-top,8.6rem)+3.1rem)] ${noteOn ? 'opacity-100' : 'opacity-0'}` : 'bottom-7'}`}>
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
