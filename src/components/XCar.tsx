import { useId, useRef } from 'react';
import { useGaze } from '../lib/useGaze';

/**
 * X's mascot: a low, wide supercar seen from the front, drawn for CX (an original character). Big eyes with
 * eyelids sit in the windscreen and follow your finger / cursor, blink, and wander when nobody is around;
 * a grin runs along the bumper, the X mark sits on the bonnet and the headlights are green. `active` wakes
 * it up (quick blinks, pulsing headlights) while X is thinking. `live` adds the online dot.
 * Pure SVG; with "reduce motion" the eyes stay still.
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
  useGaze(root, pupils, { x: 2.8, y: 2.0 });

  // the isometric X of the logo, drawn small on the bonnet
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
            <stop offset="0" stopColor="#3a413d" />
            <stop offset="0.4" stopColor="#111413" />
            <stop offset="1" stopColor="#030403" />
          </linearGradient>
          <linearGradient id={id('glass')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0d2418" />
            <stop offset="0.6" stopColor="#051108" />
            <stop offset="1" stopColor="#020604" />
          </linearGradient>
          <radialGradient id={id('eye')} cx="0.4" cy="0.35" r="0.8">
            <stop offset="0" stopColor="#f6fff9" />
            <stop offset="0.6" stopColor="#8bffb4" />
            <stop offset="1" stopColor="#12e060" />
          </radialGradient>
          <linearGradient id={id('lamp')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#eafff2" />
            <stop offset="0.5" stopColor="#2dff7a" />
            <stop offset="1" stopColor="#00a83f" />
          </linearGradient>
          <linearGradient id={id('gloss')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* shadow on the road */}
        <ellipse cx="50" cy="91" rx="44" ry="5" fill="#000" opacity="0.3" style={{ filter: 'blur(2.4px)' }} />
        {/* wide tyres with a rim of light */}
        <rect x="1.5" y="58" width="17" height="31" rx="6" fill="#060706" stroke="#2c312e" strokeWidth="1" />
        <rect x="81.5" y="58" width="17" height="31" rx="6" fill="#060706" stroke="#2c312e" strokeWidth="1" />
        <rect x="5" y="63" width="4.5" height="21" rx="2.2" fill="#1d2220" />
        <rect x="90.5" y="63" width="4.5" height="21" rx="2.2" fill="#1d2220" />
        {/* side mirrors */}
        <path d="M13 45Q8 44 8.5 40.5Q10 38.5 15 40L21 43Z" fill={`url(#${id('rim')})`} stroke="#0b0d0c" strokeWidth="0.8" />
        <path d="M87 45Q92 44 91.5 40.5Q90 38.5 85 40L79 43Z" fill={`url(#${id('rim')})`} stroke="#0b0d0c" strokeWidth="0.8" />
        {/* the low cabin: roof, frame and windscreen */}
        <path d="M23 49L31.5 23Q33 17.5 39.5 17.5H60.5Q67 17.5 68.5 23L77 49Z" fill={`url(#${id('rim')})`} stroke="#0b0d0c" strokeWidth="1" strokeLinejoin="round" />
        <path d="M27.8 47L35.2 24.6Q36.4 21 40.4 21H59.6Q63.6 21 64.8 24.6L72.2 47Z" fill={`url(#${id('glass')})`} />
        <path d="M27.8 47L35.2 24.6Q36.4 21 40.4 21H59.6Q63.6 21 64.8 24.6L72.2 47Z" fill={`url(#${id('gloss')})`} opacity="0.22" />
        {/* muscular front wings over the tyres */}
        <path d="M2.5 66Q1.5 52 12 48.5L24 46.5V66Z" fill={`url(#${id('rim')})`} stroke="#0b0d0c" strokeWidth="1" strokeLinejoin="round" />
        <path d="M97.5 66Q98.5 52 88 48.5L76 46.5V66Z" fill={`url(#${id('rim')})`} stroke="#0b0d0c" strokeWidth="1" strokeLinejoin="round" />
        {/* the nose: bonnet and bumper, low and wide */}
        <path d="M9 67Q7 54 16 50L27 46.5H73L84 50Q93 54 91 67L90 82Q89 87 83 87H17Q11 87 10 82Z" fill={`url(#${id('rim')})`} stroke="#0b0d0c" strokeWidth="1" strokeLinejoin="round" />
        <path d="M12.8 67Q11 56.5 18.5 53L28 49.8H72L81.5 53Q89 56.5 87.2 67L86.4 81Q86 83.6 82.2 83.6H17.8Q14 83.6 13.6 81Z" fill={`url(#${id('body')})`} />
        <path d="M18 53.5L28 49.8H72L82 53.5Q75 56.6 50 56.6Q25 56.6 18 53.5Z" fill={`url(#${id('gloss')})`} opacity="0.6" />
        {/* a green stripe down the bonnet and the X mark */}
        <path d="M47 50H53L52 58H48Z" fill="#0c7a38" opacity="0.7" />
        <g transform="translate(44 51) scale(0.12)">
          <path d={xMark} fill="#12e060" />
          <path d={xMark} fill="none" stroke="#eafff2" strokeWidth="5" strokeOpacity="0.85" strokeLinejoin="round" />
        </g>
        {/* sharp headlights on the wings */}
        <g className="x-car__lamps">
          <path d="M14 63Q14 58.5 21 58L34 60Q37 61.5 35 64.5L26 67.5Q17 67 14 63Z" fill={`url(#${id('lamp')})`} stroke="#0b0d0c" strokeWidth="0.8" />
          <path d="M86 63Q86 58.5 79 58L66 60Q63 61.5 65 64.5L74 67.5Q83 67 86 63Z" fill={`url(#${id('lamp')})`} stroke="#0b0d0c" strokeWidth="0.8" />
        </g>
        {/* air intakes and the grin */}
        <path d="M17 73L26 71.5L28 77L19 78.5Z" fill="#020302" />
        <path d="M83 73L74 71.5L72 77L81 78.5Z" fill="#020302" />
        <path d="M33 72Q50 83 67 72L65.5 76.8Q50 85.6 34.5 76.8Z" fill="#020302" stroke="#3a403d" strokeWidth="0.7" />
        <path d="M40 76.4V80M46 77.6V81.2M54 77.6V81.2M60 76.4V80" stroke="#12e060" strokeOpacity="0.7" strokeWidth="1.1" strokeLinecap="round" />
        {/* the eyes, in the windscreen: socket, bright eye, iris that follows you, lid on top */}
        <g className="x-car__eyes">
          {[42.4, 57.6].map((cx) => (
            <g key={cx}>
              <ellipse cx={cx} cy="33.5" rx="7.6" ry="8.4" fill="#020a05" />
              <ellipse cx={cx} cy="33.5" rx="6.6" ry="7.4" fill={`url(#${id('eye')})`} />
            </g>
          ))}
          <g ref={pupils} style={{ transition: 'transform .35s cubic-bezier(.2,.8,.2,1)' }}>
            {[42.4, 57.6].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy="33.5" r="3.3" fill="#03140a" />
                <circle cx={cx - 1.2} cy="32" r="1.15" fill="#fff" />
              </g>
            ))}
          </g>
          {/* eyelids give it attitude */}
          <path d="M34.8 33.3Q42.4 22.8 50 31.4L50 25.8Q42.4 20.6 34.8 27.6Z" fill="#0b2216" />
          <path d="M65.2 33.3Q57.6 22.8 50 31.4L50 25.8Q57.6 20.6 65.2 27.6Z" fill="#0b2216" />
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
