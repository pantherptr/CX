import { SceneFrame } from './SceneFrame';

/** "Find your car": a phone with a map. Prices pop onto it one by one, one pin is picked, and the car's card slides up. */
export function FindScene() {
  return (
    <SceneFrame>
      <svg viewBox="0 0 400 440" preserveAspectRatio="xMidYMid meet" className="block h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="fs-bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="440">
            <stop offset="0" stopColor="#071410" />
            <stop offset="1" stopColor="#0d2a1d" />
          </linearGradient>
          <radialGradient id="fs-glow" cx="50%" cy="46%" r="55%">
            <stop offset="0" stopColor="#00e060" stopOpacity="0.38" />
            <stop offset="1" stopColor="#00e060" stopOpacity="0" />
          </radialGradient>
          <clipPath id="fs-screen"><rect x="116" y="58" width="168" height="322" rx="20" /></clipPath>
        </defs>
        <rect x="-1200" y="-800" width="2800" height="2000" fill="url(#fs-bg)" />
        <circle cx="200" cy="215" r="190" fill="url(#fs-glow)" />
        {/* faint city grid behind the phone */}
        <g stroke="#14352a" strokeWidth="1.2">
          {[-300, -240, -180, -120, -60, 0, 40, 100, 160, 220, 280, 340, 400, 460, 520, 580, 640, 700].map((y) => <line key={`h${y}`} x1="-1200" x2="1600" y1={y} y2={y} />)}
          {[-690, -630, -570, -510, -450, -390, -330, -270, -210, -150, -90, -30, 30, 90, 150, 210, 270, 330, 390, 450, 510, 570, 630, 690, 750, 810, 870, 930, 990].map((x) => <line key={`v${x}`} y1="-800" y2="1200" x1={x} x2={x} />)}
        </g>
        {/* sparkles */}
        {[[44, 70], [352, 110], [60, 360], [340, 330], [86, 210]].map(([x, y], i) => (
          <circle key={i} className="fs-spark" cx={x} cy={y} r="2.2" fill="#7dffa8" style={{ animationDelay: `${i * 0.7}s` }} />
        ))}

        <g className="fs-float">
          {/* phone */}
          <rect x="104" y="46" width="192" height="346" rx="30" fill="#0a0f0d" stroke="#2c4a3b" strokeWidth="2.5" />
          <rect x="116" y="58" width="168" height="322" rx="20" fill="#eef2ec" />
          <g clipPath="url(#fs-screen)">
            {/* map */}
            <path d="M116 150 C150 138 170 170 210 156 S262 170 290 150 L290 120 L116 120 Z" fill="#cfe0dc" />
            <path d="M230 380 C238 330 262 318 290 320 L290 380 Z" fill="#d9ead6" />
            <g stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none">
              <path d="M116 190 L290 214" /><path d="M116 252 L290 236" /><path d="M116 312 L290 300" />
              <path d="M150 120 L166 380" /><path d="M210 120 L206 380" /><path d="M262 120 L270 380" />
            </g>
            <g stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none">
              <path d="M116 222 L290 226" /><path d="M116 282 L290 270" /><path d="M180 120 L184 380" /><path d="M236 120 L240 380" />
            </g>
            {/* search bar */}
            <rect x="128" y="70" width="144" height="28" rx="14" fill="#fff" />
            <circle cx="144" cy="84" r="5" fill="none" stroke="#16161a" strokeWidth="2" />
            <path d="M148 88 l4 4" stroke="#16161a" strokeWidth="2" strokeLinecap="round" />
            <text x="160" y="88" fontSize="11" fontWeight="700" fill="#16161a" fontFamily="system-ui, sans-serif">Milan</text>
            <rect className="fs-caret" x="194" y="77" width="1.6" height="14" fill="#0c9a45" />

            {/* price pins popping in */}
            {[
              { x: 160, y: 178, p: '€31', d: 0.9 },
              { x: 236, y: 214, p: '€189', d: 1.35 },
              { x: 150, y: 262, p: '€95', d: 1.8, pick: true },
              { x: 244, y: 288, p: '€64', d: 2.2 },
            ].map((pin) => (
              <g key={pin.p} className={`fs-pin ${pin.pick ? 'fs-pin-pick' : ''}`} style={{ animationDelay: `${pin.d}s`, transformOrigin: `${pin.x}px ${pin.y + 10}px` }}>
                <rect x={pin.x - 19} y={pin.y - 10} width="38" height="20" rx="10" fill={pin.pick ? '#0c9a45' : '#fff'} stroke="#16161a" strokeOpacity="0.12" />
                <text x={pin.x} y={pin.y + 4} fontSize="10.5" fontWeight="800" fill={pin.pick ? '#fff' : '#16161a'} textAnchor="middle" fontFamily="system-ui, sans-serif">{pin.p}</text>
              </g>
            ))}
            <circle className="fs-ring" cx="150" cy="262" r="16" fill="none" stroke="#0c9a45" strokeWidth="2" />

            {/* the car's card slides up */}
            <g className="fs-card">
              <rect x="124" y="300" width="152" height="68" rx="14" fill="#fff" stroke="#16161a" strokeOpacity="0.08" />
              <rect x="132" y="308" width="52" height="36" rx="8" fill="#16161a" />
              <path d="M138 330 q4-9 14-10 h14 q8 1 13 10 z" fill="#2c4a3b" />
              <circle cx="146" cy="332" r="3.2" fill="#7dffa8" /><circle cx="172" cy="332" r="3.2" fill="#7dffa8" />
              <text x="192" y="322" fontSize="10.5" fontWeight="800" fill="#16161a" fontFamily="system-ui, sans-serif">BMW M2</text>
              <text x="192" y="336" fontSize="9" fill="#6b7168" fontFamily="system-ui, sans-serif">€95 / day · Milan</text>
              <rect x="132" y="350" width="136" height="12" rx="6" fill="#16161a" />
              <text x="200" y="359" fontSize="8.4" fontWeight="800" fill="#fff" textAnchor="middle" fontFamily="system-ui, sans-serif">Reserve</text>
            </g>
          </g>
          {/* speaker notch */}
          <rect x="176" y="62" width="48" height="6" rx="3" fill="#0a0f0d" />
        </g>

        {/* the CX bat hovering over the phone */}
        <g className="fs-bat" transform="translate(166 8) scale(0.068) translate(-148 -376)">
          <polygon points="374,383 535,483 568,376 626,465 685,376 718,483 880,383 1100,688 972,626 894,703 794,628 625,850 457,628 355,703 278,626 148,688" fill="#18e56b" stroke="#9dffbf" strokeWidth="14" strokeLinejoin="miter" />
          <polyline points="626,465 625,850" stroke="#9dffbf" strokeWidth="10" fill="none" opacity="0.8" />
        </g>
      </svg>
    </SceneFrame>
  );
}
