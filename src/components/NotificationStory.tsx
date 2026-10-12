import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from './motionKit';

/* Small "stories" under a fresh update in the inbox, adapted from 21st.dev "Live Notification Feed"
 * (dhxwhy): money rolls into place digit by digit, a car travels the route to the pin, a tick pops.
 * Only drawn for the first few unread rows, once; with reduced motion they show their final state. */

const MONEY_KINDS = new Set(['payout_sent', 'deposit_released', 'booking_refunded']);
const ROUTE_KINDS = new Set(['handover_verified', 'pickup_tomorrow', 'handover_tomorrow', 'return_tomorrow', 'return_expected']);
const TICK_KINDS = new Set(['booking_confirmed', 'booking_new', 'verification_approved', 'listing_live', 'host_respect_trip']);

export function hasStory(kind: string) {
  return MONEY_KINDS.has(kind) || ROUTE_KINDS.has(kind) || TICK_KINDS.has(kind);
}

/** "€1,250.50" / "250 €" / "EUR 40" in a title or body → 1250.5. Null when no amount is written there. */
function amountIn(text: string): number | null {
  const m = text.match(/(?:€|EUR)\s?(\d[\d.,]*)|(\d[\d.,]*)\s?(?:€|EUR)/i);
  const raw = m?.[1] ?? m?.[2];
  if (!raw) return null;
  let s = raw.replace(/[.,]+$/, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const dec = Math.max(lastDot, lastComma);
  if (dec >= 0 && s.length - dec - 1 <= 2) s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1);
  else s = s.replace(/[.,]/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const REEL = Array.from({ length: 20 }, (_, i) => i % 10);

function Money({ amount, animate }: { amount: number; animate: boolean }) {
  const text = '+' + new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(amount);
  const chars = Array.from(text);
  const [rolled, setRolled] = useState(!animate);
  const badge = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!animate) return;
    const id = window.setTimeout(() => setRolled(true), 120);
    const pop = badge.current?.animate(
      [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 380, delay: 1300, easing: 'ease-out', fill: 'backwards' },
    );
    return () => { window.clearTimeout(id); pop?.cancel(); };
  }, [animate]);
  let order = 0;
  return (
    <span className="mt-2 flex items-center gap-2 text-accent-700">
      <span className="sr-only">{text}</span>
      <span aria-hidden className="flex items-baseline font-display text-2xl font-semibold leading-none tabular-nums">
        {chars.map((ch, i) => {
          if (!/\d/.test(ch)) return <span key={i}>{ch}</span>;
          const digit = Number(ch);
          const idx = order++;
          return (
            <span key={i} className="relative inline-block h-[1.15em] overflow-hidden leading-[1.15]">
              <span className="invisible">0</span>
              <span
                className="absolute inset-x-0 top-0 flex flex-col"
                style={{
                  transform: `translateY(-${(rolled ? 10 + digit : 0) * 1.15}em)`,
                  transition: rolled && animate ? `transform ${900 + idx * 110}ms cubic-bezier(0.15, 0.85, 0.25, 1)` : 'none',
                }}
              >
                {REEL.map((n, k) => <span key={k}>{n}</span>)}
              </span>
            </span>
          );
        })}
      </span>
      <span ref={badge} aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
      </span>
    </span>
  );
}

const ROUTE = 'M12 44 C 44 44, 54 14, 98 17 S 158 46, 198 35 S 248 13, 284 16';
function Route({ animate, arrived }: { animate: boolean; arrived: boolean }) {
  const path = useRef<SVGPathElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const car = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const p = path.current, tr = trail.current, c = car.current;
    if (!p || !tr || !c) return;
    const total = p.getTotalLength();
    tr.style.strokeDasharray = `${total}`;
    const to = arrived ? 0.97 : 0.62;
    const place = (t: number) => {
      const len = total * t;
      const pt = p.getPointAtLength(len);
      const ahead = p.getPointAtLength(Math.min(total, len + 1));
      const ang = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
      c.setAttribute('transform', `translate(${pt.x} ${pt.y}) rotate(${ang})`);
      tr.style.strokeDashoffset = `${total - len}`;
    };
    if (!animate) { place(to); return; }
    place(0.05);
    const start = performance.now() + 150;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / 1700));
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      place(0.05 + (to - 0.05) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, arrived]);
  return (
    <span className="mt-2 block overflow-hidden rounded-xl border border-line bg-panel/70 text-accent-700">
      <svg viewBox="0 0 300 60" aria-hidden className="block h-auto w-full">
        <g className="text-line-strong" stroke="currentColor" strokeWidth={6} strokeLinecap="round" fill="none">
          <path d="M-10 30 H 310" /><path d="M70 -10 V 70" /><path d="M176 -10 V 70" /><path d="M232 -10 L 300 54" />
        </g>
        <path ref={path} d={ROUTE} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" opacity={0.45} />
        <path ref={trail} d={ROUTE} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
        <g transform="translate(284 16)"><circle r={4.5} fill="currentColor" stroke="var(--color-surface)" strokeWidth={2} /></g>
        <g ref={car}>
          <rect x={-8} y={-5} width={16} height={10} rx={3.5} fill="currentColor" />
          <rect x={2} y={-3.5} width={3.5} height={7} rx={1.2} fill="white" opacity={0.85} />
        </g>
      </svg>
    </span>
  );
}

function Tick({ animate }: { animate: boolean }) {
  return (
    <span aria-hidden className="mt-2 inline-grid h-6 w-6 place-items-center rounded-full bg-accent text-white" style={animate ? { animation: 'notif-pop 420ms 120ms cubic-bezier(0.2,0.9,0.25,1.12) backwards' } : undefined}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
    </span>
  );
}

export function NotificationStory({ kind, title, body }: { kind: string; title: string; body: string | null }) {
  const reduced = useReducedMotion();
  const animate = !reduced;
  const amount = useMemo(() => (MONEY_KINDS.has(kind) ? amountIn(`${title} ${body ?? ''}`) : null), [kind, title, body]);
  if (MONEY_KINDS.has(kind)) return amount != null ? <Money amount={amount} animate={animate} /> : <Tick animate={animate} />;
  if (ROUTE_KINDS.has(kind)) return <Route animate={animate} arrived={kind === 'handover_verified'} />;
  if (TICK_KINDS.has(kind)) return <Tick animate={animate} />;
  return null;
}
