import { SceneFrame } from './SceneFrame';
import { useLocale } from '../../../lib/i18n';

export interface FindSceneCar {
  name: string;
  image: string;
  price: string;
  city: string;
}

/**
 * "Find your car", as a small ad: a glossy phone over a green-lit stage, prices popping onto the map, a finger that taps
 * one, and the card that rises with a real photo of that car, its name and its price. Floating badges ("Instant book",
 * "Verified host") drift around the phone. One 9 s loop, only while on screen.
 */
export function FindScene({ car, prices = ['€31', '€189', '€64'] }: { car?: FindSceneCar; prices?: string[] }) {
  const { t } = useLocale();
  const shown: FindSceneCar = car ?? { name: 'CX', image: '/hero-car.webp', price: '€95', city: 'Milan' };
  const title = shown.name.length > 22 ? `${shown.name.slice(0, 21)}…` : shown.name;
  const pins = [
    { x: 150, y: 124, p: prices[0] ?? '€31', k: 'a' },
    { x: 246, y: 152, p: prices[1] ?? '€189', k: 'b' },
    { x: 238, y: 214, p: prices[2] ?? '€64', k: 'd' },
  ];
  return (
    <SceneFrame>
      <svg viewBox="0 0 400 440" preserveAspectRatio="xMidYMid meet" className="block h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="fs-bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="440">
            <stop offset="0" stopColor="#06120d" /><stop offset="1" stopColor="#0e3322" />
          </linearGradient>
          <radialGradient id="fs-glow" cx="50%" cy="44%" r="52%">
            <stop offset="0" stopColor="#00e060" stopOpacity="0.5" /><stop offset="1" stopColor="#00e060" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="fs-gloss" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.34" /><stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fs-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#2b3a33" /><stop offset="0.5" stopColor="#101713" /><stop offset="1" stopColor="#2b3a33" />
          </linearGradient>
          <clipPath id="fs-screen"><rect x="114" y="46" width="172" height="348" rx="22" /></clipPath>
          <clipPath id="fs-photo"><rect x="126" y="250" width="148" height="74" rx="12" /></clipPath>
          <filter id="fs-shadow" x="-30%" y="-10%" width="160%" height="130%"><feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#000" floodOpacity="0.55" /></filter>
        </defs>
        <rect x="-1200" y="-800" width="2800" height="2000" fill="url(#fs-bg)" />
        <circle cx="200" cy="200" r="230" fill="url(#fs-glow)" />
        {/* city lights far behind */}
        <g stroke="#14392a" strokeWidth="1.2">
          {[-300, -240, -180, -120, -60, 0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720].map((y) => <line key={`h${y}`} x1="-1200" x2="1600" y1={y} y2={y} />)}
          {[-690, -630, -570, -510, -450, -390, -330, -270, -210, -150, -90, -30, 30, 90, 150, 210, 270, 330, 390, 450, 510, 570, 630, 690, 750, 810, 870, 930, 990].map((x) => <line key={`v${x}`} y1="-800" y2="1200" x1={x} x2={x} />)}
        </g>
        {[[44, 70], [356, 96], [60, 372], [346, 340], [84, 216], [330, 214]].map(([x, y], i) => (
          <circle key={i} className="fs-spark" cx={x} cy={y} r="2.2" fill="#8dffb4" style={{ animationDelay: `${i * 0.6}s` }} />
        ))}

        {/* floating badges */}
        <g className="fs-badge fs-badge-a">
          <rect x="6" y="150" width="92" height="26" rx="13" fill="#0b1a14" stroke="#18e56b" strokeOpacity="0.7" />
          <path d="M22 156 l-5 8 h5 l-2 7 l7 -9 h-5 z" fill="#18e56b" />
          <text x="33" y="167.5" fontSize="9.6" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">Instant book</text>
        </g>
        <g className="fs-badge fs-badge-b">
          <rect x="298" y="236" width="98" height="26" rx="13" fill="#0b1a14" stroke="#18e56b" strokeOpacity="0.7" />
          <circle cx="313" cy="249" r="7" fill="#18e56b" /><path d="M309.6 249.2 l2.5 2.6 l4.6 -5" stroke="#04140c" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x="325" y="252.4" fontSize="9.6" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">Verified host</text>
        </g>

        {/* the phone */}
        <ellipse cx="200" cy="420" rx="92" ry="9" fill="#000" opacity="0.5" />
        <g className="fs-float" filter="url(#fs-shadow)">
          <rect x="100" y="30" width="200" height="380" rx="34" fill="#0b100e" stroke="#2e4d3f" strokeWidth="2.5" />
          <rect x="97" y="120" width="3" height="40" rx="1.5" fill="#2e4d3f" /><rect x="300" y="150" width="3" height="64" rx="1.5" fill="#2e4d3f" />
          <rect x="114" y="46" width="172" height="348" rx="22" fill="#eef2ec" />
          <g clipPath="url(#fs-screen)">
            {/* the map, in the CX look */}
            <path d="M114 118 C150 108 176 138 214 124 S262 138 290 116 L290 90 L114 90 Z" fill="#cfe0dc" />
            <path d="M226 394 C234 344 262 334 290 336 L290 394 Z" fill="#d9ead6" />
            <path d="M114 300 C140 284 150 310 178 296 L178 394 L114 394 Z" fill="#dcebd9" />
            <g stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none">
              <path d="M114 176 L290 198" /><path d="M114 238 L290 222" /><path d="M114 300 L290 290" />
              <path d="M150 90 L168 394" /><path d="M208 90 L204 394" /><path d="M262 90 L272 394" />
            </g>
            <g stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none">
              <path d="M114 208 L290 212" /><path d="M114 270 L290 258" /><path d="M180 90 L186 394" /><path d="M236 90 L242 394" />
            </g>
            <path d="M114 334 C170 312 210 300 290 262" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
            {/* search bar */}
            <rect x="124" y="58" width="152" height="30" rx="15" fill="#fff" filter="url(#fs-shadow)" />
            <circle cx="142" cy="73" r="5.2" fill="none" stroke="#16161a" strokeWidth="2" /><path d="M146 77 l4.4 4.4" stroke="#16161a" strokeWidth="2" strokeLinecap="round" />
            <text x="158" y="77" fontSize="11.5" fontWeight="800" fill="#16161a" fontFamily="system-ui, sans-serif">{shown.city}</text>
            <rect className="fs-caret" x="196" y="65" width="1.6" height="16" fill="#0c9a45" />
            <circle cx="262" cy="73" r="9" fill="#eef2ec" /><path d="M257.5 70.5 h9 M259 73 h6 M260.5 75.5 h3" stroke="#16161a" strokeWidth="1.5" strokeLinecap="round" />

            {/* price pins popping in */}
            {pins.map((pin) => (
              <g key={pin.k} className={`fs-pin fs-pin-${pin.k}`} style={{ transformOrigin: `${pin.x}px ${pin.y + 10}px` }}>
                <rect x={pin.x - 21} y={pin.y - 11} width="42" height="22" rx="11" fill="#fff" filter="url(#fs-shadow)" />
                <text x={pin.x} y={pin.y + 4} fontSize="11" fontWeight="800" fill="#16161a" textAnchor="middle" fontFamily="system-ui, sans-serif">{pin.p}</text>
              </g>
            ))}
            {/* the one that gets tapped */}
            <g className="fs-pin fs-pin-c fs-pin-pick" style={{ transformOrigin: '168px 206px' }}>
              <rect x="146" y="185" width="44" height="22" rx="11" fill="#fff" className="fs-pick-bg" />
              <rect x="146" y="185" width="44" height="22" rx="11" fill="#0c9a45" className="fs-pick-on" />
              <text x="168" y="200" fontSize="11" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" fill="#16161a" className="fs-pick-off">{shown.price}</text>
              <text x="168" y="200" fontSize="11" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" fill="#fff" className="fs-pick-on">{shown.price}</text>
            </g>
            <circle className="fs-ring" cx="168" cy="196" r="18" fill="none" stroke="#0c9a45" strokeWidth="2.4" />

            {/* the finger */}
            <g className="fs-finger">
              <path d="M0 0 C-3 -2 -4 -6 -3 -14 C-2.5 -17 2.5 -17 3 -14 L3.6 -3 C5 -3 6 -2 6.6 -0.4 L9 6 C11 11 9 20 3 28 L-12 28 C-14 22 -12 15 -8 10 L-4 5 Z" fill="#f4d3b8" stroke="#c89a78" strokeWidth="1" transform="translate(168 200) rotate(-18)" />
            </g>

            {/* the card with the real photo and the car's name */}
            <g className="fs-card">
              <rect x="116" y="238" width="168" height="160" rx="20" fill="#fff" filter="url(#fs-shadow)" />
              <rect x="190" y="244" width="20" height="3" rx="1.5" fill="#d8ddd5" />
              <g clipPath="url(#fs-photo)">
                <image className="fs-photo" href={shown.image} x="126" y="250" width="148" height="74" preserveAspectRatio="xMidYMid slice" />
                <rect x="126" y="250" width="148" height="74" fill="url(#fs-gloss)" />
              </g>
              <rect x="132" y="256" width="52" height="15" rx="7.5" fill="#fff" fillOpacity="0.92" />
              <text x="158" y="266.4" fontSize="7.8" fontWeight="800" fill="#16161a" textAnchor="middle" fontFamily="system-ui, sans-serif">Instant book</text>
              <text x="126" y="341" fontSize="12.5" fontWeight="800" fill="#16161a" fontFamily="system-ui, sans-serif">{title}</text>
              <text x="126" y="355.5" fontSize="8.8" fill="#6b7168" fontFamily="system-ui, sans-serif">{shown.city} · {t('Verified host')}</text>
              <text x="274" y="356" fontSize="13" fontWeight="800" fill="#0c7a38" textAnchor="end" fontFamily="system-ui, sans-serif">{shown.price}<tspan fontSize="8.4" fontWeight="500" fill="#6b7168"> / {t('day')}</tspan></text>
              <rect x="126" y="364" width="148" height="24" rx="12" fill="#16161a" />
              <text x="200" y="379.4" fontSize="10.4" fontWeight="800" fill="#fff" textAnchor="middle" fontFamily="system-ui, sans-serif">{t('Reserve')}</text>
            </g>
          </g>
          <rect x="114" y="46" width="172" height="348" rx="22" fill="url(#fs-gloss)" />
          <rect x="178" y="52" width="44" height="8" rx="4" fill="#0b100e" />
        </g>

        {/* the CX bat hovering over the phone */}
        <g className="fs-bat" transform="translate(168 -6) scale(0.068) translate(-148 -376)">
          <polygon points="374,383 535,483 568,376 626,465 685,376 718,483 880,383 1100,688 972,626 894,703 794,628 625,850 457,628 355,703 278,626 148,688" fill="#18e56b" stroke="#9dffbf" strokeWidth="14" strokeLinejoin="miter" />
          <polyline points="626,465 625,850" stroke="#9dffbf" strokeWidth="10" fill="none" opacity="0.8" />
        </g>
      </svg>
    </SceneFrame>
  );
}
