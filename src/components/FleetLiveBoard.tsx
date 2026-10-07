import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { Img } from './motion';
import { motion, AnimatePresence, useReducedMotion, SPRING_SMOOTH } from './motionKit';
import { buildCity, WORLD } from '../lib/cityMap';

/** An animated "live fleet" board: stat tiles, a list of cars on the road,
 *  and a map where the selected car drives its route while a cursor picks
 *  cars one after another and a trip card opens. The map is an illustrated
 *  one and the movement is a simulation — there is no GPS feed behind it —
 *  so callers pass `preview` to label it as such. */

export interface LiveItem {
  id: string;
  title: string;
  image: string;
  plate: string;
  person: string;
  avatar?: string;
  etaMin: number;
  km: number;
  pickup: string;
  dropoff: string;
  status: string;
}
export interface LiveStat { label: string; value: string; icon: IconName }

const TRAVEL_MS = 14000;
const HOLD_MS = 1800;
const CYCLE = TRAVEL_MS + HOLD_MS;
const SELECT_MS = 9000;
// the camera: how much of the city is in view
const VIEW_W = 640;
const VIEW_H = 440;
// start / end intersections of each listed car's trip
const TRIPS: [[number, number], [number, number]][] = [
  [[1, 7], [11, 1]],
  [[11, 7], [2, 2]],
  [[1, 1], [10, 6]],
];
// ambient traffic: a pool of routes, driven both ways, plus signalised junctions
const AMBIENT: [[number, number], [number, number]][] = [
  [[0, 4], [12, 4]], [[6, 0], [6, 8]], [[12, 2], [3, 8]], [[2, 0], [9, 8]], [[0, 7], [8, 1]],
  [[12, 6], [4, 0]], [[0, 1], [12, 1]], [[2, 8], [2, 0]], [[10, 0], [10, 8]], [[0, 7], [12, 7]],
];
type VKind = 'car' | 'small' | 'van' | 'bus' | 'moto';
const KINDS: Record<VKind, { len: number; wid: number; vmax: number; acc: number }> = {
  car: { len: 24, wid: 12, vmax: 82, acc: 70 },
  small: { len: 20, wid: 11, vmax: 76, acc: 76 },
  van: { len: 30, wid: 13, vmax: 66, acc: 52 },
  bus: { len: 46, wid: 14, vmax: 56, acc: 38 },
  moto: { len: 14, wid: 6, vmax: 96, acc: 110 },
};
const VEHICLE_MIX: VKind[] = ['car', 'car', 'small', 'car', 'van', 'small', 'car', 'bus', 'car', 'moto', 'small', 'car', 'van', 'car', 'small', 'car', 'moto', 'car', 'bus', 'car', 'small', 'car', 'van', 'car'];
const VEHICLE_COLORS = ['#8d948b', '#b9beb6', '#6f766d', '#d4d8cf', '#5b6b8c', '#a4423c', '#c9b27a', '#4d5a50', '#e2e4de', '#3f4742'];
const LIGHT_NODES: [number, number][] = [[2, 1], [6, 4], [10, 4], [2, 7], [10, 1], [6, 1]];
const LIGHT_CYCLE = 15000; // ms: horizontal green, amber, vertical green, amber
const lightState = (now: number, horizontal: boolean): 'green' | 'amber' | 'red' => {
  const c = (now + 0) % LIGHT_CYCLE;
  const hGreen = c < 6500, hAmber = c >= 6500 && c < 7500, vGreen = c >= 7500 && c < 14000;
  if (horizontal) return hGreen ? 'green' : hAmber ? 'amber' : 'red';
  return vGreen ? 'green' : c >= 14000 ? 'amber' : 'red';
};
const LANE = 4.4;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);


