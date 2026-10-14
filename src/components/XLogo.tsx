import { useId, useRef } from 'react';
import { useGaze } from '../lib/useGaze';

/**
 * X's logo: a solid, isometric X (two crossing arms on top, two legs under them with an arch between), in
 * black glass with a chrome rim like the CX wordmark. Two green eyes sit side by side in a small visor at the
 * middle of the X: they look at your finger / cursor, blink, and wander when nobody is around. `live` adds
 * the online dot.
 * Pure SVG; with "reduce motion" the eyes stay still.
 */

export function XLogo({ size = 40, live = false, className = '' }: { size?: number; live?: boolean; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${n}-${uid}`;
  const root = useRef<HTMLSpanElement>(null);
  const pupils = useRef<SVGGElement>(null);

  useGaze(root, pupils);

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

        {/* the face: a small visor at the heart of the X, an eye on each side, a pupil that follows you */}
        <g className="x-logo__eyes">
          <rect x="29.5" y="22" width="41" height="19" rx="5" fill="#030806" stroke={`url(#${id('rim')})`} strokeWidth="1.1" />
          <rect x="31" y="23.5" width="38" height="16" rx="4" fill="none" stroke="#12e060" strokeOpacity="0.45" strokeWidth="0.5" />
          {[40.5, 59.5].map((cx) => (
            <g key={cx}>
              <ellipse cx={cx} cy="31.5" rx="5.6" ry="5.4" fill="#020a05" />
              <ellipse cx={cx} cy="31.5" rx="4.8" ry="4.6" fill={`url(#${id('eye')})`} />
            </g>
          ))}
          <g ref={pupils} style={{ transition: 'transform .35s cubic-bezier(.2,.8,.2,1)' }}>
            {[40.5, 59.5].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy="31.5" r="2.5" fill="#03140a" />
                <circle cx={cx - 0.9} cy="30.4" r="0.85" fill="#fff" />
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
