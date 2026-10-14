import { useId, useRef } from 'react';
import { useGaze } from '../lib/useGaze';

/**
 * X's mascot: a little sports car seen from the front, drawn for CX (an original character). Its eyes are
 * in the windshield and follow your finger / cursor, blink, and wander when nobody is around; the X mark
 * sits on the bonnet; the headlights are green. `active` wakes it up (eyes wide, headlights pulsing) while X
 * is thinking. `live` adds the online dot. Pure SVG; with "reduce motion" the eyes stay still.
 */
export function XCar({
  size = 40,
  live = false,
  active = false,
  className = '',
}: {
  size?: number;
  live?: boolean;
  active?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${n}-${uid}`;
  const root = useRef<HTMLSpanElement>(null);
  const pupils = useRef<SVGGElement>(null);
  useGaze(root, pupils, { x: 2.6, y: 2.0 });

  // the X mark (the isometric X of the logo), drawn small on the bonnet
  const xMark = 'M25.7 0L50 14L75 0.3L100 14L75 28.7L100 43.3V72L75 86.7V58.7L50 43.3L25.7 58.7V86.7L0 72V43.3L25 28.7L0 14Z';
  return (
    <span
      ref={root}
      className={`x-car relative inline-block shrink-0 ${active ? 'x-car--active' : ''} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="block overflow-visible">
        <defs>
          <linearGradient id={id('rim')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.3" stopColor="#c9cfcc" />
            <stop offset="0.6" stopColor="#7d8581" />
            <stop offset="0.85" stopColor="#d9dedb" />
            <stop offset="1" stopColor="#59605c" />
          </linearGradient>
          <linearGradient id={id('body')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#343a37" />
            <stop offset="0.45" stopColor="#101312" />
            <stop offset="1" stopColor="#030403" />
          </linearGradient>
          <linearGradient id={id('glass')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0c1f15" />
            <stop offset="0.55" stopColor="#051008" />
            <stop offset="1" stopColor="#020604" />
          </linearGradient>
          <radialGradient id={id('eye')} cx="0.4" cy="0.35" r="0.8">
            <stop offset="0" stopColor="#f4fff8" />
            <stop offset="0.6" stopColor="#8bffb4" />
            <stop offset="1" stopColor="#12e060" />
          </radialGradient>
          <radialGradient id={id('lamp')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#eafff2" />
            <stop offset="0.45" stopColor="#2dff7a" />
            <stop offset="1" stopColor="#00b844" />
          </radialGradient>
          <linearGradient id={id('gloss')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* shadow on the road */}
        <ellipse cx="50" cy="90" rx="40" ry="5" fill="#000" opacity="0.28" style={{ filter: 'blur(2.4px)' }} />
        {/* tyres */}
        <rect x="4" y="58" width="15" height="30" rx="5" fill="#070807" stroke="#2c312e" strokeWidth="1" />
        <rect x="81" y="58" width="15" height="30" rx="5" fill="#070807" stroke="#2c312e" strokeWidth="1" />
        <rect x="7" y="62" width="4" height="22" rx="2" fill="#1b1f1d" />
        <rect x="89" y="62" width="4" height="22" rx="2" fill="#1b1f1d" />
        {/* roof, windscreen frame and the cabin */}
        <path d="M24 46L32 14Q33.5 9 39 9H61Q66.5 9 68 14L76 46Z" fill={`url(#${id('rim')})`} stroke="#0b0d0c" strokeWidth="1" strokeLinejoin="round" />
        <path d="M28.6 44L35.6 15.6Q36.6 12.6 40 12.6H60Q63.4 12.6 64.4 15.6L71.4 44Z" fill={`url(#${id('glass')})`} />
        <path d="M28.6 44L35.6 15.6Q36.6 12.6 40 12.6H60Q63.4 12.6 64.4 15.6L71.4 44Z" fill={`url(#${id('gloss')})`} opacity="0.25" />
        {/* the lower body: bonnet, bumper, arches */}
        <path
          d="M10 62Q8 50 16 46L26 43H74L84 46Q92 50 90 62L89 78Q88 84 82 84H18Q12 84 11 78Z"
          fill={`url(#${id('rim')})`}
          stroke="#0b0d0c"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path d="M13.6 62Q12 52.5 18.4 49.4L27 46.6H73L81.6 49.4Q88 52.5 86.4 62L85.5 77Q85 80.6 81.5 80.6H18.5Q15 80.6 14.5 77Z" fill={`url(#${id('body')})`} />
        <path d="M20 49L27 46.6H73L80 49Q74 52 50 52Q26 52 20 49Z" fill={`url(#${id('gloss')})`} opacity="0.55" />
        {/* the X on the bonnet */}
        <g transform="translate(43.2 51.2) scale(0.136)">
          <path d={xMark} fill="#12e060" />
          <path d={xMark} fill="none" stroke="#eafff2" strokeWidth="5" strokeOpacity="0.8" strokeLinejoin="round" />
        </g>
        {/* headlights and grille */}
        <g className="x-car__lamps">
          <path d="M16 63Q16 57.5 22 57L33 58.5Q36 60 35 64Q33 68 26 68L18 67.5Q16 66.5 16 63Z" fill={`url(#${id('lamp')})`} stroke="#0b0d0c" strokeWidth="0.8" />
          <path d="M84 63Q84 57.5 78 57L67 58.5Q64 60 65 64Q67 68 74 68L82 67.5Q84 66.5 84 63Z" fill={`url(#${id('lamp')})`} stroke="#0b0d0c" strokeWidth="0.8" />
        </g>
        <rect x="38" y="68.5" width="24" height="8" rx="3" fill="#020302" stroke="#3a403d" strokeWidth="0.8" />
        <path d="M42 71H58M42 74H58" stroke="#12e060" strokeOpacity="0.55" strokeWidth="0.9" />
        {/* the eyes, in the windscreen */}
        <g className="x-car__eyes">
          {[42.5, 57.5].map((cx) => (
            <g key={cx}>
              <ellipse cx={cx} cy="29" rx="7.2" ry="8" fill="#020a05" />
              <ellipse cx={cx} cy="29" rx="6.2" ry="7" fill={`url(#${id('eye')})`} />
            </g>
          ))}
          <g ref={pupils} style={{ transition: 'transform .35s cubic-bezier(.2,.8,.2,1)' }}>
            {[42.5, 57.5].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy="29" r="3.1" fill="#03140a" />
                <circle cx={cx - 1.1} cy="27.6" r="1.1" fill="#fff" />
              </g>
            ))}
          </g>
        </g>
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
