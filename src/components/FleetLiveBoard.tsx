import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MapLibreMap, Marker as MapLibreMarker, GeoJSONSource } from 'maplibre-gl';
import { Icon, type IconName } from './Icon';
import { Img } from './motion';
import { motion, AnimatePresence, useReducedMotion, SPRING_SMOOTH } from './motionKit';
import routesData from '../data/liveRoutes.json';

/** An animated "live fleet" board: stat tiles, a list of cars, and a real map
 *  of the car's city (real streets, real place names) where the
 *  selected car drives a real route while a cursor picks cars one after
 *  another and a trip card opens. The routes are real driving routes
 *  (scripts/build-live-routes.mjs) but the movement along them is a
 *  simulation — there is no GPS feed behind it — so callers pass `preview`
 *  to label it as such. The map itself (OpenStreetMap data via OpenFreeMap
 *  tiles) is only loaded once the board scrolls into view. */

export interface LiveItem {
  id: string;
  title: string;
  image: string;
  plate: string;
  person: string;
  avatar?: string;
  city: string;
  status: string;
}
export interface LiveStat { label: string; value: string; icon: IconName }

interface RouteData { coords: [number, number][]; distance: number; duration: number; from: string; to: string }
const ROUTES = routesData as unknown as Record<string, RouteData[]>;

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const ZOOM = 16.4;
const PITCH = 0;
const BEARING = 0;
const SELECT_MS = 11000;
// keep the car clear of the trip sheet along the bottom
const PAD = { top: 10, bottom: 130, left: 0, right: 0 };
const HERO_COLORS = ['#17181c', '#f6f7f9', '#2c3a55'];
// Pre-rendered 3D car, one sprite sheet per colour (scripts/render-car-sprites.py): the frame is picked from the heading, like ride-hailing maps do.
const CAR_SHEETS = ['/car/black.webp', '/car/white.webp', '/car/navy.webp'];
const CAR_FRAMES = 24;
const CAR_PX = 82;

/* ------------------------------ geometry ------------------------------ */
interface Track { coords: [number, number][]; cum: number[]; total: number; duration: number; from: string; to: string }

const metersBetween = (a: [number, number], b: [number, number]) => {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((b[0] - a[0]) * 111320 * k, (b[1] - a[1]) * 110540);
};

function makeTrack(city: string, index: number): Track {
  const list = ROUTES[city] ?? ROUTES.Milan;
  const r = list[index % list.length];
  const cum = [0];
  for (let i = 1; i < r.coords.length; i++) cum.push(cum[i - 1] + metersBetween(r.coords[i - 1], r.coords[i]));
  return { coords: r.coords, cum, total: cum[cum.length - 1], duration: r.duration, from: r.from, to: r.to };
}

/** Position and heading (degrees clockwise from north) at distance `s` metres. */
function pointAt(t: Track, s: number) {
  const d = Math.max(0, Math.min(t.total, s));
  let lo = 0;
  let hi = t.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (t.cum[mid] <= d) lo = mid; else hi = mid;
  }
  const a = t.coords[lo];
  const b = t.coords[Math.min(lo + 1, t.coords.length - 1)];
  const seg = t.cum[Math.min(lo + 1, t.cum.length - 1)] - t.cum[lo] || 1;
  const f = Math.max(0, Math.min(1, (d - t.cum[lo]) / seg));
  // look a little further ahead for a steadier heading than one short segment
  const ahead = t.coords[Math.min(lo + 2, t.coords.length - 1)];
  const same = ahead[0] === a[0] && ahead[1] === a[1];
  const to = same ? b : ahead;
  const k = Math.cos((a[1] * Math.PI) / 180);
  return {
    lng: a[0] + (b[0] - a[0]) * f,
    lat: a[1] + (b[1] - a[1]) * f,
    bearing: ((Math.atan2((to[0] - a[0]) * k, to[1] - a[1]) * 180) / Math.PI + 360) % 360,
  };
}

/** The part of the route still ahead of distance `s` — what the map draws, like a navigation app. */
const remaining = (t: Track, s: number): [number, number][] => {
  const p = pointAt(t, s);
  const out: [number, number][] = [[p.lng, p.lat]];
  for (let i = 0; i < t.coords.length; i++) if (t.cum[i] > s) out.push(t.coords[i]);
  return out;
};

const angleLerp = (from: number, to: number, f: number) => from + ((((to - from) % 360) + 540) % 360 - 180) * f;

