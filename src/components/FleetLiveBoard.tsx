import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MapLibreMap, Marker as MapLibreMarker, GeoJSONSource } from 'maplibre-gl';
import { Icon, type IconName } from './Icon';
import { Img } from './motion';
import { motion, AnimatePresence, useReducedMotion, SPRING_SMOOTH } from './motionKit';
import routesData from '../data/liveRoutes.json';

/** An animated "live fleet" board: stat tiles, a list of cars, and a real map
 *  of the car's city (real streets, real place names, 3D buildings) where the
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
const ZOOM = 16.7;
const PITCH = 58;
const BEARING = -18;
const SELECT_MS = 11000;
const HERO_COLORS = ['#17181c', '#f6f7f9', '#2c3a55'];

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

const slice = (t: Track, s: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < t.coords.length && t.cum[i] <= s; i++) out.push(t.coords[i]);
  const p = pointAt(t, s);
  out.push([p.lng, p.lat]);
  return out;
};

const angleLerp = (from: number, to: number, f: number) => from + ((((to - from) % 360) + 540) % 360 - 180) * f;

/* ------------------------------- sprite ------------------------------- */
/** A top-down car in the style of a ride-hailing map: soft shadow, body, glass,
 *  roof, mirrors, head- and tail-lights. Drawn in a 38×16 box; `brake` receives
 *  the tail-light group so the board can light it when the car slows. */
function CarSprite({ color, brake }: { color: string; brake: (el: SVGGElement | null) => void }) {
  const light = color === '#f6f7f9';
  const glass = '#2a3040';
  const edge = light ? 'rgba(60,70,90,0.35)' : 'rgba(255,255,255,0.14)';
  return (
    <g>
      <ellipse cx="1" cy="2.2" rx="20" ry="9" fill="rgba(40,50,70,0.22)" />
      {[-12.5, 10].map((x) => (
        <g key={x} fill="#20242c">
          <rect x={x} y="-8.7" width="6.5" height="2" rx="1" />
          <rect x={x} y="6.7" width="6.5" height="2" rx="1" />
        </g>
      ))}
      <path d="M-19 -5.4 C-19 -7.4 -16.5 -8 -13 -8 L11 -8 C15.6 -8 19 -6.4 19.6 -3.8 L19.6 3.8 C19 6.4 15.6 8 11 8 L-13 8 C-16.5 8 -19 7.4 -19 5.4 Z" fill={color} stroke={edge} strokeWidth="0.5" />
      <path d="M9 -7 C11 -4 11 4 9 7 M-13 -6.6 C-14.4 -3 -14.4 3 -13 6.6" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="0.5" />
      <path d="M2.4 -6.2 L8.6 -5 C9.8 -2.8 9.8 2.8 8.6 5 L2.4 6.2 Z" fill={glass} />
      <path d="M-8.4 -5.6 L-12.6 -4.5 C-13.6 -2.4 -13.6 2.4 -12.6 4.5 L-8.4 5.6 Z" fill={glass} />
      <rect x="-8.8" y="-6" width="11.6" height="12" rx="2.6" fill={light ? '#e3e7ee' : color} stroke={edge} strokeWidth="0.45" />
      <rect x="-8" y="-6.4" width="10" height="1.1" rx="0.5" fill={glass} opacity="0.8" />
      <rect x="-8" y="5.3" width="10" height="1.1" rx="0.5" fill={glass} opacity="0.8" />
      <rect x="-6.6" y="-3.8" width="8" height="7.6" rx="2" fill="rgba(255,255,255,0.1)" />
      <rect x="3.6" y="-9" width="3" height="1.6" rx="0.8" fill={color} stroke={edge} strokeWidth="0.3" />
      <rect x="3.6" y="7.4" width="3" height="1.6" rx="0.8" fill={color} stroke={edge} strokeWidth="0.3" />
      <rect x="18" y="-6" width="1.8" height="3" rx="0.9" fill="#fff7cf" />
      <rect x="18" y="3" width="1.8" height="3" rx="0.9" fill="#fff7cf" />
      <g ref={brake} style={{ opacity: 0.2 }}>
        <rect x="-19.4" y="-6.2" width="1.8" height="3.2" rx="0.9" fill="#ff3b30" />
        <rect x="-19.4" y="3" width="1.8" height="3.2" rx="0.9" fill="#ff3b30" />
      </g>
    </g>
  );
}

