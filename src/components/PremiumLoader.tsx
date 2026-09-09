import { LOGO_SRC } from './primitives';

/**
 * The premium loading system — one reusable orbit animation
 * (`SupercarOrbit`) driving two presentations:
 *
 *   `PremiumPageLoader`    — compact, dropped into any page/section
 *                            that's waiting on data (the same role the
 *                            old plain `CarLoader` spinner used to play).
 *   `PremiumInitialLoader` — the full-screen cinematic splash shown once
 *                            per session while the app first boots.
 *
 * Both are pure CSS: a supercar silhouette and its ground shadow sweep
 * around an elliptical path via a single `transform` keyframe animation
 * each (see `.orbit-car-el`/`.orbit-shadow-el` in index.css) — no motion-
 * path browser-support gamble, no JS animation loop, no WebGL. The
 * ellipse radius is passed in as CSS custom properties (`--orbit-rx`/
 * `--orbit-ry`), so the exact same two keyframe definitions drive the
 * tiny inline spinner and the large splash animation alike.
 */

/** The car artwork itself — a low, wide performance silhouette with a
 *  sculpted-metal body gradient, a slow periodic light sweep across the
 *  paint, a pulsing green underglow and spinning wheels. This is the
 *  same illustration the old `CarLoader` used; only its container now
 *  moves it around an orbit instead of holding it still. */
function SupercarSprite({ size }: { size: number }) {
  const bodyD =
    'M16 114 Q12 106 18 96 Q24 88 38 87 L60 85 Q70 80 88 79 L108 79 ' +
    'Q118 79 126 85 L136 92 Q148 89 162 91 Q174 93 182 101 L188 109 ' +
    'Q190 113 186 116 L176 118 L34 118 Q18 118 16 114 Z';

  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 200 144" fill="none" role="img" aria-label="">
      <defs>
        <linearGradient id="orbitCarBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e4e4de" />
          <stop offset="18%" stopColor="#8a8a82" />
          <stop offset="55%" stopColor="#232420" />
          <stop offset="100%" stopColor="#050605" />
        </linearGradient>
        <clipPath id="orbitCarClip">
          <path d={bodyD} />
        </clipPath>
      </defs>

      {/* Rear diffuser fins */}
      <g stroke="#dcdbd3" strokeWidth="1.4" opacity="0.8">
        <line x1="20" y1="118" x2="26" y2="110" />
        <line x1="26" y1="118" x2="32" y2="111" />
        <line x1="32" y1="118" x2="38" y2="112" />
      </g>
      <line x1="20" y1="118" x2="24" y2="112" stroke="#00d447" strokeWidth="1.4" opacity="0.85" />

      {/* Body */}
      <path d={bodyD} fill="url(#orbitCarBody)" />

      {/* Light sweep — clipped to the body silhouette so the "reflection"
          only ever travels across the paint. */}
      <g clipPath="url(#orbitCarClip)">
        <rect className="loader-sheen" x="-34" y="70" width="22" height="60" fill="#fff" opacity="0" transform="skewX(-18)" />
      </g>

      {/* Cabin / glass */}
      <path d="M42 87 Q56 82 72 81 L104 80 Q114 80 121 86 L130 93 L52 93 Q44 93 42 87 Z" fill="#0d100e" opacity="0.94" />
      <line x1="78" y1="81" x2="86" y2="93" stroke="#00d447" strokeWidth="1.2" opacity="0.5" />

      {/* Side intake ahead of the front wheel */}
      <path d="M124 100 L140 97 L142 104 L126 107 Z" fill="#0d100e" opacity="0.85" />
      <line x1="128" y1="101" x2="139" y2="99" stroke="#8b8b83" strokeWidth="0.8" opacity="0.5" />
      <line x1="128" y1="104" x2="139" y2="102" stroke="#8b8b83" strokeWidth="0.8" opacity="0.5" />

      {/* Green pinstripe along the sill + splitter edge */}
      <line x1="34" y1="117.5" x2="176" y2="117.5" stroke="#00d447" strokeWidth="1.3" opacity="0.75" />
      <line x1="182" y1="103" x2="188" y2="109" stroke="#00d447" strokeWidth="1.6" opacity="0.9" />

      {/* Sharp LED headlight, blade-shaped, with a soft glow behind it */}
      <circle cx="180" cy="99" r="4" fill="#00d447" opacity="0.35" style={{ filter: 'blur(3px)' }} />
      <path d="M172 98 L186 96 L184 101 L171 102 Z" fill="#fff" opacity="0.95" />
      <line x1="171" y1="104" x2="184" y2="103" stroke="#00d447" strokeWidth="1.1" opacity="0.8" />

      {/* Wheels */}
      {[46, 152].map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy="122" r="18" fill="#16161a" />
          <circle cx={cx} cy="122" r="18" fill="none" stroke="#dcdbd3" strokeWidth="1" opacity="0.35" />
          <rect x={cx + 10} y="119" width="4" height="6" rx="1" fill="#00d447" opacity="0.8" />
          <g className="loader-wheel" style={i === 1 ? { animationDelay: '-0.12s' } : undefined}>
            <circle cx={cx} cy="122" r="7.5" fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.85" />
            {[0, 72, 144, 216, 288].map((deg) => (
              <line
                key={deg}
                x1={cx}
                y1="122"
                x2={cx + 7.2 * Math.cos((deg * Math.PI) / 180)}
                y2={122 + 7.2 * Math.sin((deg * Math.PI) / 180)}
                stroke="#fff"
                strokeWidth="1.6"
                opacity="0.85"
              />
            ))}
          </g>
        </g>
      ))}
    </svg>
  );
}

