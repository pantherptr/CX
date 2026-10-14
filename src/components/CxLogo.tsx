import { useId } from 'react';

/**
 * The CX mark, drawn in code (crisp at any size; the C and the road follow the theme through `currentColor`):
 * a heavy C, and an X whose rising stroke is a ROAD running to the horizon, its centre line in brand green;
 * the falling stroke is green. A small even gap separates the two strokes.
 *
 * Geometry is in the pixel space of the supplied artwork (viewBox 270 225 1200 415).
 */
export function CxLogo({ className = '', title = 'CX' }: { className?: string; title?: string }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${n}-${uid}`;
  // the rising stroke (the road): from the bottom-left foot to the top-right arm, a little narrower at the far end
  const road = 'M766 614H992L1433 308H1238Z';
  return (
    <svg viewBox="270 225 1200 415" role="img" aria-label={title} className={className} fill="none">
      <defs>
        <linearGradient id={id('g')} gradientUnits="userSpaceOnUse" x1="830" y1="250" x2="1450" y2="615">
          <stop offset="0" stopColor="#5dffa6" />
          <stop offset="0.55" stopColor="#14e873" />
          <stop offset="1" stopColor="#00bf49" />
        </linearGradient>
        <mask id={id('gap')} maskUnits="userSpaceOnUse" x="200" y="200" width="1400" height="480">
          <rect x="200" y="200" width="1400" height="480" fill="#fff" />
          <path d={road} fill="#000" stroke="#000" strokeWidth="46" strokeLinejoin="miter" />
        </mask>
      </defs>

      {/* C */}
      <path
        fill="currentColor"
        d="M482 249H790L889 346H491C440 350 410 385 410 426C410 468 440 503 475 503H882L728 613H478C380 613 294 540 294 431C294 320 380 249 482 249Z"
      />
      {/* the falling stroke of the X, in green, with the road's gap carved out of it */}
      <g mask={`url(#${id('gap')})`}>
        <path fill={`url(#${id('g')})`} d="M828 248H1027L1448 614H1215Z" />
      </g>
      {/* the road */}
      <path fill="currentColor" d={road} />
      {/* the road's centre line, in green: dashes that thin out towards the horizon */}
      <g fill={`url(#${id('g')})`}>
        <path d="M891 589H939L998 549H950Z" />
        <path d="M1005 516H1043L1094 482H1056Z" />
        <path d="M1111 448H1139L1180 421H1152Z" />
        <path d="M1206 387H1226L1258 366H1238Z" />
      </g>
    </svg>
  );
}