const SRC_FULL = 'fl-route';
const SRC_DONE = 'fl-done';

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
  const brakeRefs = useRef<(SVGGElement | null)[]>([]);
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
          // 3D buildings, under the labels
          const labelLayer = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
          map.addLayer(
            {
              id: 'fl-3d',
              type: 'fill-extrusion',
              source: 'openmaptiles',
              'source-layer': 'building',
              minzoom: 14,
              paint: {
                'fill-extrusion-color': '#fbfbfd',
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 9],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.96,
              },
            },
            labelLayer,
          );
          // the route: white casing, soft green line, bright green for the part already driven
          const empty = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [] as [number, number][] } };
          map.addSource(SRC_FULL, { type: 'geojson', data: empty });
          map.addSource(SRC_DONE, { type: 'geojson', data: empty });
          const layout = { 'line-cap': 'round' as const, 'line-join': 'round' as const };
          map.addLayer({ id: 'fl-casing', type: 'line', source: SRC_FULL, layout, paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.95 } }, labelLayer);
          map.addLayer({ id: 'fl-base', type: 'line', source: SRC_FULL, layout, paint: { 'line-color': '#bfeccd', 'line-width': 5 } }, labelLayer);
          map.addLayer({ id: 'fl-done', type: 'line', source: SRC_DONE, layout, paint: { 'line-color': '#00c93f', 'line-width': 5 } }, labelLayer);

          // the customer waiting at each destination
          items.forEach((it, i) => {
            const end = tracks[i].coords[tracks[i].coords.length - 1];
            const el = document.createElement('div');
            el.className = 'fl-pin';
            const pulse = document.createElement('span');
            pulse.className = 'fl-pin__pulse';
            const ring = document.createElement('span');
            ring.className = 'fl-pin__ring';
            if (it.avatar) { const img = document.createElement('img'); img.src = it.avatar; img.alt = ''; ring.appendChild(img); }
            el.append(pulse, ring);
            new maplibregl.Marker({ element: el }).setLngLat(end).addTo(map);
          });

          // car markers lie flat on the map and turn with the road
          const els: HTMLElement[] = [];
          carMarkers.current = items.map((_, i) => {
            const el = document.createElement('div');
            els.push(el);
            const p = pointAt(tracks[i], 0);
            return new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([p.lng, p.lat]).addTo(map);
          });

          // the ETA bubble that rides above the selected car
          const tag = document.createElement('div');
          tagMarker.current = new maplibregl.Marker({ element: tag, anchor: 'bottom', offset: [0, -16] }).setLngLat([start.lng, start.lat]).addTo(map);

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
      const feat = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: tracks[i].coords } };
      (map.getSource(SRC_FULL) as GeoJSONSource | undefined)?.setData(feat);
      const c = sim[i];
      if (lastSel.current !== -1) {
        flying.current = true;
        map.flyTo({ center: [c.lng, c.lat], zoom: ZOOM, pitch: PITCH, bearing: BEARING, duration: 2200, essential: true });
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
        if (m) { m.setLngLat([c.lng, c.lat]); m.setRotation(c.bearing - 90); }
        const b = brakeRefs.current[i];
        if (b) b.style.opacity = c.brake ? '1' : '0.2';
      });

      const c = sim[si];
      const tr = tracks[si];
      tagMarker.current?.setLngLat([c.lng, c.lat]);
      // camera follow (paused while flying between cities)
      if (!flying.current) {
        camLng += (c.lng - camLng) * Math.min(1, dt * 3.2);
        camLat += (c.lat - camLat) * Math.min(1, dt * 3.2);
        map.jumpTo({ center: [camLng, camLat], zoom: ZOOM, pitch: PITCH, bearing: BEARING });
      }
      (map.getSource(SRC_DONE) as GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: slice(tr, c.s) } });

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

      <div className="relative mb-3 flex flex-wrap items-center justify-between gap-2 px-1 sm:mb-4">
        <div className="flex items-center gap-2.5">
          <span className="relative grid h-2.5 w-2.5 place-items-center">
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-accent-bright/60" />
            <span className="h-2 w-2 rounded-full bg-accent-bright" />
          </span>
          <h3 className="font-display text-lead font-semibold text-ink">{title}</h3>
          <span className="text-detail text-muted">{`· ${items.length} cars on the road`}</span>
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

        {/* The map — a real city, 3D buildings, the selected car followed by the camera */}
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
                className="absolute bottom-2.5 left-2.5 right-2.5 z-20 rounded-2xl border border-line bg-surface/95 p-3.5 shadow-pop backdrop-blur sm:bottom-8 sm:left-auto sm:right-3 sm:w-[270px]"
              >
                <div className="flex items-center gap-2.5">
                  {current.avatar ? <img src={current.avatar} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="h-9 w-9 rounded-full bg-panel" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-detail font-semibold text-ink">{current.person}</p>
                    <p className="text-caption text-muted">Customer</p>
                  </div>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="phone" size={14} /></span>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white"><Icon name="message" size={14} /></span>
                </div>
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel"><div className="h-full rounded-full bg-accent-bright" style={{ width: `${live.pct}%` }} /></div>
                  <div className="mt-1.5 flex justify-between gap-2 text-[10px] font-medium text-faint"><span className="truncate">{track.from}</span><span className="truncate text-right">{track.to}</span></div>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2 border-y border-line py-2.5">
                  <div>
                    <p className="font-display text-body font-semibold text-ink">{live.min} min</p>
                    <p className="text-caption text-muted">Arriving in</p>
                  </div>
                  <div>
                    <p className="font-display text-body font-semibold text-ink">{live.km.toFixed(1)} km</p>
                    <p className="text-caption text-muted">Distance left</p>
                  </div>
                  <div>
                    <p className="font-display text-body font-semibold text-ink">{live.speed} <span className="text-caption font-medium text-muted">km/h</span></p>
                    <p className="text-caption text-muted">Speed</p>
                  </div>
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
          <svg viewBox="-26 -14 52 28" width="46" height="25" style={{ display: 'block', overflow: 'visible' }}>
            <g transform={i === sel ? 'scale(1.1)' : undefined}>
              <CarSprite color={HERO_COLORS[i % HERO_COLORS.length]} brake={(g) => { brakeRefs.current[i] = g; }} />
            </g>
          </svg>,
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
