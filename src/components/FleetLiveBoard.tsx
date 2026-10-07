import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { Img } from './motion';
import { motion, AnimatePresence, useReducedMotion, SPRING_SMOOTH } from './motionKit';

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

const ROUTES = [
  'M 60 372 C 120 300, 150 262, 230 232 S 360 182, 420 112 S 500 62, 546 48',
  'M 556 366 C 500 322, 462 292, 400 272 S 282 252, 222 172 S 150 82, 92 58',
  'M 54 92 C 160 112, 222 132, 300 202 S 440 300, 534 336',
];
const STREETS = [
  'M 0 150 H 600', 'M 0 300 H 600', 'M 150 0 V 420', 'M 330 0 V 420', 'M 480 0 V 420',
  'M 0 40 L 200 420', 'M 600 120 L 380 420',
];
const SIDE = ['M 0 95 H 600', 'M 0 225 H 600', 'M 0 360 H 600', 'M 75 0 V 420', 'M 240 0 V 420', 'M 405 0 V 420', 'M 540 0 V 420'];
const BLOCKS: [number, number, number, number][] = [
  [20, 170, 110, 110], [170, 20, 140, 110], [350, 20, 110, 110], [500, 20, 80, 90],
  [350, 170, 110, 110], [500, 170, 80, 110], [20, 320, 110, 80], [170, 320, 140, 80], [350, 320, 110, 80],
  [20, 20, 110, 110], [170, 170, 140, 110],
];
const RIVER = 'M -20 262 C 90 236, 190 318, 320 292 S 540 350, 630 318';
const PARKS: [number, number, number, number][] = [[40, 190, 70, 56], [372, 40, 66, 52], [186, 336, 100, 42]];
const PLACES: { x: number; y: number; label: string }[] = [
  { x: 548, y: 30, label: 'Airport' }, { x: 92, y: 40, label: 'Old Town' }, { x: 536, y: 322, label: 'Station' },
];
const TRAVEL_MS = 9000;
const HOLD_MS = 1800;
const CYCLE = TRAVEL_MS + HOLD_MS;
const SELECT_MS = 7000;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const pct = (x: number, y: number) => ({ left: `${(x / 600) * 100}%`, top: `${(y / 420) * 100}%` });

