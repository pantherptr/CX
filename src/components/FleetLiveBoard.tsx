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
const BLOCKS: [number, number, number, number][] = [
  [20, 170, 110, 110], [170, 20, 140, 110], [350, 20, 110, 110], [500, 20, 80, 90],
  [350, 170, 110, 110], [500, 170, 80, 110], [20, 320, 110, 80], [170, 320, 140, 80], [350, 320, 110, 80],
  [20, 20, 110, 110], [170, 170, 140, 110],
];
const TRAVEL_MS = 9000;
const HOLD_MS = 1800;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function FleetLiveBoard({ items, stats, preview = true, title = 'Live tracking' }: { items: LiveItem[]; stats?: LiveStat[]; preview?: boolean; title?: string }) {
  const reduce = useReducedMotion();
  const [sel, setSel] = useState(0);
  const [visible, setVisible] = useState(false);
  const [remaining, setRemaining] = useState({ min: items[0]?.etaMin ?? 0, km: items[0]?.km ?? 0 });
  const [showCard, setShowCard] = useState(false);
  const [paused, setPaused] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const routeRefs = useRef<(SVGPathElement | null)[]>([]);
  const progressRef = useRef<SVGPathElement>(null);
  const carRef = useRef<SVGGElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

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

  // The car drives the selected route; when it arrives, the next car is picked.
  useEffect(() => {
    const path = routeRefs.current[sel % ROUTES.length];
    const car = carRef.current;
    const prog = progressRef.current;
    if (!path || !car || !prog || !current) return;
    const len = path.getTotalLength();
    const place = (t: number) => {
      const p = path.getPointAtLength(len * t);
      const q = path.getPointAtLength(Math.min(len, len * t + 1));
      car.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${(Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI})`);
      prog.setAttribute('d', path.getAttribute('d') ?? '');
      prog.style.strokeDasharray = `${len * t} ${len}`;
    };
    if (reduce || !visible) { place(reduce ? 0.55 : 0); return; }

    let raf = 0;
    const startAt = performance.now();
    let lastMin = -1;
    const loop = (now: number) => {
      const elapsed = now - startAt;
      const t = easeInOut(Math.min(1, elapsed / TRAVEL_MS));
      place(t);
      const min = Math.max(1, Math.round(current.etaMin * (1 - t)));
      if (min !== lastMin) { lastMin = min; setRemaining({ min, km: Math.max(0.1, +(current.km * (1 - t)).toFixed(1)) }); }
      if (elapsed > TRAVEL_MS + HOLD_MS) {
        if (!pausedRef.current && items.length > 1) { setSel((s) => (s + 1) % items.length); return; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sel, visible, reduce, current, items.length]);

  if (!current) return null;

  const pick = (i: number) => {
    setPaused(true);
    window.setTimeout(() => setPaused(false), 25000);
    setSel(i);
  };
  const route = ROUTES[sel % ROUTES.length];
  const end = (() => {
    const m = route.trim().split(/\s+/);
    return { x: Number(m[m.length - 2]), y: Number(m[m.length - 1]) };
  })();

  return (
    <div ref={root} className="relative rounded-[28px] border border-line bg-surface p-3 shadow-soft sm:p-4">
      {stats && (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-panel/50 p-3.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent-050 text-accent"><Icon name={s.icon} size={15} /></span>
              <p className="mt-2.5 font-display text-[1.375rem] font-semibold leading-none text-ink">{s.value}</p>
              <p className="mt-1.5 text-caption text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className={`grid gap-3 lg:grid-cols-[minmax(0,330px)_1fr] ${stats ? 'mt-3' : ''}`}>
        {/* Cars on the road */}
        <div className="rounded-2xl border border-line p-3">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <h3 className="font-display text-body font-semibold text-ink">{title}</h3>
            {preview && <span className="rounded-full bg-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Live preview</span>}
          </div>
          <div className="space-y-2">
            {items.map((it, i) => {
              const on = i === sel;
              return (
                <button
                  key={it.id}
                  ref={(n) => { cardRefs.current[i] = n; }}
                  onClick={() => pick(i)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-[border-color,box-shadow,background-color] duration-300 ${
                    on ? 'border-accent-bright bg-accent-050/50 shadow-[0_0_0_3px_rgba(0,212,71,0.14)]' : 'border-line hover:bg-panel/50'
                  }`}
                >
                  <Img src={it.image} alt="" className="h-14 w-[84px] shrink-0 rounded-xl bg-panel object-cover" fallback={<span className="grid h-14 w-[84px] shrink-0 place-items-center rounded-xl bg-panel text-faint"><Icon name="car" size={20} /></span>} />
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
                </button>
              );
            })}
          </div>
        </div>

        {/* Map */}
        <div className="relative h-[340px] overflow-hidden rounded-2xl border border-line bg-[#eef1ec] sm:h-[420px]">
          <svg viewBox="0 0 600 420" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
            {BLOCKS.map(([x, y, w, h], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} rx="14" fill={i % 4 === 0 ? '#e1ebdc' : '#e7ebe4'} />
            ))}
            {[...STREETS, ...ROUTES].map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#ffffff" strokeWidth="13" strokeLinecap="round" />
            ))}
            {[...STREETS, ...ROUTES].map((d, i) => (
              <path key={`e${i}`} d={d} fill="none" stroke="#dfe3dc" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
            ))}
            {ROUTES.map((d, i) => (
              <path key={`r${i}`} ref={(n) => { routeRefs.current[i] = n; }} d={d} fill="none" stroke="none" />
            ))}
            {/* selected route: faint full line + bright travelled part */}
            <path d={route} fill="none" stroke="#00d447" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" opacity="0.55" />
            <path ref={progressRef} d={route} fill="none" stroke="#00d447" strokeWidth="4" strokeLinecap="round" />
            {/* destination pin */}
            <g transform={`translate(${end.x} ${end.y})`}>
              <circle r="16" fill="#00d447" opacity="0.18" />
              <path d="M0 -4 C -9 -16 -11 -26 0 -31 C 11 -26 9 -16 0 -4 Z" fill="#16161a" />
              <circle cx="0" cy="-20" r="4" fill="#00d447" />
            </g>
            {/* the car */}
            <g ref={carRef}>
              <circle r="18" fill="#00d447" opacity="0.22" />
              <rect x="-14" y="-7.5" width="28" height="15" rx="6" fill="#16161a" />
              <rect x="-1" y="-5.5" width="8" height="11" rx="2.5" fill="#e8faec" />
              <rect x="-9" y="-5.5" width="5" height="11" rx="2" fill="#e8faec" opacity="0.5" />
              <circle cx="13" cy="-4.5" r="1.7" fill="#00d447" />
              <circle cx="13" cy="4.5" r="1.7" fill="#00d447" />
            </g>
          </svg>

          {/* Trip card */}
          <AnimatePresence mode="wait">
            {showCard && (
              <motion.div
                key={current.id}
                initial={reduce ? false : { opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
                transition={SPRING_SMOOTH}
                className="absolute bottom-3 left-3 right-3 rounded-2xl border border-line bg-surface/95 p-3.5 shadow-pop backdrop-blur sm:left-auto sm:w-[270px]"
              >
                <div className="flex items-center gap-2.5">
                  {current.avatar ? <img src={current.avatar} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="h-9 w-9 rounded-full bg-panel" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-detail font-semibold text-ink">{current.person}</p>
                    <p className="text-caption text-muted">Customer</p>
                  </div>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="message" size={14} /></span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-y border-line py-2.5">
                  <div>
                    <p className="font-display text-body font-semibold text-ink">{remaining.min} min</p>
                    <p className="text-caption text-muted">Arriving in</p>
                  </div>
                  <div>
                    <p className="font-display text-body font-semibold text-ink">{remaining.km.toFixed(1)} km</p>
                    <p className="text-caption text-muted">Distance left</p>
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
        <div ref={cursorRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-20 hidden transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:block">
          <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"><path d="M4 2 L20 11 L12 13 L9 21 Z" fill="#16161a" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        </div>
      )}
    </div>
  );
}