/* ------------------------------- sprite ------------------------------- */
/** The car as a 3D render: a sprite sheet with one frame every 15°, shown by moving the background. */
const carFrame = (bearing: number) => Math.round((((bearing % 360) + 360) % 360) / (360 / CAR_FRAMES)) % CAR_FRAMES;

const SRC_FULL = 'fl-route';

interface SimCar { s: number; v: number; hold: number; stopAt: number; lng: number; lat: number; bearing: number; brake: boolean }

export function FleetLiveBoard({ items, stats, preview = true, title = 'Live tracking' }: { items: LiveItem[]; stats?: LiveStat[]; preview?: boolean; title?: string }) {
  const reduce = useReducedMotion();
  const tracks = useMemo(() => items.map((it, i) => makeTrack(it.city, i)), [items]);

  const [sel, setSel] = useState(0);
  const [visible, setVisible] = useState(false);
  const [mapState, setMapState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [carEls, setCarEls] = useState<HTMLElement[]>([]);
  const [tagEl, setTagEl] = useState<HTMLElement | null>(null);
  const [live, setLive] = useState({ min: 0, km: 0, speed: 0, pct: 0 });
  const [showCard, setShowCard] = useState(false);
  const [paused, setPaused] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const cursorRef = useRef<HTMLDivElement>(null);
  const carRefs = useRef<(HTMLDivElement | null)[]>([]);
  const mapRef = useRef<MapLibreMap | null>(null);
  const carMarkers = useRef<MapLibreMarker[]>([]);
  const tagMarker = useRef<MapLibreMarker | null>(null);
  const selRef = useRef(0);
  selRef.current = sel;
  const flying = useRef(false);
  const lastSel = useRef(-1);

  const current = items[sel] ?? items[0];
  const track = tracks[sel] ?? tracks[0];

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The cursor glides to the selected car's row, then the trip card opens.
  useEffect(() => {
    const el = root.current;
    const card = cardRefs.current[sel];
    const cur = cursorRef.current;
    if (!el || !card || !cur) return;
    const a = el.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    cur.style.transform = `translate(${b.left - a.left + b.width * 0.62}px, ${b.top - a.top + b.height * 0.55}px)`;
    setShowCard(false);
    const id = window.setTimeout(() => setShowCard(true), reduce ? 0 : 1100);
    return () => window.clearTimeout(id);
  }, [sel, reduce, items.length]);

  useEffect(() => {
    if (!visible || reduce || paused || items.length < 2) return;
    const id = window.setInterval(() => setSel((v) => (v + 1) % items.length), SELECT_MS);
    return () => window.clearInterval(id);
  }, [visible, reduce, paused, items.length]);

  // Build the map once the board is on screen.
  useEffect(() => {
    if (!visible || mapRef.current || !mapBox.current || !items.length) return;
    let cancelled = false;
    setMapState('loading');
    (async () => {
      try {
        const [maplibregl, worker] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'), import('maplibre-gl/dist/maplibre-gl.css')]);
        // bundled builds can't find the worker next to the library — point it at the emitted file
        maplibregl.setWorkerUrl(worker.default);
        if (cancelled || !mapBox.current) return;
        const start = pointAt(tracks[0], tracks[0].total * 0.15);
        const map = new maplibregl.Map({
          container: mapBox.current,
          style: STYLE_URL,
          center: [start.lng, start.lat],
          zoom: ZOOM,
          pitch: PITCH,
          bearing: BEARING,
          interactive: false,
          attributionControl: { compact: true },
          fadeDuration: 0,
        });
        mapRef.current = map;

        map.on('load', () => {
          if (cancelled) return;
          // flat map: labels stay above the route
          const labelLayer = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
          // the route: white casing, soft green line, bright green for the part already driven
          const empty = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [] as [number, number][] } };
          map.addSource(SRC_FULL, { type: 'geojson', data: empty });
          const layout = { 'line-cap': 'round' as const, 'line-join': 'round' as const };
          map.addLayer({ id: 'fl-casing', type: 'line', source: SRC_FULL, layout, paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.95 } }, labelLayer);
          map.addLayer({ id: 'fl-base', type: 'line', source: SRC_FULL, layout, paint: { 'line-color': '#16161a', 'line-width': 5 } }, labelLayer);

          // the drop-off point of each trip: a black square with the street name on a chip
          items.forEach((_, i) => {
            const end = tracks[i].coords[tracks[i].coords.length - 1];
            const el = document.createElement('div');
            el.className = 'fl-dest';
            const label = document.createElement('span');
            label.className = 'fl-dest__label';
            label.textContent = tracks[i].to;
            const pulse = document.createElement('span');
            pulse.className = 'fl-dest__pulse';
            const dot = document.createElement('span');
            dot.className = 'fl-dest__dot';
            el.append(label, pulse, dot);
            new maplibregl.Marker({ element: el }).setLngLat(end).addTo(map);
          });

          // car markers lie flat on the map and turn with the road
          const els: HTMLElement[] = [];
          carMarkers.current = items.map((_, i) => {
            const el = document.createElement('div');
            els.push(el);
            const p = pointAt(tracks[i], 0);
            return new maplibregl.Marker({ element: el, rotationAlignment: 'viewport', pitchAlignment: 'viewport' }).setLngLat([p.lng, p.lat]).addTo(map);
          });

          // the ETA bubble that rides above the selected car
          const tag = document.createElement('div');
          tagMarker.current = new maplibregl.Marker({ element: tag, anchor: 'bottom', offset: [0, -34] }).setLngLat([start.lng, start.lat]).addTo(map);

          setCarEls(els);
          setTagEl(tag);
          lastSel.current = -1;
          setMapState('ready');
        });
        map.on('error', (e) => {
          if (import.meta.env.DEV) console.warn('[FleetLiveBoard] map error', e.error?.message);
        });
        map.on('moveend', () => { flying.current = false; });
      } catch {
        if (!cancelled) setMapState('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [visible, items, tracks]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  // The simulation: every car drives its own route; the camera follows the selected one.
  useEffect(() => {
    const map = mapRef.current;
    if (mapState !== 'ready' || !map) return;
    const sim: SimCar[] = tracks.map((tr, i) => ({ s: reduce ? tr.total * (0.35 + i * 0.1) : 40 + i * 120, v: 0, hold: i * 800, stopAt: 380 + i * 90, lng: 0, lat: 0, bearing: 0, brake: false }));
    sim.forEach((c, i) => { const p = pointAt(tracks[i], c.s); c.lng = p.lng; c.lat = p.lat; c.bearing = p.bearing; });

    const selectRoute = () => {
      const i = selRef.current;
      (map.getSource(SRC_FULL) as GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: remaining(tracks[i], sim[i].s) } });
      const c = sim[i];
      if (lastSel.current !== -1) {
        flying.current = true;
        map.flyTo({ center: [c.lng, c.lat], zoom: ZOOM, pitch: PITCH, bearing: BEARING, padding: PAD, duration: 2200, essential: true });
      }
      lastSel.current = i;
    };

    let raf = 0;
    let last = performance.now();
    let camLng = sim[selRef.current].lng;
    let camLat = sim[selRef.current].lat;
    const frame = (now: number, still: boolean) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const si = selRef.current;
      if (lastSel.current !== si) { selectRoute(); camLng = sim[si].lng; camLat = sim[si].lat; }

      sim.forEach((c, i) => {
        const tr = tracks[i];
        if (!still) {
          if (c.hold > 0) {
            c.hold -= dt * 1000; c.v = 0; c.brake = true;
            if (c.hold <= 0 && c.s >= tr.total - 4) { c.s = 0; c.stopAt = 380 + i * 90; }
          } else if (c.s >= tr.total - 4) {
            c.v = 0; c.brake = true; c.hold = 3200; c.s = tr.total;
          } else {
            // cruise with a little variation, ease into each stop, pull away again
            let target = 9.5 + 3.5 * Math.sin(c.s / 110 + i * 1.7);
            const toStop = c.stopAt - c.s;
            if (toStop > -2 && toStop < 70) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 2.4 * toStop)) + 0.4);
            if (toStop <= 1.2 && toStop > -2) { c.hold = 1800 + (i % 3) * 500; c.stopAt = c.s + 330 + ((i * 53 + Math.round(c.s)) % 220); c.v = 0; }
            const dv = target - c.v;
            c.brake = dv < -0.6;
            c.v += Math.max(-4.2 * dt, Math.min(2.2 * dt, dv));
            c.s = Math.min(tr.total, c.s + c.v * dt);
          }
        }
        const p = pointAt(tr, c.s);
        c.lng = p.lng; c.lat = p.lat;
        c.bearing = angleLerp(c.bearing, p.bearing, still ? 1 : Math.min(1, dt * 6));
        const m = carMarkers.current[i];
        if (m) m.setLngLat([c.lng, c.lat]);
        const img = carRefs.current[i];
        if (img) {
          img.style.backgroundPosition = `${-carFrame(c.bearing) * CAR_PX}px 0`;
        }
      });

      const c = sim[si];
      const tr = tracks[si];
      tagMarker.current?.setLngLat([c.lng, c.lat]);
      // camera follow (paused while flying between cities)
      if (!flying.current) {
        camLng += (c.lng - camLng) * Math.min(1, dt * 3.2);
        camLat += (c.lat - camLat) * Math.min(1, dt * 3.2);
        map.jumpTo({ center: [camLng, camLat], zoom: ZOOM, pitch: PITCH, bearing: BEARING, padding: PAD });
      }
      (map.getSource(SRC_FULL) as GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: remaining(tr, c.s) } });

      const t = c.s / tr.total;
      const min = Math.max(1, Math.round(((tr.duration * (1 - t)) / 60) * 1.15));
      const km = Math.max(0.1, +((tr.total - c.s) / 1000).toFixed(1));
      const speed = Math.round(c.v * 3.6);
      const pct = Math.round(t * 100);
      setLive((l) => (l.min === min && l.km === km && l.speed === speed && l.pct === pct ? l : { min, km, speed, pct }));
    };

    selectRoute();
    if (reduce || !visible) { frame(performance.now(), true); return; }
    const loop = (now: number) => { frame(now, false); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mapState, visible, reduce, tracks]);

  if (!current || !track) return null;

  const pick = (i: number) => {
    setPaused(true);
    window.setTimeout(() => setPaused(false), 25000);
    setSel(i);
  };

  return (
    <div ref={root} className="relative overflow-hidden rounded-[32px] border border-line bg-surface p-3 shadow-soft sm:p-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-accent-bright/10 blur-3xl" />

      <div className="relative mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 sm:mb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-050">
            <span className="absolute h-9 w-9 animate-ping rounded-full bg-accent-bright/25" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-accent-bright" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-lead font-semibold leading-tight text-ink">{title}</h3>
            <p className="truncate text-detail text-muted"><span>{`${items.length} cars on the road`}</span>{` · ${[...new Set(items.map((it) => it.city))].join(' · ')}`}</p>
          </div>
        </div>
        {preview && <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Live preview</span>}
      </div>

      {stats && (
        <div className="relative grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {stats.map((st) => (
            <div key={st.label} className="rounded-2xl border border-line bg-panel/50 p-3.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent-050 text-accent"><Icon name={st.icon} size={15} /></span>
              <p className="mt-2.5 font-display text-[1.375rem] font-semibold leading-none text-ink">{st.value}</p>
              <p className="mt-1.5 text-caption text-muted">{st.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className={`relative grid gap-3 lg:grid-cols-[minmax(0,300px)_1fr] ${stats ? 'mt-3' : ''}`}>
        <div className="space-y-2">
          {items.map((it, i) => {
            const on = i === sel;
            return (
              <button
                key={it.id}
                ref={(n) => { cardRefs.current[i] = n; }}
                onClick={() => pick(i)}
                className={`relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-2.5 text-left transition-[border-color,box-shadow,background-color] duration-300 ${
                  on ? 'border-accent-bright bg-accent-050/60 shadow-[0_0_0_3px_rgba(0,212,71,0.14)]' : 'border-line bg-surface hover:bg-panel/50'
                }`}
              >
                <Img src={it.image} alt="" className="h-[60px] w-[90px] shrink-0 rounded-xl bg-panel object-cover" fallback={<span className="grid h-[60px] w-[90px] shrink-0 place-items-center rounded-xl bg-panel text-faint"><Icon name="car" size={20} /></span>} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: HERO_COLORS[i % HERO_COLORS.length] }} /><span className="truncate text-detail font-semibold text-ink">{it.title}</span></span>
                    <span className="shrink-0 rounded-full bg-accent-050 px-2 py-0.5 text-[10px] font-semibold text-accent">{it.status}</span>
                  </span>
                  <span className="block truncate text-caption text-muted">{it.plate}</span>
                  <span className="mt-1 flex items-center gap-1.5">
                    {it.avatar ? <img src={it.avatar} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="h-4 w-4 rounded-full bg-panel" />}
                    <span className="truncate text-caption text-ink-soft">{it.person}</span>
                  </span>
                </span>
                {on && <span className="absolute bottom-0 left-0 h-[3px] bg-accent-bright/80" style={{ width: `${live.pct}%` }} />}
              </button>
            );
          })}
        </div>

        {/* The map — a real city, flat, the selected car followed by the camera */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-[#f2f4f7] sm:aspect-[64/44]">
          <div ref={mapBox} style={{ position: 'absolute', inset: 0 }} role="img" aria-label={`Map of ${current.city}`} />
          {mapState !== 'ready' && (
            <div className="absolute inset-0 grid place-items-center bg-[#f2f4f7] text-detail text-muted">
              {mapState === 'failed' ? 'Map unavailable' : <span className="skeleton absolute inset-0" />}
            </div>
          )}
          {mapState === 'ready' && (
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-semibold text-ink shadow-[0_6px_18px_-6px_rgba(22,22,26,0.3)]">
              <Icon name="pin" size={13} className="text-accent" /> {current.city}
            </div>
          )}

          <AnimatePresence mode="wait">
            {showCard && mapState === 'ready' && (
              <motion.div
                key={current.id}
                initial={reduce ? false : { opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
                transition={SPRING_SMOOTH}
                className="absolute inset-x-2.5 bottom-9 z-20 rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur sm:inset-x-3"
              >
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                  <div className="flex min-w-0 flex-1 basis-[200px] items-center gap-2.5">
                    {current.avatar ? <img src={current.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="h-9 w-9 shrink-0 rounded-full bg-panel" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-detail font-semibold text-ink">{current.person}</p>
                      <p className="text-caption text-muted">Customer</p>
                    </div>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="phone" size={14} /></span>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-white"><Icon name="message" size={14} /></span>
                  </div>
                  <div className="grid grid-cols-3 gap-5">
                    <div>
                      <p className="font-display text-body font-semibold leading-tight text-ink">{live.min} min</p>
                      <p className="text-caption text-muted">Arriving in</p>
                    </div>
                    <div>
                      <p className="font-display text-body font-semibold leading-tight text-ink">{live.km.toFixed(1)} km</p>
                      <p className="text-caption text-muted">Distance left</p>
                    </div>
                    <div>
                      <p className="font-display text-body font-semibold leading-tight text-ink">{live.speed} <span className="text-caption font-medium text-muted">km/h</span></p>
                      <p className="text-caption text-muted">Speed</p>
                    </div>
                  </div>
                </div>
                <div className="mt-2.5">
                  <div className="h-1 overflow-hidden rounded-full bg-panel"><div className="h-full rounded-full bg-ink" style={{ width: `${live.pct}%` }} /></div>
                  <div className="mt-1.5 flex justify-between gap-2 text-[10px] font-medium text-faint"><span className="truncate">{track.from}</span><span className="truncate text-right">{track.to}</span></div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {!reduce && (
        <div ref={cursorRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-30 hidden transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:block">
          <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"><path d="M4 2 L20 11 L12 13 L9 21 Z" fill="#16161a" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        </div>
      )}

      {/* the cars, drawn into their map markers */}
      {carEls.map((el, i) =>
        createPortal(
          <div
            ref={(n) => { carRefs.current[i] = n; }}
            style={{
              position: 'relative',
              width: CAR_PX,
              height: CAR_PX,
              backgroundImage: `url(${CAR_SHEETS[i % CAR_SHEETS.length]})`,
              backgroundSize: `${CAR_PX * CAR_FRAMES}px ${CAR_PX}px`,
              backgroundRepeat: 'no-repeat',
              transform: i === sel ? 'scale(1.08)' : 'scale(0.96)',
              opacity: i === sel ? 1 : 0.9,
              transition: 'transform 300ms',
              filter: 'drop-shadow(0 2px 3px rgba(22,22,26,0.18))',
            }}
          >
          </div>,
          el,
        ),
      )}

      {/* the ETA bubble above the selected car */}
      {tagEl &&
        createPortal(
          <span className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white py-1 pl-3 pr-1 text-[12px] font-semibold text-ink shadow-[0_6px_18px_-4px_rgba(22,22,26,0.28)]">
            {live.min} min
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 text-[9px] font-bold tracking-wide text-white">CX</span>
          </span>,
          tagEl,
        )}
    </div>
  );
}
