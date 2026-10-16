import { SceneFrame } from './SceneFrame';
import { useLocale } from '../../../lib/i18n';

/** "Hit the road": a cartoon sports car cruises into a sunset — hills, skyline and poles slide past at their own speeds,
 *  the road's dashes run, a green route glows ahead of the car and a turn-by-turn chip counts the kilometres. */
const BLDG: [number, number, number][] = [[0, 40, 36], [24, 30, 44], [54, 50, 30], [88, 26, 54], [120, 44, 34], [150, 34, 46], [188, 54, 28], [220, 28, 50], [256, 46, 32], [290, 32, 42], [320, 52, 30], [352, 30, 48], [384, 42, 34]];

export function RoadScene({ car = { name: 'Porsche 911 Carrera S', image: '/home/porsche-900.webp' } }: { car?: { name: string; image: string } }) {
  const { t } = useLocale();
  return (
    <SceneFrame>
      <svg viewBox="0 0 400 440" preserveAspectRatio="xMidYMid meet" className="block h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="rs-sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="300">
            <stop offset="0" stopColor="#2a1246" />
            <stop offset="0.42" stopColor="#d9482f" />
            <stop offset="0.7" stopColor="#ff9a3d" />
            <stop offset="1" stopColor="#ffd27a" />
          </linearGradient>
          <radialGradient id="rs-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff3c4" />
            <stop offset="0.5" stopColor="#ffc15a" stopOpacity="0.95" />
            <stop offset="1" stopColor="#ff8a3d" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="rs-road" gradientUnits="userSpaceOnUse" x1="0" y1="318" x2="0" y2="440">
            <stop offset="0" stopColor="#1d1b25" />
            <stop offset="1" stopColor="#0d0c12" />
          </linearGradient>
          <clipPath id="rs-photo"><rect x="24" y="54" width="86" height="66" rx="10" /></clipPath>
          <filter id="rs-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x="-1200" y="-1200" width="2800" height="1500" fill="url(#rs-sky)" />
        <circle className="rs-sun" cx="248" cy="238" r="62" fill="url(#rs-sun)" />
        <circle cx="248" cy="238" r="26" fill="#fff0c0" />
        {/* clouds */}
        <g fill="#ffb27a" opacity="0.55">
          <g className="rs-cloud" style={{ animationDuration: '46s' }}><ellipse cx="60" cy="70" rx="46" ry="10" /><ellipse cx="96" cy="62" rx="30" ry="9" /></g>
          <g className="rs-cloud" style={{ animationDuration: '62s', animationDelay: '-20s' }}><ellipse cx="300" cy="110" rx="52" ry="11" /><ellipse cx="338" cy="100" rx="28" ry="8" /></g>
          <g className="rs-cloud" style={{ animationDuration: '54s', animationDelay: '-34s' }}><ellipse cx="180" cy="150" rx="40" ry="8" /></g>
        </g>
        {/* far hills */}
        <g className="rs-slide-slow" fill="#6a2a52">
          {[-1200, -600, 0, 600, 1200].map((dx) => (
            <path key={dx} transform={`translate(${dx} 0)`} d="M-20 262 L40 232 L90 252 L150 220 L214 250 L270 226 L330 250 L400 224 L460 252 L520 232 L580 262 L580 300 L-20 300 Z" />
          ))}
        </g>
        {/* skyline */}
        <g className="rs-slide-mid">
          {[-800, -400, 0, 400, 800].map((dx) => (
            <g key={dx} transform={`translate(${dx} 0)`}>
              <g fill="#2a1d3a">
                {BLDG.map(([x, w, h], i) => <rect key={i} x={x} y={296 - h} width={w} height={h + 4} />)}
              </g>
              {BLDG.map(([x, , h], i) => <rect key={`w${i}`} x={x + 6} y={296 - h + 8} width="3" height="3" fill="#ffc15a" opacity={0.5 + (i % 3) * 0.2} />)}
            </g>
          ))}
        </g>
        <rect x="-1200" y="296" width="2800" height="1000" fill="#14121c" />
        {/* near trees and poles */}
        <g className="rs-slide-fast">
          {[-570, -450, -330, -210, -90, 30, 150, 270, 390, 510, 630, 750, 870].map((x) => (
            <g key={x}>
              <rect x={x} y="262" width="3" height="40" fill="#0d0b14" />
              <circle cx={x + 1.5} cy="256" r="14" fill="#122a1c" />
              <circle cx={x + 10} cy="262" r="10" fill="#183823" />
            </g>
          ))}
        </g>
        {/* road */}
        <rect x="-1200" y="318" width="2800" height="1000" fill="url(#rs-road)" />
        <rect x="-1200" y="318" width="2800" height="3" fill="#2a2733" />
        <g className="rs-dash"><g fill="#d9d4c4">
          {Array.from({ length: 36 }, (_, i) => <rect key={i} x={-640 + i * 64} y="372" width="34" height="5" rx="2.5" />)}
        </g></g>
        <rect x="-1200" y="426" width="2800" height="900" fill="#15131c" />
        {/* the route ahead, glowing, with arrows running along it */}
        <path d="M 250 348 C 300 346 330 336 400 330" stroke="#00e060" strokeWidth="5" fill="none" strokeLinecap="round" filter="url(#rs-glow)" opacity="0.9" />
        <g className="rs-arrows" fill="none" stroke="#b6ffd0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M268 340 l8 8 l-8 8" /><path d="M296 340 l8 8 l-8 8" /><path d="M324 340 l8 8 l-8 8" />
        </g>

        {/* the car, bouncing a little, wheels turning */}
        <g className="rs-car">
          <ellipse cx="152" cy="400" rx="92" ry="8" fill="#000" opacity="0.35" />
          <g className="rs-wheel-a" style={{ transformOrigin: '108px 380px' }}>
            <circle cx="108" cy="380" r="20" fill="#0c0b10" /><circle cx="108" cy="380" r="12" fill="#2b2933" />
            <path d="M108 368 v24 M96 380 h24 M99.5 371.5 l17 17 M116.5 371.5 l-17 17" stroke="#8d8aa0" strokeWidth="1.6" />
          </g>
          <g className="rs-wheel-a" style={{ transformOrigin: '206px 380px' }}>
            <circle cx="206" cy="380" r="20" fill="#0c0b10" /><circle cx="206" cy="380" r="12" fill="#2b2933" />
            <path d="M206 368 v24 M194 380 h24 M197.5 371.5 l17 17 M214.5 371.5 l-17 17" stroke="#8d8aa0" strokeWidth="1.6" />
          </g>
          {/* body */}
          <path d="M70 374 L70 352 Q74 344 92 342 L128 336 Q146 312 176 310 L204 312 Q232 320 246 338 L262 346 Q272 352 272 366 L272 374 L226 374 Q226 354 206 354 Q186 354 186 374 L128 374 Q128 354 108 354 Q88 354 88 374 Z" fill="#14e066" />
          <path d="M70 374 L70 352 Q74 344 92 342 L128 336 L134 346 L88 352 L88 374 Z" fill="#0fb853" />
          <path d="M138 336 Q154 316 178 314 L200 316 Q222 324 232 338 Z" fill="#0a1a14" />
          <path d="M184 316 L184 336 M156 330 Q166 320 180 318" stroke="#18e56b" strokeWidth="2" fill="none" />
          <path d="M92 360 L262 360" stroke="#0a3a20" strokeWidth="2" />
          {/* lights */}
          <rect x="262" y="350" width="10" height="6" rx="3" fill="#fff7d0" />
          <path className="rs-beam" d="M272 352 L330 340 L330 366 Z" fill="#fff3c4" opacity="0.4" />
          <rect x="68" y="352" width="6" height="5" rx="2" fill="#ff3b3b" />
          <path d="M70 342 L58 340 L60 346 Z" fill="#0fb853" />
        </g>

        {/* turn-by-turn chip */}
        <g className="rs-chip">
          <rect x="262" y="58" width="112" height="52" rx="14" fill="#0a1a14" stroke="#18e56b" strokeOpacity="0.7" />
          <path d="M286 92 V78 Q286 70 294 70 H304" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M301 64 l9 6 l-9 6" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {['2.4 km', '1.6 km', '0.8 km'].map((km, i) => (
            <text key={km} className={`rs-km rs-km-${i}`} x="318" y="92" fontSize="16" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">{km}</text>
          ))}
          <text className="rs-km rs-km-3" x="318" y="92" fontSize="14" fontWeight="800" fill="#7dffa8" fontFamily="system-ui, sans-serif">{t('Arrived')}</text>
        </g>
        {/* the car you are about to pick up: a real photo and its name, once the route is done */}
        <g className="rs-card">
          <rect x="14" y="44" width="228" height="86" rx="16" fill="#0a1a14" fillOpacity="0.9" stroke="#18e56b" strokeOpacity="0.7" />
          <g clipPath="url(#rs-photo)">
            <image href={car.image} x="24" y="54" width="86" height="66" preserveAspectRatio="xMidYMid slice" />
          </g>
          <text x="118" y="76" fontSize="9.8" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">{car.name}</text>
          <text x="118" y="90" fontSize="8.4" fill="#9fd9b6" fontFamily="system-ui, sans-serif">Milan · {t('Verified host')}</text>
          <circle cx="127" cy="108" r="8" fill="#18e56b" />
          <path d="M123.2 108.2 l3 3.2 l5.2 -6" stroke="#04140c" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x="140" y="111.4" fontSize="9.6" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">{t('Keys ready')}</text>
        </g>
        {/* map pin on the horizon */}
        <g className="rs-pin" transform="translate(120 226)">
          <path d="M0 0 C-9 -12 -9 -24 0 -24 C9 -24 9 -12 0 0 Z" fill="#18e56b" />
          <circle cy="-15" r="3.6" fill="#0a1a14" />
        </g>
      </svg>
    </SceneFrame>
  );
}
