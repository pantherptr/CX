import { useId, useRef } from 'react';
import { useGaze } from '../lib/useGaze';

/**
 * X's logo: a solid, isometric X (two crossing arms on top, two legs under them with an arch between), in
 * black glass with a chrome rim like the CX wordmark. Two slim, glowing green eyes sit directly on the X, side
 * by side at its heart: they look at your finger / cursor, blink, and wander when nobody is around. `active`
 * makes them glow while X is thinking. `live` adds the online dot.
 * Pure SVG; with "reduce motion" the eyes stay still.
 */

export function XLogo({ size = 40, live = false, active = false, className = '' }: { size?: number; live?: boolean; active?: boolean; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${n}-${uid}`;
  const root = useRef<HTMLSpanElement>(null);
  const pupils = useRef<SVGGElement>(null);

  useGaze(root, pupils, { x: 1.9, y: 0.9 });

  // the silhouette, clockwise: top peaks and the notch between them, arm tips, inner notches, legs and the arch
  const body =
    'M25.7 0L50 14L75 0.3L100 14L75 28.7L100 43.3V72L75 86.7V58.7L50 43.3L25.7 58.7V86.7L0 72V43.3L25 28.7L0 14Z';
  const inset = 'translate(50 43) scale(0.9) translate(-50 -43)';
  return (
    <span ref={root} className={`relative inline-block shrink-0 ${active ? 'x-logo--active' : ''} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
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

        {/* the eyes, straight on the X: a soft glow, a slim almond of light, an iris that follows you */}
        <g className="x-logo__eyes">
          {[40.5, 59.5].map((cx) => {
            const almond = `M${cx - 6} 31.5Q${cx} 26.6 ${cx + 6} 31.5Q${cx} 36.4 ${cx - 6} 31.5Z`;
            return (
              <g key={cx}>
                <ellipse cx={cx} cy="31.5" rx="8.5" ry="5.8" fill="#12ff6a" opacity="0.28" style={{ filter: 'blur(2.6px)' }} className="x-logo__halo" />
                <path d={almond} fill="#031008" />
                <path d={almond} fill={`url(#${id('eye')})`} transform={`translate(${cx} 31.5) scale(0.88 0.82) translate(${-cx} -31.5)`} />
              </g>
            );
          })}
          <g ref={pupils} style={{ transition: 'transform .35s cubic-bezier(.2,.8,.2,1)' }}>
            {[40.5, 59.5].map((cx) => (
              <g key={cx}>
                <ellipse cx={cx} cy="31.5" rx="2.3" ry="2.6" fill="#02130a" />
                <circle cx={cx - 0.8} cy="30.6" r="0.75" fill="#fff" />
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
