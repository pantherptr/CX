import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../../lib/i18n';

/**
 * A small night map with a neon route: the car leaves the host, draws its way through the blocks, and "Arriving in
 * 12 min" counts down to "Your CX is at the door". Drawn in SVG (a few kilobytes, no video), it only runs while it is
 * on screen and stays still, finished, for people who have switched animations off.
 */
const PATH = 'M 28 104 L 28 84 L 112 84 L 112 52 L 196 52 L 196 28 L 288 28';
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
    const pt = path.getPointAtLength(len * ease);
    car.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
  }, [ease]);

  const [len, setLen] = useState(420);
  useEffect(() => { if (pathRef.current) setLen(pathRef.current.getTotalLength()); }, []);
  const minutes = Math.max(0, Math.ceil(START_MIN * (1 - ease)));
  const arrived = progress >= 1;

  return (
    <div
      ref={wrap}
      data-theme="dark"
      className={`relative overflow-hidden rounded-2xl bg-[#0b0e0c] ${className}`}
      role="img"
      aria-label={`${t('Arriving in {n} min', { n: START_MIN })}. ${t('Your CX is at the door')}`}
    >
      <svg viewBox="0 0 320 132" className="block h-auto w-full" aria-hidden>
        <defs>
          <filter id="rm-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* streets */}
        <g stroke="#1b211d" strokeWidth="5">
          {[20, 72, 140].map((y) => <line key={y} x1="0" x2="320" y1={y} y2={y} />)}
          {[60, 150, 240].map((x) => <line key={x} y1="0" y2="132" x1={x} x2={x} />)}
          <line x1="0" y1="132" x2="120" y2="0" strokeWidth="3" />
        </g>
        {/* blocks and a park */}
        <g fill="#131815">
          <rect x="68" y="26" width="76" height="40" rx="5" />
          <rect x="158" y="78" width="76" height="46" rx="5" />
          <rect x="248" y="34" width="60" height="30" rx="5" />
          <rect x="8" y="26" width="46" height="38" rx="5" />
          <rect x="8" y="112" width="46" height="14" rx="5" />
        </g>
        <rect x="158" y="26" width="76" height="40" rx="5" fill="#10261a" />
        <g fill="#16382a"><circle cx="176" cy="40" r="5" /><circle cx="200" cy="52" r="6" /><circle cx="218" cy="38" r="4" /></g>
        <text x="64" y="80" fontSize="6" fill="#3a463e" fontStyle="italic">Harbor St</text>
        <text x="156" y="22" fontSize="6" fill="#3a463e" fontStyle="italic">Mill Ave</text>

        {/* the route: faint rail, then the glowing line drawing itself */}
        <path d={PATH} fill="none" stroke="#1e2a22" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
        <path
          ref={pathRef}
          d={PATH}
          fill="none"
          stroke="#00e84f"
          strokeWidth="5"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#rm-glow)"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - ease)}
        />

        {/* start: the host's car */}
        <rect x="19" y="97" width="18" height="18" rx="5" fill="#ff8a3d" />
        <rect x="42" y="100" width="46" height="13" rx="6.5" fill="#0b0e0c" opacity="0.85" />
        <text x="65" y="109.2" fontSize="7" fontWeight="700" fill="#fff" textAnchor="middle">{t('Your car')}</text>

        {/* end: you */}
        <circle cx="288" cy="28" r="11" fill="none" stroke="#00e84f" strokeOpacity={arrived ? 0.5 : 0.18} />
        <circle cx="288" cy="28" r="5" fill="#00e84f" opacity={arrived ? 1 : 0.55} />
        <rect x="236" y="10" width="30" height="13" rx="6.5" fill="#0b0e0c" opacity="0.85" />
        <text x="251" y="19.2" fontSize="7" fontWeight="700" fill="#fff" textAnchor="middle">{t('You')}</text>

        {/* the car moving along the route */}
        <g ref={carRef} transform="translate(28 104)">
          <circle r="11" fill="#00e84f" opacity="0.22" />
          <circle r="7.5" fill="#b8ff2e" />
          <path d="M-3.6 1.6 h7.2 M-3 -0.4 l1.2 -2 h3.6 l1.2 2 M-2.4 2.6 h0.1 M2.4 2.6 h0.1" stroke="#0b0e0c" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>

      {/* what the person would see on the phone */}
      <div className="pointer-events-none absolute left-2.5 top-2.5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-[#0b0e0c] shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)]">
        {arrived ? t('Arrived') : t('Arriving in {n} min', { n: minutes })}
      </div>
      <div
        className={`pointer-events-none absolute inset-x-2.5 bottom-2.5 flex items-center gap-2 rounded-xl bg-[#c4ff3d] px-3 py-1.5 text-[#0b0e0c] transition-all duration-500 ${arrived ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0b0e0c]">
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-[#c4ff3d]" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <span className="text-[12px] font-extrabold leading-none">{t('Your CX is at the door')}</span>
      </div>
    </div>
  );
}