export function FleetLiveBoard({ items, stats, preview = true, title = 'Live tracking' }: { items: LiveItem[]; stats?: LiveStat[]; preview?: boolean; title?: string }) {
  const reduce = useReducedMotion();
  const city = useMemo(() => buildCity(), []);
  const routesD = useMemo(() => items.map((_, i) => city.routeBetween(...TRIPS[i % TRIPS.length])), [city, items]);
  const ambientD = useMemo(() => AMBIENT.map(([a, b]) => city.routeBetween(a, b)), [city]);
  const vehicles = useMemo(() => VEHICLE_MIX.map((kind, i) => ({ kind, route: i % AMBIENT.length, dir: i % 2 === 0 ? 1 : -1, color: VEHICLE_COLORS[(i * 7) % VEHICLE_COLORS.length], jitter: 0.9 + ((i * 37) % 21) / 100 })), []);

  const [sel, setSel] = useState(0);
  const [visible, setVisible] = useState(false);
  const [live, setLive] = useState({ min: items[0]?.etaMin ?? 0, km: items[0]?.km ?? 0, speed: 42, pct: 0 });
  const [showCard, setShowCard] = useState(false);
  const [paused, setPaused] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const routeRefs = useRef<(SVGPathElement | null)[]>([]);
  const ambientRefs = useRef<(SVGPathElement | null)[]>([]);
  const carRefs = useRef<(SVGGElement | null)[]>([]);
  const ambientCars = useRef<(SVGGElement | null)[]>([]);
  const brakeRefs = useRef<(SVGGElement | null)[]>([]);
  const lightRefs = useRef<(SVGGElement | null)[]>([]);
  const trailRef = useRef<SVGPathElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const selRef = useRef(0);
  selRef.current = sel;
  const cam = useRef<{ x: number; y: number } | null>(null);

  const current = items[sel] ?? items[0];

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
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

  // Every car drives its own street route; ambient traffic fills the roads;
  // the camera follows the selected car like a navigation app.
  useEffect(() => {
    if (!items.length) return;
    const paths = items.map((_, i) => routeRefs.current[i]);
    const lens = paths.map((pa) => pa?.getTotalLength() ?? 0);
    const apaths = ambientRefs.current;
    const alens = apaths.map((pa) => pa?.getTotalLength() ?? 0);
    const svg = svgRef.current;
    // vehicles start spread along their routes
    const sim = vehicles.map((vh, i) => ({ route: vh.route, dir: vh.dir, s: ((i * 197) % 1000) / 1000 * (alens[vh.route] || 1000) * 0.9, v: 30 + (i % 5) * 8, braking: false }));
    // where each signalled junction sits along each route
    const lightsOnRoute: { s: number; horizontal: boolean }[][] = apaths.map((path, ri) => {
      const out: { s: number; horizontal: boolean }[] = [];
      if (!path) return out;
      const L = alens[ri];
      LIGHT_NODES.forEach(([ni, nj]) => {
        const nd = city.node(ni, nj);
        let best = 1e9, bs = 0;
        for (let sx = 0; sx <= L; sx += 5) { const pt = path.getPointAtLength(sx); const d = Math.hypot(pt.x - nd.x, pt.y - nd.y); if (d < best) { best = d; bs = sx; } }
        if (best < 16) {
          const a1 = path.getPointAtLength(Math.max(0, bs - 3)), a2 = path.getPointAtLength(Math.min(L, bs + 3));
          out.push({ s: bs, horizontal: Math.abs(a2.x - a1.x) > Math.abs(a2.y - a1.y) });
        }
      });
      return out.sort((m, n) => m.s - n.s);
    });
    const clampView = (cx: number, cy: number) => ({
      x: Math.max(0, Math.min(WORLD.w - VIEW_W, cx - VIEW_W / 2)),
      y: Math.max(0, Math.min(WORLD.h - VIEW_H, cy - VIEW_H / 2)),
    });
    const pose = (path: SVGPathElement, len: number, t: number) => {
      const p = path.getPointAtLength(len * t);
      const q = path.getPointAtLength(Math.min(len, len * t + 1));
      return { p, a: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI };
    };
    let lastNow = 0;
    const frame = (now: number, still: boolean) => {
      const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
      lastNow = now;
      const si = selRef.current;
      let selPoint: { x: number; y: number } | null = null;
      items.forEach((it, i) => {
        const path = paths[i];
        const car = carRefs.current[i];
        if (!path || !car) return;
        const local = still ? CYCLE * (i === si ? 0.45 : 0.3 + i * 0.15) : (now + i * (CYCLE / items.length)) % CYCLE;
        const t = easeInOut(Math.min(1, local / TRAVEL_MS));
        const { p, a } = pose(path, lens[i], t);
        car.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${a})`);
        if (i !== si) return;
        selPoint = p;
        const trail = trailRef.current;
        if (trail) trail.style.strokeDasharray = `${lens[i] * t} ${lens[i]}`;
        const min = Math.max(1, Math.round(it.etaMin * (1 - t)));
        const km = Math.max(0.1, +(it.km * (1 - t)).toFixed(1));
        const speed = Math.round(t > 0.03 && t < 0.97 ? 38 + 12 * Math.sin(now / 900 + i) + 12 * Math.sin(t * Math.PI) : 0);
        const done = Math.round(t * 100);
        setLive((l) => (l.min === min && l.km === km && l.speed === speed && l.pct === done ? l : { min, km, speed, pct: done }));
      });
      // ---- ambient traffic: lanes, speeds, junction signals, queues ----
      const nowMs = still ? 3000 : now;
      LIGHT_NODES.forEach((_, li) => {
        const g = lightRefs.current[li];
        if (!g) return;
        const h = lightState(nowMs, true);
        const v = lightState(nowMs, false);
        const col = (st: string) => (st === 'green' ? '#22c55e' : st === 'amber' ? '#f59e0b' : '#ef4444');
        (g.children[0] as SVGElement)?.setAttribute('fill', col(h));
        (g.children[1] as SVGElement)?.setAttribute('fill', col(v));
      });
      if (!still) {
        const groups = new Map<string, number[]>();
        sim.forEach((vh, i) => { const k = `${vh.route}:${vh.dir}`; groups.set(k, [...(groups.get(k) ?? []), i]); });
        sim.forEach((vh, i) => {
          const spec = KINDS[vehicles[i].kind];
          const len = alens[vh.route];
          const path = apaths[vh.route];
          if (!path || !len) return;
          const sEff = vh.dir > 0 ? vh.s : len - vh.s;
          let vdes = spec.vmax * vehicles[i].jitter;
          // slow for corners: how much the road bends just ahead
          const ahead = Math.min(len, Math.max(0, sEff + vh.dir * 26));
          const p0 = path.getPointAtLength(sEff);
          const p1 = path.getPointAtLength(ahead);
          const p2 = path.getPointAtLength(Math.min(len, Math.max(0, sEff + vh.dir * 52)));
          const turn = Math.abs(Math.atan2(p2.y - p1.y, p2.x - p1.x) - Math.atan2(p1.y - p0.y, p1.x - p0.x));
          if (turn > 0.12 && turn < 3) vdes *= Math.max(0.42, 1 - turn * 0.9);
          // the next signal on this route, in the direction of travel
          for (const lt of lightsOnRoute[vh.route]) {
            const dist = vh.dir > 0 ? lt.s - vh.s : vh.s - (len - lt.s);
            if (dist < -2 || dist > 150) continue;
            const stopAt = dist - 24;
            const st = lightState(nowMs, lt.horizontal);
            const mustStop = st === 'red' || (st === 'amber' && stopAt > vh.v * 0.9);
            if (mustStop && stopAt > -6) { vdes = Math.min(vdes, Math.sqrt(Math.max(0, 2 * spec.acc * 1.4 * Math.max(0, stopAt)))); if (stopAt < 1.5) vdes = 0; }
            break;
          }
          // keep a gap to the vehicle in front
          let lead = Infinity;
          for (const j of groups.get(`${vh.route}:${vh.dir}`) ?? []) {
            if (j === i) continue;
            const g = sim[j].s - vh.s - KINDS[vehicles[j].kind].len * 0.5 - spec.len * 0.5;
            if (g > -1 && g < lead) { lead = g; }
          }
          if (lead < 46) vdes = Math.min(vdes, Math.max(0, (lead - 10) * 2.2));
          const dv = vdes - vh.v;
          vh.braking = dv < -6 || vdes < 4;
          vh.v += Math.max(-spec.acc * 2.6 * dt, Math.min(spec.acc * dt, dv));
          vh.s += vh.v * dt;
          if (vh.s > len - 2) { vh.s = 0; vh.v = 0; }
        });
      }
      sim.forEach((vh, i) => {
        const car = ambientCars.current[i];
        const path = apaths[vh.route];
        const len = alens[vh.route];
        if (!car || !path || !len) return;
        const sEff = vh.dir > 0 ? vh.s : len - vh.s;
        const p = path.getPointAtLength(sEff);
        const q = path.getPointAtLength(Math.min(len, Math.max(0, sEff + vh.dir * 1.5)));
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        const ox = -Math.sin(ang) * LANE;
        const oy = Math.cos(ang) * LANE;
        const edge = Math.min(vh.s, len - vh.s);
        car.setAttribute('transform', `translate(${(p.x + ox).toFixed(1)} ${(p.y + oy).toFixed(1)}) rotate(${((ang * 180) / Math.PI).toFixed(1)})`);
        car.style.opacity = String(Math.max(0, Math.min(1, edge / 40)));
        const br = brakeRefs.current[i];
        if (br) br.style.opacity = vh.braking ? '1' : '0.15';
      });
      if (svg && selPoint) {
        const target = clampView((selPoint as { x: number; y: number }).x, (selPoint as { x: number; y: number }).y);
        if (!cam.current || still) cam.current = target;
        else cam.current = { x: cam.current.x + (target.x - cam.current.x) * Math.min(1, dt * 2.6), y: cam.current.y + (target.y - cam.current.y) * Math.min(1, dt * 2.6) };
        svg.setAttribute('viewBox', `${cam.current.x.toFixed(1)} ${cam.current.y.toFixed(1)} ${VIEW_W} ${VIEW_H}`);
        const tag = tagRef.current;
        if (tag) {
          tag.style.left = `${(((selPoint as { x: number }).x - cam.current.x) / VIEW_W) * 100}%`;
          tag.style.top = `${(((selPoint as { y: number }).y - cam.current.y) / VIEW_H) * 100}%`;
        }
      }
    };
    if (reduce || !visible) { frame(0, true); return; }
    let raf = 0;
    const loop = (now: number) => { frame(now, false); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible, reduce, items, sel, routesD, ambientD, vehicles, city]);

  if (!current) return null;

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
                    <span className="truncate text-detail font-semibold text-ink">{it.title}</span>
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

        {/* Map — a navigation-style view that follows the selected car */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-[#eceee7] sm:aspect-[64/44]">
          <svg ref={svgRef} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <filter id="fl-car-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#16161a" floodOpacity="0.35" /></filter>
              {city.labels.map((l) => <path key={l.id} id={l.id} d={l.d} />)}
            </defs>
            <rect x="-50" y="-50" width={WORLD.w + 100} height={WORLD.h + 100} fill="#eceee7" />
            <path d={city.parks} fill="#d7e8cd" />
            {city.trees.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={t.r} fill="#c4dcb8" />)}
            <path d={city.river} fill="none" stroke="#c3dbe7" strokeWidth="74" strokeLinecap="round" strokeLinejoin="round" />
            <path d={city.river} fill="none" stroke="#d9eaf2" strokeWidth="62" strokeLinecap="round" strokeLinejoin="round" />
            <path d={city.buildings.a} fill="#e3e5dd" stroke="#d3d6cc" strokeWidth="0.8" />
            <path d={city.buildings.b} fill="#dde0d8" stroke="#cfd3c9" strokeWidth="0.8" />
            <path d={city.buildings.c} fill="#e8eae3" stroke="#d3d6cc" strokeWidth="0.8" />
            {/* roads: casing first, then the surface */}
            <path d={city.locals} fill="none" stroke="#d6d9cf" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
            <path d={city.arterials} fill="none" stroke="#e1d8c0" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
            <path d={city.locals} fill="none" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <path d={city.arterials} fill="none" stroke="#fffdf6" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
            <path d={city.arterials} fill="none" stroke="#efe9d8" strokeWidth="1" strokeDasharray="9 11" strokeLinecap="round" />
            {city.roundabouts.map((r, i) => (
              <g key={i} transform={`translate(${r.x} ${r.y})`}>
                <circle r="34" fill="#fffdf6" stroke="#e1d8c0" strokeWidth="3" />
                <circle r="19" fill="#d7e8cd" stroke="#e1d8c0" strokeWidth="2" />
              </g>
            ))}
            {city.labels.map((l, i) => (
              <text key={l.id} fontSize="10.5" fontWeight="600" fill="#9aa194" style={{ letterSpacing: '0.12em' }} dy="-11">
                <textPath href={`#${l.id}`} startOffset={`${12 + (i % 3) * 22}%`}>{l.name.toUpperCase()}</textPath>
              </text>
            ))}
            {city.places.map((pl) => (
              <g key={pl.label} transform={`translate(${pl.x} ${pl.y})`}>
                <circle r="9" fill="#ffffff" stroke="#cfd3c9" strokeWidth="1.5" />
                <circle r="3.4" fill="#00a63f" />
                <text y="-17" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#6c7568" stroke="#eceee7" strokeWidth="3" paintOrder="stroke">{pl.label}</text>
              </g>
            ))}

            {/* hidden geometry used to move the cars */}
            {routesD.map((d, i) => <path key={`r${i}`} ref={(n) => { routeRefs.current[i] = n; }} d={d} fill="none" stroke="none" />)}
            {ambientD.map((d, i) => <path key={`a${i}`} ref={(n) => { ambientRefs.current[i] = n; }} d={d} fill="none" stroke="none" />)}

            {/* selected route */}
            {routesD[sel] && (
              <>
                <path d={routesD[sel]} fill="none" stroke="#00d447" strokeWidth="5" strokeDasharray="1 9" strokeLinecap="round" opacity="0.5" />
                <path ref={trailRef} d={routesD[sel]} fill="none" stroke="#00d447" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
              </>
            )}

            {/* traffic lights */}
            {LIGHT_NODES.map(([ni, nj], li) => {
              const n = city.node(ni, nj);
              return (
                <g key={`tl${li}`} ref={(el) => { lightRefs.current[li] = el; }} transform={`translate(${n.x} ${n.y})`}>
                  <circle cx="-17" cy="-17" r="3.4" fill="#22c55e" stroke="#16161a" strokeWidth="1" />
                  <circle cx="17" cy="17" r="3.4" fill="#ef4444" stroke="#16161a" strokeWidth="1" />
                </g>
              );
            })}

            {/* ambient traffic: cars, vans, buses, motorbikes */}
            {vehicles.map((vh, i) => {
              const k = KINDS[vh.kind];
              const hl = k.wid / 2 - 2.2;
              return (
                <g key={`ac${i}`} ref={(el) => { ambientCars.current[i] = el; }}>
                  <rect x={-k.len / 2} y={-k.wid / 2} width={k.len} height={k.wid} rx={vh.kind === 'bus' ? 4 : vh.kind === 'moto' ? 3 : 5} fill={vh.color} stroke="rgba(22,22,26,0.28)" strokeWidth="0.8" />
                  {vh.kind !== 'moto' && <rect x={-k.len * 0.04} y={-k.wid / 2 + 1.6} width={k.len * 0.3} height={k.wid - 3.2} rx="2" fill="#ffffff" opacity="0.55" />}
                  {vh.kind === 'bus' && <rect x={-k.len / 2 + 4} y={-k.wid / 2 + 2} width={k.len - 14} height={k.wid - 4} rx="2" fill="#ffffff" opacity="0.35" />}
                  <circle cx={k.len / 2 - 1.5} cy={-hl} r="1.2" fill="#fff6c8" />
                  <circle cx={k.len / 2 - 1.5} cy={hl} r="1.2" fill="#fff6c8" />
                  <g ref={(el) => { brakeRefs.current[i] = el; }} style={{ opacity: 0.15 }}>
                    <circle cx={-k.len / 2 + 1.5} cy={-hl} r="1.5" fill="#ff3b30" />
                    <circle cx={-k.len / 2 + 1.5} cy={hl} r="1.5" fill="#ff3b30" />
                  </g>
                </g>
              );
            })}

            {/* destination pins */}
            {items.map((_, i) => {
              const e = city.node(...TRIPS[i % TRIPS.length][1]);
              const on = i === sel;
              return (
                <g key={`pin${i}`} transform={`translate(${e.x} ${e.y})`} opacity={on ? 1 : 0.5}>
                  {on && <circle r="22" fill="#00d447" opacity="0.2"><animate attributeName="r" values="14;30;14" dur="2.4s" repeatCount="indefinite" /></circle>}
                  <path d="M0 -4 C -11 -19 -13 -31 0 -37 C 13 -31 11 -19 0 -4 Z" fill="#16161a" />
                  <circle cx="0" cy="-24" r="4.8" fill="#00d447" />
                </g>
              );
            })}

            {/* the listed cars */}
            {items.map((_, i) => {
              const on = i === sel;
              return (
                <g key={`car${i}`} ref={(n) => { carRefs.current[i] = n; }} opacity={on ? 1 : 0.85}>
                  {on && <circle r="26" fill="#00d447" opacity="0.22" />}
                  <g filter="url(#fl-car-shadow)" transform={on ? 'scale(1.25)' : 'scale(0.95)'}>
                    <rect x="-14" y="-7.5" width="28" height="15" rx="6" fill={on ? '#16161a' : '#3c403b'} />
                    <rect x="-1" y="-5.5" width="8" height="11" rx="2.5" fill="#e8faec" />
                    <rect x="-9" y="-5.5" width="5" height="11" rx="2" fill="#e8faec" opacity="0.5" />
                    <circle cx="13" cy="-4.5" r="1.7" fill="#00d447" />
                    <circle cx="13" cy="4.5" r="1.7" fill="#00d447" />
                  </g>
                </g>
              );
            })}
          </svg>

          <div ref={tagRef} className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[190%]">
            <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-white shadow-pop">
              {current.person.split(' ')[0]} · {live.min} min
            </span>
          </div>

          <AnimatePresence mode="wait">
            {showCard && (
              <motion.div
                key={current.id}
                initial={reduce ? false : { opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
                transition={SPRING_SMOOTH}
                className="absolute bottom-2.5 left-2.5 right-2.5 z-20 rounded-2xl border border-line bg-surface/95 p-3.5 shadow-pop backdrop-blur sm:bottom-3 sm:left-auto sm:right-3 sm:w-[270px]"
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
                  <div className="mt-1.5 flex justify-between gap-2 text-[10px] font-medium text-faint"><span className="truncate">{current.pickup}</span><span className="truncate">{current.dropoff}</span></div>
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
    </div>
  );
}
