import { useId } from 'react';

/**
 * The pull-to-refresh bat: the green chrome bat of the logo, drawn as body and two wings that open as you pull
 * (`spread` 0 → 1) and flap while the page reloads (`flapping`). Wings pivot on the shoulders; the body rides
 * a small beat in between. Vector, so it stays crisp at any size.
 */
const BODY = '535,483 568,376 626,465 685,376 718,483 794,628 625,850 457,628';
const LEFT = '374,383 535,483 457,628 355,703 278,626 148,688';
const RIGHT = '880,383 718,483 794,628 894,703 972,626 1100,688';

export function RefreshBat({ spread = 1, flapping = false, className = '' }: { spread?: number; flapping?: boolean; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const grad = `rb-${uid}`;
  const fold = 38 * (1 - Math.max(0, Math.min(1, spread))); // degrees the wings hang down while still closing
  return (
    <svg viewBox="130 360 988 510" aria-hidden="true" className={`${className} ${flapping ? 'rbat-beat' : ''}`} fill="none">
      <defs>
        <linearGradient id={grad} gradientUnits="userSpaceOnUse" x1="0" y1="376" x2="0" y2="850">
          <stop offset="0" stopColor="#7dfab0" />
          <stop offset="0.3" stopColor="#12d85a" />
          <stop offset="0.55" stopColor="#0fb84a" />
          <stop offset="0.8" stopColor="#2fe673" />
          <stop offset="1" stopColor="#0fc050" />
        </linearGradient>
      </defs>
      <g className={flapping ? 'rbat-wing rbat-wing--l' : ''} style={flapping ? undefined : { transformOrigin: '530px 520px', transformBox: 'view-box', transform: `rotate(${-fold}deg)` }}>
        <polygon points={LEFT} fill={`url(#${grad})`} stroke="#5af59a" strokeWidth="4" strokeLinejoin="round" />
      </g>
      <g className={flapping ? 'rbat-wing rbat-wing--r' : ''} style={flapping ? undefined : { transformOrigin: '722px 520px', transformBox: 'view-box', transform: `rotate(${fold}deg)` }}>
        <polygon points={RIGHT} fill={`url(#${grad})`} stroke="#5af59a" strokeWidth="4" strokeLinejoin="round" />
      </g>
      <polygon points={BODY} fill={`url(#${grad})`} stroke="#5af59a" strokeWidth="4" strokeLinejoin="round" />
      <polyline points="626,465 625,850" stroke="#7dfab0" strokeWidth="6" opacity="0.85" />
    </svg>
  );
}

export default RefreshBat;
