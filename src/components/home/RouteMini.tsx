import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../../lib/i18n';

/**
 * A small map in the CX look (the same soft green-white as the app's maps) with a navigation-style route: the real
 * top-down CX car leaves the host and follows the roads while "Arriving in 12 min" counts down to "Your CX is at the
 * door". Drawn in SVG (a few kilobytes, no video); it only runs while on screen and stays finished, still, for people
 * who have switched animations off.
 */
const PATH = 'M 34 108 C 34 90 52 84 84 82 C 118 80 128 66 156 58 C 186 50 206 52 232 40 C 256 30 270 30 290 30';
const DURATION = 3600; // ms to travel
const PAUSE = 3200;    // ms the finished scene stays before it replays
const START_MIN = 12;

export function RouteMini({ className = '' }: { className?: string }) {
  const { t } = useLocale();
  const wrap = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const carRef = useRef<SVGGElement>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [progress, setProgress] = useState(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let visible = false;
    let t0 = 0;
    let waiting = 0;
    const tick = (now: number) => {
      if (!visible) return;
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / DURATION);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else waiting = window.setTimeout(() => { t0 = 0; setProgress(0); if (visible) raf = requestAnimationFrame(tick); }, PAUSE);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      window.clearTimeout(waiting);
      if (visible) { t0 = 0; raf = requestAnimationFrame(tick); }
    }, { threshold: 0.4 });
    if (wrap.current) io.observe(wrap.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.clearTimeout(waiting); };
  }, [reduced]);

  // the car follows the drawn path
  const ease = 1 - Math.pow(1 - progress, 2.2);
  useEffect(() => {
    const path = pathRef.current;
    const car = carRef.current;
    if (!path || !car) return;
    const len = path.getTotalLength();
    const at = len * ease;
    const pt = path.getPointAtLength(at);
    const ahead = path.getPointAtLength(Math.min(len, at + 2));
    const behind = path.getPointAtLength(Math.max(0, at - 2));
    // the car picture faces left, so it is turned half a circle from the direction of travel
    const angle = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI + 180;
    car.setAttribute('transform', `translate(${pt.x} ${pt.y}) rotate(${angle})`);
  }, [ease]);

  const [len, setLen] = useState(420);
  useEffect(() => { if (pathRef.current) setLen(pathRef.current.getTotalLength()); }, []);
  const minutes = Math.max(0, Math.ceil(START_MIN * (1 - ease)));
  const arrived = progress >= 1;

  return (
    <div
      ref={wrap}
      className={`relative overflow-hidden rounded-2xl bg-[#eef2ec] ring-1 ring-black/[0.06] ${className}`}
      role="img"
      aria-label={`${t('Arriving in {n} min', { n: START_MIN })}. ${t('Your CX is at the door')}`}
    >
      <svg viewBox="0 0 320 132" className="block h-auto w-full" aria-hidden>
        {/* the map: soft land, a river and a park, a web of streets with the main roads in white */}
        <rect width="320" height="132" fill="#eef2ec" />
        <path d="M -10 14 C 50 30 90 6 150 20 S 260 4 330 18 L 330 -4 L -10 -4 Z" fill="#cfe0dc" />
        <path d="M 190 132 C 200 104 232 92 262 98 C 292 104 312 92 330 70 L 330 132 Z" fill="#d9ead6" />
        <g transform="rotate(-8 160 66)" fill="none" stroke="#ffffff" strokeLinecap="round">
          {[-10, 22, 50, 80, 112, 146].map((y, i) => <line key={`h${y}`} x1="-40" x2="360" y1={y} y2={y} strokeWidth={i % 3 === 0 ? 3.2 : 1.7} />)}
          {[10, 44, 78, 122, 168, 214, 258, 302, 340].map((x, i) => <line key={`v${x}`} y1="-40" y2="180" x1={x} x2={x + 6} strokeWidth={i % 4 === 1 ? 3.2 : 1.7} />)}
        </g>
        <path d="M -10 120 C 70 100 130 92 190 70 S 280 30 340 16" fill="none" stroke="#ffffff" strokeWidth="4.2" strokeLinecap="round" />
        <path d="M -10 120 C 70 100 130 92 190 70 S 280 30 340 16" fill="none" stroke="#dfe5dc" strokeWidth="0.6" strokeDasharray="2 3" strokeLinecap="round" opacity="0.8" />
        <g fontSize="5.2" fill="#8d978b" letterSpacing="0.9" fontWeight="600">
          <text x="92" y="76" transform="rotate(-8 92 76)">VIA HARBOR</text>
          <text x="196" y="94" transform="rotate(-8 196 94)">PARCO NORD</text>
          <text x="244" y="13">NAVIGLIO</text>
        </g>

        {/* the route: a white casing, a pale rail, then the green line that draws itself */}
        <path d={PATH} fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <path d={PATH} fill="none" stroke="#cfd9cb" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path
          ref={pathRef}
          d={PATH}
          fill="none"
          stroke="#0c9a45"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - ease)}
        />

        {/* start: the host's spot, marked with the CX bat */}
        <g transform="translate(34 108)">
          <ellipse cx="0" cy="3" rx="9" ry="3" fill="#000" opacity="0.14" />
          <circle r="9.5" fill="#16161a" />
          <image href="/brand/cx-bat.webp" x="-6" y="-4.5" width="12" height="9" />
        </g>
        <text x="34" y="126" fontSize="5.6" fontWeight="700" letterSpacing="0.8" fill="#4a5148" textAnchor="middle">{t('Your car').toUpperCase()}</text>

        {/* end: you */}
        <g transform="translate(290 30)">
          <circle r={arrived ? 14 : 10} fill="#0c9a45" opacity={arrived ? 0.16 : 0.1} />
          <circle r="6" fill="#ffffff" stroke="#16161a" strokeWidth="3" />
        </g>
        <text x="290" y="52" fontSize="5.6" fontWeight="700" letterSpacing="0.8" fill="#4a5148" textAnchor="middle">{t('You').toUpperCase()}</text>

        {/* the real top-down CX car, turning with the road */}
        <g ref={carRef} transform="translate(34 108)">
          <ellipse cx="0" cy="1.5" rx="11.5" ry="4.2" fill="#000" opacity="0.18" />
          <image href="/hero-car.webp?v=3" x="-14" y="-6.3" width="28" height="12.6" preserveAspectRatio="xMidYMid meet" />
        </g>
      </svg>

      {/* what the person would see on the phone */}
      <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-[#16161a] shadow-[0_6px_16px_-8px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.05]">
        <span className={`h-1.5 w-1.5 rounded-full ${arrived ? 'bg-[#0c9a45]' : 'animate-pulse bg-[#f59e0b]'}`} />
        {arrived ? t('Arrived') : t('Arriving in {n} min', { n: minutes })}
      </div>
      <div
        className={`pointer-events-none absolute inset-x-2.5 bottom-2.5 flex items-center gap-2 rounded-xl bg-white/96 px-3 py-2 text-[#16161a] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.05] transition-all duration-500 ${arrived ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0c9a45]">
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <span className="text-[12px] font-bold leading-none">{t('Your CX is at the door')}</span>
      </div>
    </div>
  );
}
