import { Logo } from './primitives';

/**
 * Animated SVG supercar loader: a low, wide performance silhouette with a
 * sculpted-metal body gradient, a slow periodic light sweep across the
 * paint (the "reflection"), a pulsing green underglow and spinning
 * performance wheels. Deliberately restrained — one glint pass every
 * couple of seconds, not a constant shimmer — so it reads as premium
 * rather than busy.
 */
export function CarLoader({ size = 132 }: { size?: number }) {
  const bodyD =
    'M16 114 Q12 106 18 96 Q24 88 38 87 L60 85 Q70 80 88 79 L108 79 ' +
    'Q118 79 126 85 L136 92 Q148 89 162 91 Q174 93 182 101 L188 109 ' +
    'Q190 113 186 116 L176 118 L34 118 Q18 118 16 114 Z';

  return (
    <svg
      width={size}
      height={size * 0.72}
      viewBox="0 0 200 144"
      fill="none"
      role="img"
      aria-label="Loading"
    >
      <defs>
        <linearGradient id="loaderCarBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-line-strong)" />
          <stop offset="18%" stopColor="var(--color-ink-soft)" />
          <stop offset="55%" stopColor="var(--color-ink)" />
          <stop offset="100%" stopColor="#050605" />
        </linearGradient>
        <clipPath id="loaderCarClip">
          <path d={bodyD} />
        </clipPath>
      </defs>

      {/* Contact shadow + pulsing green underglow — grounds the car and
          reads as the one CX-brand accent behind it. */}
      <ellipse cx="102" cy="128" rx="84" ry="7" fill="#000" opacity="0.14" style={{ filter: 'blur(5px)' }} />
      <ellipse
        className="loader-glow"
        cx="102"
        cy="126"
        rx="66"
        ry="9"
        fill="var(--color-accent-bright)"
        opacity="0.2"
        style={{ filter: 'blur(7px)' }}
      />

      {/* Rear diffuser fins */}
      <g stroke="var(--color-line-strong)" strokeWidth="1.4" opacity="0.8">
        <line x1="20" y1="118" x2="26" y2="110" />
        <line x1="26" y1="118" x2="32" y2="111" />
        <line x1="32" y1="118" x2="38" y2="112" />
      </g>
      <line x1="20" y1="118" x2="24" y2="112" stroke="var(--color-accent-bright)" strokeWidth="1.4" opacity="0.85" />

      {/* Body */}
      <path d={bodyD} fill="url(#loaderCarBody)" />

      {/* Light sweep — clipped to the body silhouette so the "reflection"
          only ever travels across the paint. */}
      <g clipPath="url(#loaderCarClip)">
        <rect className="loader-sheen" x="-34" y="70" width="22" height="60" fill="#fff" opacity="0" transform="skewX(-18)" />
      </g>

      {/* Cabin / glass */}
      <path d="M42 87 Q56 82 72 81 L104 80 Q114 80 121 86 L130 93 L52 93 Q44 93 42 87 Z" fill="#0d100e" opacity="0.94" />
      <line x1="78" y1="81" x2="86" y2="93" stroke="var(--color-accent-bright)" strokeWidth="1.2" opacity="0.5" />

      {/* Side intake ahead of the front wheel */}
      <path d="M124 100 L140 97 L142 104 L126 107 Z" fill="#0d100e" opacity="0.85" />
      <line x1="128" y1="101" x2="139" y2="99" stroke="var(--color-faint)" strokeWidth="0.8" opacity="0.5" />
      <line x1="128" y1="104" x2="139" y2="102" stroke="var(--color-faint)" strokeWidth="0.8" opacity="0.5" />

      {/* Green pinstripe along the sill + splitter edge */}
      <line x1="34" y1="117.5" x2="176" y2="117.5" stroke="var(--color-accent-bright)" strokeWidth="1.3" opacity="0.75" />
      <line x1="182" y1="103" x2="188" y2="109" stroke="var(--color-accent-bright)" strokeWidth="1.6" opacity="0.9" />

      {/* Sharp LED headlight, blade-shaped, with a soft glow behind it */}
      <circle cx="180" cy="99" r="4" fill="var(--color-accent-bright)" opacity="0.35" style={{ filter: 'blur(3px)' }} />
      <path d="M172 98 L186 96 L184 101 L171 102 Z" fill="#fff" opacity="0.95" />
      <line x1="171" y1="104" x2="184" y2="103" stroke="var(--color-accent-bright)" strokeWidth="1.1" opacity="0.8" />

      {/* Rear wheel */}
      <g>
        <circle cx="46" cy="122" r="18" fill="var(--color-ink)" />
        <circle cx="46" cy="122" r="18" fill="none" stroke="var(--color-line-strong)" strokeWidth="1" opacity="0.35" />
        <rect x="56" y="119" width="4" height="6" rx="1" fill="var(--color-accent-bright)" opacity="0.8" />
        <g className="loader-wheel">
          <circle cx="46" cy="122" r="7.5" fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.85" />
          {[0, 72, 144, 216, 288].map((deg) => (
            <line
              key={deg}
              x1="46"
              y1="122"
              x2={46 + 7.2 * Math.cos((deg * Math.PI) / 180)}
              y2={122 + 7.2 * Math.sin((deg * Math.PI) / 180)}
              stroke="#fff"
              strokeWidth="1.6"
              opacity="0.85"
            />
          ))}
        </g>
      </g>

      {/* Front wheel */}
      <g>
        <circle cx="152" cy="122" r="18" fill="var(--color-ink)" />
        <circle cx="152" cy="122" r="18" fill="none" stroke="var(--color-line-strong)" strokeWidth="1" opacity="0.35" />
        <rect x="162" y="119" width="4" height="6" rx="1" fill="var(--color-accent-bright)" opacity="0.8" />
        <g className="loader-wheel" style={{ animationDelay: '-0.12s' }}>
          <circle cx="152" cy="122" r="7.5" fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.85" />
          {[0, 72, 144, 216, 288].map((deg) => (
            <line
              key={deg}
              x1="152"
              y1="122"
              x2={152 + 7.2 * Math.cos((deg * Math.PI) / 180)}
              y2={122 + 7.2 * Math.sin((deg * Math.PI) / 180)}
              stroke="#fff"
              strokeWidth="1.6"
              opacity="0.85"
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

/** Full-screen branded splash shown while the app boots. */
export function SplashScreen({ hiding }: { hiding: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-bg transition-opacity duration-500 ${
        hiding ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div className="animate-scale-in">
        <Logo />
      </div>
      {/* Logo settles first, then the car eases up into view a beat later. */}
      <div className="mt-8 animate-fade-up" style={{ animationDelay: '160ms' }}>
        <CarLoader />
      </div>
      {/* Indeterminate progress bar — the one small CX-green loading cue */}
      <div className="mt-6 h-1 w-40 overflow-hidden rounded-full bg-panel-2 animate-fade-in" style={{ animationDelay: '360ms' }}>
        <div
          className="h-full w-1/3 rounded-full bg-accent"
          style={{ animation: 'loader-bar 1.1s var(--ease-out-expo) infinite' }}
        />
      </div>
      <p className="mt-4 text-[13px] text-muted animate-fade-in" style={{ animationDelay: '360ms' }}>
        Warming up the engine…
      </p>
    </div>
  );
}
