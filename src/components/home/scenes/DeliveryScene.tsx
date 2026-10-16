import { SceneFrame } from './SceneFrame';
import { useLocale } from '../../../lib/i18n';

/** "Delivered to your door": a night house, lights on. The car rolls in from the left, stops at the door, a green
 *  ring pulses on the wet ground and an "Arrived — your car is at your door" card pops up above it. One 9 s loop. */
export function DeliveryScene() {
  const { t } = useLocale();
  return (
    <SceneFrame>
      <svg viewBox="0 0 400 440" preserveAspectRatio="xMidYMid meet" className="block h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="ds-sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="330">
            <stop offset="0" stopColor="#04080f" /><stop offset="1" stopColor="#0d2230" />
          </linearGradient>
          <linearGradient id="ds-win" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd98a" /><stop offset="1" stopColor="#ff9f45" />
          </linearGradient>
          <linearGradient id="ds-ground" gradientUnits="userSpaceOnUse" x1="0" y1="330" x2="0" y2="440">
            <stop offset="0" stopColor="#10181a" /><stop offset="1" stopColor="#060a0b" />
          </linearGradient>
          <radialGradient id="ds-uplight" cx="50%" cy="100%" r="80%">
            <stop offset="0" stopColor="#1ee06a" stopOpacity="0.55" /><stop offset="1" stopColor="#1ee06a" stopOpacity="0" />
          </radialGradient>
          <filter id="ds-blur"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>
        <rect x="-1200" y="-1200" width="2800" height="1700" fill="url(#ds-sky)" />
        {/* moon and stars */}
        <circle cx="318" cy="56" r="16" fill="#e8f1ff" opacity="0.92" />
        <circle cx="324" cy="52" r="14" fill="#04080f" opacity="0.35" />
        {[[40, 40], [92, 76], [150, 30], [210, 64], [262, 28], [360, 100], [24, 120], [120, 110]].map(([x, y], i) => (
          <circle key={i} className="ds-star" cx={x} cy={y} r="1.6" fill="#fff" style={{ animationDelay: `${i * 0.45}s` }} />
        ))}
        {/* trees with green uplights */}
        <ellipse cx="26" cy="330" rx="46" ry="70" fill="url(#ds-uplight)" />
        <ellipse cx="380" cy="330" rx="40" ry="64" fill="url(#ds-uplight)" />
        <circle cx="22" cy="214" r="46" fill="#0a1c14" /><circle cx="48" cy="236" r="34" fill="#0d2619" />
        <circle cx="384" cy="224" r="42" fill="#0a1c14" /><circle cx="360" cy="244" r="30" fill="#0d2619" />
        <circle cx="-60" cy="232" r="52" fill="#08170f" /><circle cx="-120" cy="250" r="44" fill="#0a1c14" /><circle cx="450" cy="236" r="50" fill="#08170f" /><circle cx="520" cy="254" r="42" fill="#0a1c14" />
        <rect x="-1200" y="290" width="1200" height="40" fill="#07120d" /><rect x="400" y="290" width="1200" height="40" fill="#07120d" />

        {/* the house */}
        <rect x="42" y="116" width="316" height="214" fill="#1a211f" />
        <rect x="32" y="104" width="336" height="16" fill="#0b100e" />
        <rect x="42" y="116" width="316" height="3" fill="#2a3532" />
        {/* big window, lit */}
        <rect x="64" y="146" width="116" height="118" fill="url(#ds-win)" />
        <g stroke="#7a4a1c" strokeWidth="3"><path d="M122 146 V264" /><path d="M64 205 H180" /></g>
        <rect x="64" y="146" width="116" height="118" fill="none" stroke="#0b100e" strokeWidth="5" />
        {/* upper small windows */}
        <rect x="204" y="146" width="40" height="56" fill="url(#ds-win)" opacity="0.9" /><rect x="204" y="146" width="40" height="56" fill="none" stroke="#0b100e" strokeWidth="4" />
        {/* door, lit, with a bell */}
        <rect x="262" y="186" width="56" height="144" fill="#2a1d12" />
        <rect x="268" y="192" width="44" height="138" fill="url(#ds-win)" opacity="0.85" />
        <rect x="262" y="186" width="56" height="144" fill="none" stroke="#0b100e" strokeWidth="5" />
        <circle cx="334" cy="262" r="5" fill="#0b100e" /><circle className="ds-bell" cx="334" cy="262" r="2.6" fill="#1ee06a" />
        {/* warm light spilling on the ground */}
        <ellipse cx="124" cy="346" rx="86" ry="14" fill="#ff9f45" opacity="0.22" filter="url(#ds-blur)" />
        <ellipse cx="290" cy="346" rx="44" ry="12" fill="#ff9f45" opacity="0.28" filter="url(#ds-blur)" />

        {/* wet ground */}
        <rect x="-1200" y="330" width="2800" height="1000" fill="url(#ds-ground)" />
        <rect x="-1200" y="330" width="2800" height="2" fill="#1d2a2c" />
        <g stroke="#1a2528" strokeWidth="1">
          {[352, 372, 396, 424, 460, 500, 560].map((y) => <line key={y} x1="-1200" x2="1600" y1={y} y2={y} />)}
        </g>

        {/* the person waiting at the door */}
        <g className="ds-person">
          <ellipse cx="296" cy="332" rx="14" ry="3" fill="#000" opacity="0.4" />
          <rect x="288" y="288" width="16" height="42" rx="7" fill="#0a0e10" />
          <circle cx="296" cy="280" r="8.5" fill="#0a0e10" />
          <path className="ds-arm" d="M304 298 L318 290" stroke="#0a0e10" strokeWidth="5" strokeLinecap="round" />
        </g>

        {/* the car rolling in */}
        <g className="ds-car">
          <ellipse cx="138" cy="372" rx="100" ry="9" fill="#000" opacity="0.45" />
          <g className="ds-wheel" style={{ transformOrigin: '86px 352px' }}>
            <circle cx="86" cy="352" r="21" fill="#07090a" /><circle cx="86" cy="352" r="13" fill="#262b2e" />
            <path d="M86 339 v26 M73 352 h26 M77 343 l18 18 M95 343 l-18 18" stroke="#7d8a8e" strokeWidth="1.6" />
          </g>
          <g className="ds-wheel" style={{ transformOrigin: '196px 352px' }}>
            <circle cx="196" cy="352" r="21" fill="#07090a" /><circle cx="196" cy="352" r="13" fill="#262b2e" />
            <path d="M196 339 v26 M183 352 h26 M187 343 l18 18 M205 343 l-18 18" stroke="#7d8a8e" strokeWidth="1.6" />
          </g>
          <path d="M44 348 L44 326 Q50 316 70 314 L112 308 Q130 286 164 284 L196 286 Q226 296 240 312 L258 320 Q270 326 270 340 L270 348 L218 348 Q218 328 196 328 Q174 328 174 348 L108 348 Q108 328 86 328 Q64 328 64 348 Z" fill="#46544f" />
          <path d="M50 322 Q56 316 72 314 L112 308 Q130 288 164 286 L196 288 Q226 298 240 313" stroke="#9dffbf" strokeOpacity="0.55" strokeWidth="1.6" fill="none" />
          <path d="M44 348 L44 326 Q50 316 70 314 L112 308 L118 320 L66 326 L64 348 Z" fill="#2c3834" />
          <path d="M122 308 Q140 290 166 288 L194 290 Q216 298 228 312 Z" fill="#0a1214" />
          <path d="M52 336 L262 332" stroke="#1ee06a" strokeWidth="2.4" className="ds-line" />
          <rect x="262" y="322" width="10" height="6" rx="3" fill="#fff7d0" />
          <path className="ds-beam" d="M272 324 L340 312 L340 344 Z" fill="#fff3c4" opacity="0.35" />
          <rect x="42" y="326" width="6" height="6" rx="2" fill="#ff3b3b" />
          <path d="M46 314 L32 312 L34 320 Z" fill="#171b1d" />
        </g>
        {/* green ring pulsing around the parked car */}
        <ellipse className="ds-ring" cx="156" cy="372" rx="116" ry="14" fill="none" stroke="#1ee06a" strokeWidth="2.2" />
        <ellipse className="ds-ring ds-ring-2" cx="156" cy="372" rx="116" ry="14" fill="none" stroke="#1ee06a" strokeWidth="1.6" />

        {/* the "arrived" card */}
        <g className="ds-card">
          <rect x="74" y="64" width="176" height="68" rx="16" fill="#0b1a16" fillOpacity="0.86" stroke="#1ee06a" strokeOpacity="0.8" />
          <circle cx="102" cy="98" r="15" fill="#1ee06a" />
          <path d="M94 98.5 l6 6 l11 -12" stroke="#04140c" strokeWidth="3.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x="126" y="92" fontSize="14" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">{t('Arrived')}</text>
          <text x="126" y="108" fontSize="9.6" fill="#b9d6c8" fontFamily="system-ui, sans-serif">{t('Your CX is at the door')}</text>
        </g>
        {/* key sparkle between the hand and the car */}
        <g className="ds-key" transform="translate(282 296)">
          <circle r="3" fill="#1ee06a" /><path d="M-8 0 h-8 m4 0 v4" stroke="#1ee06a" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </g>
      </svg>
    </SceneFrame>
  );
}
