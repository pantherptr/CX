import { useId, useRef } from 'react';
import { useGaze } from '../lib/useGaze';

/**
 * X's mascot: the CX supercar seen from the front (artwork in /brand/x-car-v2.webp), with the X mark on the
 * bonnet and live eyes. The eyes are redrawn over the picture: the iris follows your finger / cursor,
 * blinks and wanders when nobody is around; `active` wakes it up (quick blinks) while X is thinking.
 * `live` adds the online dot. With "reduce motion" the eyes stay still.
 */
export function XCar({
  size = 40,
  live = false,
  active = false,
  gesture = false,
  speaking = false,
  className = '',
}: {
  size?: number;
  live?: boolean;
  active?: boolean;
  /** plays the "reconfigure" move once, when the component appears (used for each new answer) */
  gesture?: boolean;
  /** the grin lights up like a voice meter while X is talking */
  speaking?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${n}-${uid}`;
  const root = useRef<HTMLSpanElement>(null);
  const pupils = useRef<SVGGElement>(null);
  useGaze(root, pupils, { x: 13, y: 8 });

  // the isometric X of the logo, drawn on the bonnet over the original badge
  const xMark = 'M25.7 0L50 14L75 0.3L100 14L75 28.7L100 43.3V72L75 86.7V58.7L50 43.3L25.7 58.7V86.7L0 72V43.3L25 28.7L0 14Z';
  const eyes: [number, number][] = [[299, 188], [413, 188]];
  return (
    <span
      ref={root}
      className={`x-car relative inline-block shrink-0 ${active ? 'x-car--active' : ''} ${gesture ? 'x-car--morph' : ''} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 -81 720 720" width={size} height={size} className="block overflow-visible">
        <defs>
          <radialGradient id={id('sclera')} cx="0.4" cy="0.35" r="0.8">
            <stop offset="0" stopColor="#e9fff1" />
            <stop offset="0.6" stopColor="#9bf7bb" />
            <stop offset="1" stopColor="#5fe58a" />
          </radialGradient>
          <linearGradient id={id('patch')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2c2f2d" />
            <stop offset="1" stopColor="#0f1211" />
          </linearGradient>
          <linearGradient id={id('x')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7dffa6" />
            <stop offset="1" stopColor="#0bbf4c" />
          </linearGradient>
          <clipPath id={id('top')}><rect x="-40" y="-60" width="800" height="310" /></clipPath>
          <clipPath id={id('mid')}><rect x="-40" y="250" width="800" height="150" /></clipPath>
          <clipPath id={id('bot')}><rect x="-40" y="400" width="800" height="220" /></clipPath>
          <linearGradient id={id('scan')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#12e060" stopOpacity="0" />
            <stop offset="0.5" stopColor="#b6ffd0" stopOpacity="0.95" />
            <stop offset="1" stopColor="#12e060" stopOpacity="0" />
          </linearGradient>
          <filter id={id('soft')} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* three plates of the same car: on a new answer they slide apart and click back together */}
        <g clipPath={`url(#${id('top')})`}>
          <g className="x-car__band x-car__band--top">
            <image href="/brand/x-car-v2.webp" x="0" y="0" width="720" height="558" />
            {/* live eyes: the drawn irises are covered, then redrawn so they can follow you */}
            <g className="x-car__eyes">
              {eyes.map(([cx, cy]) => (
                <circle key={cx} cx={cx} cy={cy} r="36" fill={`url(#${id('sclera')})`} filter={`url(#${id('soft')})`} />
              ))}
              <g ref={pupils} style={{ transition: 'transform .35s cubic-bezier(.2,.8,.2,1)' }}>
                {eyes.map(([cx, cy]) => (
                  <g key={cx}>
                    <circle cx={cx} cy={cy + 2} r="24" fill="#2f8f1c" />
                    <circle cx={cx} cy={cy + 2} r="17" fill="#1f6a12" />
                    <circle cx={cx} cy={cy + 2} r="12" fill="#03140a" />
                    <circle cx={cx - 8} cy={cy - 8} r="6" fill="#fff" />
                  </g>
                ))}
              </g>
            </g>
          </g>
        </g>
        <g clipPath={`url(#${id('mid')})`}>
          <g className="x-car__band x-car__band--mid">
            <image href="/brand/x-car-v2.webp" x="0" y="0" width="720" height="558" />
            {/* the X on the bonnet replaces the old badge */}
            <ellipse cx="365" cy="311" rx="62" ry="40" fill={`url(#${id('patch')})`} filter={`url(#${id('soft')})`} />
            <g transform="translate(335 281) scale(0.6)">
              <path d={xMark} fill={`url(#${id('x')})`} />
              <path d={xMark} fill="none" stroke="#eafff2" strokeWidth="4" strokeOpacity="0.85" strokeLinejoin="round" />
            </g>
          </g>
        </g>
        <g clipPath={`url(#${id('bot')})`}>
          <g className="x-car__band x-car__band--bot">
            <image href="/brand/x-car-v2.webp" x="0" y="0" width="720" height="558" />
            {/* the grin as a voice meter while X talks */}
            {speaking &&
              [[255.5, 436, 12], [307, 448, 17], [412, 444, 15], [462.5, 437, 13]].map(([x, cy, h], k) => (
                <g key={x}>
                  <rect x={x - 8} y={cy - 24} width="16" height="48" fill="#030504" />
                  <rect
                    className="x-car__bar"
                    x={x - 2.5}
                    y={cy - h * 1.2}
                    width="5"
                    height={h * 2.4}
                    rx="2.5"
                    fill="#1ee05f"
                    style={{ animationDelay: `${k * 110}ms` }}
                  />
                </g>
              ))}
          </g>
        </g>
        {/* the scan that runs over the car while it reconfigures */}
        {gesture && <rect className="x-car__scan" x="-20" y="-60" width="760" height="70" fill={`url(#${id('scan')})`} />}
      </svg>
      {live && (
        <span className="absolute -bottom-px -right-px flex h-[24%] min-h-2 w-[24%] min-w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#009646]/55" />
          <span className="relative h-full w-full rounded-full border-2 border-white bg-[#009646]" />
        </span>
      )}
    </span>
  );
}
