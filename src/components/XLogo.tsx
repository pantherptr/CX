import { useEffect, useId, useRef } from 'react';

/**
 * X's logo: a solid, isometric X (two crossing arms on top, two legs under them with an arch between), in
 * black glass with a chrome rim like the CX wordmark. Two green eyes sit in the arch: they look at your
 * finger / cursor, blink, and wander when nobody is around. `live` adds the online dot.
 * Pure SVG; with "reduce motion" the eyes stay still.
 */

// ---- one shared pointer + idle-gaze driver for every logo on the page ----
type Gaze = { x: number; y: number };
const listeners = new Set<(g: Gaze | null) => void>();
let pointer: { x: number; y: number } | null = null;
let idleTimer = 0;
let started = false;

function startDriver() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const onMove = (x: number, y: number) => {
    pointer = { x, y };
    window.clearTimeout(idleTimer);
    listeners.forEach((l) => l(null));
    idleTimer = window.setTimeout(wander, 3500);
  };
  const wander = () => {
    pointer = null;
    const g = { x: Math.random() * 2 - 1, y: Math.random() * 1.4 - 0.7 };
    listeners.forEach((l) => l(g));
    idleTimer = window.setTimeout(wander, 1400 + Math.random() * 2200);
  };
  window.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('pointerdown', (e) => onMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); }, { passive: true });
  idleTimer = window.setTimeout(wander, 1200);
}

export function XLogo({ size = 40, live = false, className = '' }: { size?: number; live?: boolean; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${n}-${uid}`;
  const root = useRef<HTMLSpanElement>(null);
  const pupils = useRef<SVGGElement>(null);

  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    startDriver();
    const move = (g: Gaze) => {
      const el = pupils.current;
      if (el) el.style.transform = `translate(${(g.x * 2.4).toFixed(2)}px, ${(g.y * 1.9).toFixed(2)}px)`;
    };
    const onGaze = (idle: Gaze | null) => {
      if (idle) { move(idle); return; }
      const r = root.current?.getBoundingClientRect();
      if (!r || !pointer) return;
      const dx = pointer.x - (r.left + r.width / 2);
      const dy = pointer.y - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 120);
      move({ x: (dx / d) * k, y: (dy / d) * k });
    };
    listeners.add(onGaze);
    // an eye that already knows where the pointer is
    onGaze(null);
    const onMoveHere = () => onGaze(null);
    window.addEventListener('pointermove', onMoveHere, { passive: true });
    return () => {
      listeners.delete(onGaze);
      window.removeEventListener('pointermove', onMoveHere);
    };
  }, []);

  // the silhouette, clockwise: top peaks and the notch between them, arm tips, inner notches, legs and the arch
  const body =
    'M25.7 0L50 14L75 0.3L100 14L75 28.7L100 43.3V72L75 86.7V58.7L50 43.3L25.7 58.7V86.7L0 72V43.3L25 28.7L0 14Z';
  const inset = 'translate(50 43) scale(0.9) translate(-50 -43)';
  return (
    <span ref={root} className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 -6.6 100 100" width={size} height={size} className="block overflow-visible">
        <defs>
          <linearGradient id={id('rim')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.3" stopColor="#c9cfcc" />
            <stop offset="0.58" stopColor="#7d8581" />
            <stop offset="0.82" stopColor="#d9dedb" />
            <stop offset="1" stopColor="#59605c" />
          </linearGradient>
          <linearGradient id={id('body')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2c312e" />
            <stop offset="0.5" stopColor="#0e100f" />
            <stop offset="1" stopColor="#020302" />
          </linearGradient>
          <radialGradient id={id('glow')} cx="0.5" cy="1.05" r="0.7">
            <stop offset="0" stopColor="#12ff6a" stopOpacity="0.8" />
            <stop offset="0.6" stopColor="#00c94a" stopOpacity="0.22" />
            <stop offset="1" stopColor="#00c94a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id('gloss')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={id('eye')} cx="0.4" cy="0.35" r="0.8">
            <stop offset="0" stopColor="#f4fff8" />
            <stop offset="0.6" stopColor="#8bffb4" />
            <stop offset="1" stopColor="#12e060" />
          </radialGradient>
          <clipPath id={id('clip')}>
            <path d={body} transform={inset} />
          </clipPath>
        </defs>

        <path d={body} fill="#000" opacity="0.28" transform="translate(0 3)" style={{ filter: 'blur(2.2px)' }} />
        <path d={body} fill={`url(#${id('rim')})`} stroke="#0b0d0c" strokeWidth="1" strokeLinejoin="round" />
        <path d={body} transform={inset} fill={`url(#${id('body')})`} />
        <g clipPath={`url(#${id('clip')})`}>
          <rect x="0" y="40" width="100" height="60" fill={`url(#${id('glow')})`} />
          <rect x="0" y="-6" width="100" height="40" fill={`url(#${id('gloss')})`} opacity="0.5" />
        </g>

        {/* the eyes: socket, bright eye, a pupil that follows you, and a small highlight */}
        <g className="x-logo__eyes">
          {[38, 62].map((cx) => (
            <g key={cx}>
              <ellipse cx={cx} cy="69" rx="8.2" ry="7.4" fill="#020a05" />
              <ellipse cx={cx} cy="69" rx="6.9" ry="6.1" fill={`url(#${id('eye')})`} />
            </g>
          ))}
          <g ref={pupils} style={{ transition: 'transform .35s cubic-bezier(.2,.8,.2,1)' }}>
            {[38, 62].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy="69" r="3.3" fill="#03140a" />
                <circle cx={cx - 1} cy="67.8" r="1" fill="#fff" />
              </g>
            ))}
          </g>
        </g>
      </svg>
      {live && (
        <span className="absolute -bottom-px -right-px flex h-[26%] min-h-2 w-[26%] min-w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#009646]/55" />
          <span className="relative h-full w-full rounded-full border-2 border-white bg-[#009646]" />
        </span>
      )}
    </span>
  );
}