/** The reusable orbit: a platform ring, a ground shadow and the car
 *  itself, the latter two swept around the SAME elliptical path (fed by
 *  `--orbit-rx`/`--orbit-ry`) so the shadow always sits directly under
 *  wherever the car currently is. `duration` alone is enough to make one
 *  instance feel like an unhurried showroom turntable and another feel
 *  like a brisk in-page spinner — same motion, different pace. */
export function SupercarOrbit({ size = 160, duration = 4.2 }: { size?: number; duration?: number }) {
  const rx = size * 0.5;
  const ry = size * 0.14;
  const carW = size * 0.6;
  const vars = {
    ['--orbit-rx' as string]: `${rx}px`,
    ['--orbit-ry' as string]: `${ry}px`,
    ['--orbit-duration' as string]: `${duration}s`,
  };

  return (
    <div className="relative" style={{ width: size, height: size * 0.62, ...vars }}>
      {/* Platform ring — a flattened glow standing in for the circular
          track itself, so the motion reads as "going around something"
          from the very first frame, not just a car sliding side to side. */}
      <div
        className="orbit-ring absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ width: rx * 2.05, height: ry * 2.3 }}
      />
      <div
        className="orbit-shadow-el absolute left-1/2 top-1/2 rounded-full bg-black"
        style={{ width: carW * 0.62, height: carW * 0.14, marginLeft: -(carW * 0.31), marginTop: -(carW * 0.07) }}
      />
      <div
        className="orbit-car-el absolute left-1/2 top-1/2"
        style={{ width: carW, marginLeft: -(carW / 2), marginTop: -(carW * 0.37) }}
      >
        <SupercarSprite size={carW} />
      </div>
    </div>
  );
}

/** Drop-in replacement for the old bare `CarLoader` spinner — the
 *  compact half of the premium loading system, used both as the
 *  Suspense fallback for lazy-loaded routes and inside any page/panel
 *  that's waiting on its own data. Same `size` contract as before, so
 *  every existing call site only needed its import/tag renamed, not
 *  restructured. */
export function PremiumPageLoader({ size = 90, label = 'Loading' }: { size?: number; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-2" role="status" aria-label={label}>
      <SupercarOrbit size={size} duration={3.1} />
      <p className="text-nano font-semibold uppercase tracking-[0.2em] text-faint">{label}</p>
    </div>
  );
}

/** Full-screen cinematic splash shown once per session while the app
 *  boots — dark, atmospheric, the supercar orbit at showroom scale, the
 *  wordmark beneath it, and an indeterminate progress sweep rather than
 *  a fabricated percentage (there's no real download-progress signal to
 *  report here, and a precise-looking number that isn't would be worse
 *  than an honestly indeterminate bar). */
export function PremiumInitialLoader({ hiding }: { hiding: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-noir transition-opacity duration-500 ${
        hiding ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Cinematic backdrop — a deep vignette plus a low brand-green wash,
          the same "premium night" language the Drive Challenge already
          uses, rather than a flat single color. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 70% at 50% 38%, rgba(0,212,71,0.14), transparent 60%),' +
            'radial-gradient(140% 90% at 50% 100%, rgba(0,212,71,0.06), transparent 55%),' +
            'linear-gradient(180deg, #0a0d0b 0%, #0d120e 55%, #080b09 100%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:3px_3px]" />

      <div className="relative animate-scale-in">
        <SupercarOrbit size={240} duration={5.4} />
      </div>

      <img
        src={LOGO_SRC.wordmark}
        alt="CX"
        className="relative mt-4 h-6 w-auto object-contain opacity-95 animate-fade-up"
        style={{ animationDelay: '160ms' }}
      />

      <div className="relative mt-7 flex flex-col items-center gap-2 animate-fade-in" style={{ animationDelay: '320ms' }}>
        <p className="text-nano font-bold uppercase tracking-[0.32em] text-accent-bright/80">Loading</p>
        <div className="h-[3px] w-44 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 rounded-full bg-accent-bright" style={{ animation: 'loader-bar 1.3s var(--ease-out-expo) infinite' }} />
        </div>
      </div>
    </div>
  );
}