export function FleetLiveBoard({ items, stats, preview = true, title = 'Live tracking' }: { items: LiveItem[]; stats?: LiveStat[]; preview?: boolean; title?: string }) {
  const reduce = useReducedMotion();
  const [sel, setSel] = useState(0);
  const [visible, setVisible] = useState(false);
  const [live, setLive] = useState({ min: items[0]?.etaMin ?? 0, km: items[0]?.km ?? 0, speed: 42, pct: 0 });
  const [showCard, setShowCard] = useState(false);
  const [paused, setPaused] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const routeRefs = useRef<(SVGPathElement | null)[]>([]);
  const carRefs = useRef<(SVGGElement | null)[]>([]);
  const trailRef = useRef<SVGPathElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const selRef = useRef(0);
  selRef.current = sel;

  const current = items[sel] ?? items[0];

  // Only simulate while the board is actually on screen.
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

  // Pick the next car every few seconds (unless the visitor took over).
  useEffect(() => {
    if (!visible || reduce || paused || items.length < 2) return;
    const id = window.setInterval(() => setSel((s) => (s + 1) % items.length), SELECT_MS);
    return () => window.clearInterval(id);
  }, [visible, reduce, paused, items.length]);

  // Every car drives its own route on a loop; the selected one is lit up.
  useEffect(() => {
    if (!items.length) return;
    const paths = items.map((_, i) => routeRefs.current[i % ROUTES.length]);
    const lens = paths.map((p) => p?.getTotalLength() ?? 0);
    const place = (i: number, t: number) => {
      const path = paths[i];
      const car = carRefs.current[i];
      if (!path || !car) return;
      const p = path.getPointAtLength(lens[i] * t);
      const q = path.getPointAtLength(Math.min(lens[i], lens[i] * t + 1));
      car.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${(Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI})`);
      return p;
    };
    const frame = (now: number, still: boolean) => {
      const si = selRef.current;
      items.forEach((it, i) => {
        const local = still ? CYCLE * (i === si ? 0.5 : 0.25 + i * 0.2) : (now + i * (CYCLE / items.length)) % CYCLE;
        const t = easeInOut(Math.min(1, local / TRAVEL_MS));
        const p = place(i, t);
        if (i !== si || !p) return;
        const trail = trailRef.current;
        if (trail) trail.style.strokeDasharray = `${lens[i] * t} ${lens[i]}`;
        const tag = tagRef.current;
        if (tag) { const at = pct(p.x, p.y); tag.style.left = at.left; tag.style.top = at.top; }
        const min = Math.max(1, Math.round(it.etaMin * (1 - t)));
        const km = Math.max(0.1, +(it.km * (1 - t)).toFixed(1));
        const speed = Math.round(t > 0.04 && t < 0.97 ? 38 + 14 * Math.sin(now / 900 + i) + 10 * Math.sin(t * Math.PI) : 0);
        const pctDone = Math.round(t * 100);
        setLive((l) => (l.min === min && l.km === km && l.speed === speed && l.pct === pctDone ? l : { min, km, speed, pct: pctDone }));
      });
    };
    if (reduce || !visible) { frame(0, true); return; }
    let raf = 0;
    const loop = (now: number) => { frame(now, false); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible, reduce, items, sel]);

  if (!current) return null;

  const pick = (i: number) => {
    setPaused(true);
    window.setTimeout(() => setPaused(false), 25000);
    setSel(i);
  };
  const route = ROUTES[sel % ROUTES.length];
  const endOf = (d: string) => {
    const m = d.trim().split(/\s+/);
    return { x: Number(m[m.length - 2]), y: Number(m[m.length - 1]) };
  };

  return (
    <div ref={root} className="relative overflow-hidden rounded-[32px] border border-line bg-surface p-3 shadow-soft sm:p-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-accent-bright/10 blur-3xl" />

      {/* Header strip */}
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
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-panel/50 p-3.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent-050 text-accent"><Icon name={s.icon} size={15} /></span>
              <p className="mt-2.5 font-display text-[1.375rem] font-semibold leading-none text-ink">{s.value}</p>
              <p className="mt-1.5 text-caption text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className={`relative grid gap-3 lg:grid-cols-[minmax(0,320px)_1fr] ${stats ? 'mt-3' : ''}`}>
        {/* Cars on the road */}
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
                {on && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-accent-bright/80" style={{ width: `${live.pct}%` }} />}
              </button>
            );
          })}
        </div>

        {/* Map */}
        <div className="relative overflow-hidden rounded-2xl border border-line bg-[#eef1ec]" style={{ aspectRatio: '600 / 420' }}>
          <svg viewBox="0 0 600 420" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <filter id="fl-car-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#16161a" floodOpacity="0.35" /></filter>
            </defs>
            {BLOCKS.map(([x, y, w, h], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} rx="14" fill={i % 4 === 0 ? '#e3ebde' : '#e8ece5'} />
            ))}
            {PARKS.map(([x, y, w, h], i) => (
              <rect key={`p${i}`} x={x} y={y} width={w} height={h} rx="22" fill="#d5e6cb" />
            ))}
            <path d={RIVER} fill="none" stroke="#cfe2ec" strokeWidth="30" strokeLinecap="round" />
            <path d={RIVER} fill="none" stroke="#e1eef4" strokeWidth="22" strokeLinecap="round" />
            {SIDE.map((d, i) => <path key={`s${i}`} d={d} fill="none" stroke="#f7f8f5" strokeWidth="5" />)}
            {[...STREETS, ...ROUTES].map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#dcdfd8" strokeWidth="15.5" strokeLinecap="round" />
            ))}
            {[...STREETS, ...ROUTES].map((d, i) => (
              <path key={`w${i}`} d={d} fill="none" stroke="#ffffff" strokeWidth="13" strokeLinecap="round" />
            ))}
            {ROUTES.map((d, i) => (
              <path key={`r${i}`} ref={(n) => { routeRefs.current[i] = n; }} d={d} fill="none" stroke="none" />
            ))}
            {PLACES.map((pl) => (
              <g key={pl.label} transform={`translate(${pl.x} ${pl.y})`}>
                <circle r="3.5" fill="#9aa396" />
                <text y="-8" textAnchor="middle" fontSize="9" fontWeight="600" fill="#7c8678" style={{ letterSpacing: '0.04em' }}>{pl.label}</text>
              </g>
            ))}

            {/* selected route */}
            <path d={route} fill="none" stroke="#00d447" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" opacity="0.6" />
            <path ref={trailRef} d={route} fill="none" stroke="#00d447" strokeWidth="5" strokeLinecap="round" />

            {/* destination pins */}
            {items.map((_, i) => {
              const e = endOf(ROUTES[i % ROUTES.length]);
              const on = i === sel;
              return (
                <g key={`pin${i}`} transform={`translate(${e.x} ${e.y})`} opacity={on ? 1 : 0.45}>
                  {on && <circle r="18" fill="#00d447" opacity="0.2"><animate attributeName="r" values="12;24;12" dur="2.4s" repeatCount="indefinite" /></circle>}
                  <path d="M0 -4 C -9 -16 -11 -26 0 -31 C 11 -26 9 -16 0 -4 Z" fill="#16161a" />
                  <circle cx="0" cy="-20" r="4" fill="#00d447" />
                </g>
              );
            })}

            {/* every car on its own route */}
            {items.map((_, i) => {
              const on = i === sel;
              return (
                <g key={`car${i}`} ref={(n) => { carRefs.current[i] = n; }} opacity={on ? 1 : 0.7}>
                  {on && <circle r="20" fill="#00d447" opacity="0.22" />}
                  <g filter="url(#fl-car-shadow)" transform={on ? undefined : 'scale(0.8)'}>
                    <rect x="-14" y="-7.5" width="28" height="15" rx="6" fill={on ? '#16161a' : '#4b4f4a'} />
                    <rect x="-1" y="-5.5" width="8" height="11" rx="2.5" fill="#e8faec" />
                    <rect x="-9" y="-5.5" width="5" height="11" rx="2" fill="#e8faec" opacity="0.5" />
                    <circle cx="13" cy="-4.5" r="1.7" fill="#00d447" />
                    <circle cx="13" cy="4.5" r="1.7" fill="#00d447" />
                  </g>
                </g>
              );
            })}
          </svg>

          {/* name tag that rides with the selected car */}
          <div ref={tagRef} className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[170%]">
            <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-white shadow-pop">
              {current.person.split(' ')[0]} · {live.min} min
            </span>
          </div>

          {/* Trip card */}
          <AnimatePresence mode="wait">
            {showCard && (
              <motion.div
                key={current.id}
                initial={reduce ? false : { opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
                transition={SPRING_SMOOTH}
                className="absolute bottom-2.5 left-2.5 right-2.5 z-20 rounded-2xl border border-line bg-surface/95 p-3.5 shadow-pop backdrop-blur sm:bottom-3 sm:left-auto sm:right-3 sm:w-[280px]"
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
                  <div className="mt-1.5 flex justify-between text-[10px] font-medium text-faint"><span>{current.pickup}</span><span>{current.dropoff}</span></div>
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
                <p className="mt-2.5 text-caption font-semibold text-ink">Latest activity</p>
                <ul className="mt-1.5 space-y-1.5">
                  <li className="flex items-start gap-2 text-caption text-muted"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-bright" /><span className="min-w-0 truncate"><span>Pickup</span> · {current.pickup}</span></li>
                  <li className="flex items-start gap-2 text-caption text-muted"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" /><span className="min-w-0 truncate"><span>Drop-off</span> · {current.dropoff}</span></li>
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* the cursor that "chooses" each car */}
      {!reduce && (
        <div ref={cursorRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-30 hidden transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:block">
          <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"><path d="M4 2 L20 11 L12 13 L9 21 Z" fill="#16161a" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        </div>
      )}
    </div>
  );
}
