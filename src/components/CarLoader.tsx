import { Logo } from './primitives';

/**
 * Animated SVG car loader: a coupe bobbing on its suspension with spinning
 * wheels, a scrolling road, exhaust smoke puffs and speed lines.
 */
export function CarLoader({ size = 132 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.72}
      viewBox="0 0 200 144"
      fill="none"
      role="img"
      aria-label="Loading"
    >
      {/* Speed lines behind the car */}
      <g stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" opacity="0.9">
        <line className="loader-speed" style={{ animationDelay: '0s' }} x1="34" y1="52" x2="18" y2="52" />
        <line className="loader-speed" style={{ animationDelay: '0.22s' }} x1="30" y1="70" x2="12" y2="70" />
        <line className="loader-speed" style={{ animationDelay: '0.44s' }} x1="36" y1="88" x2="20" y2="88" />
      </g>

      {/* Exhaust smoke — staggered puffs */}
      <g>
        {[0, 0.38, 0.76].map((d, i) => (
          <circle
            key={i}
            className="loader-smoke"
            style={{ animationDelay: `${d}s` }}
            cx="46"
            cy="104"
            r="5"
            fill="var(--color-faint)"
          />
        ))}
      </g>

      {/* Car (bobbing group) */}
      <g className="loader-car">
        {/* Body */}
        <path
          d="M50 108 L58 84 Q62 74 74 73 L112 71 Q122 71 130 79 L146 95 L164 99 Q172 101 172 109 L172 112 Q172 116 168 116 L54 116 Q50 116 50 112 Z"
          fill="var(--color-ink)"
        />
        {/* Cabin / windows */}
        <path
          d="M74 78 L110 76 Q118 76 124 82 L134 92 L86 92 Q80 92 80 86 Z"
          fill="var(--color-accent)"
          opacity="0.9"
        />
        <line x1="104" y1="77" x2="112" y2="92" stroke="var(--color-ink)" strokeWidth="2.5" />
        {/* Headlight */}
        <circle cx="168" cy="104" r="2.6" fill="#fff" opacity="0.9" />

        {/* Wheels */}
        <g>
          <circle cx="78" cy="116" r="15" fill="var(--color-ink)" />
          <circle cx="78" cy="116" r="15" fill="none" stroke="var(--color-line-strong)" strokeWidth="1" opacity="0.3" />
          <g className="loader-wheel">
            <circle cx="78" cy="116" r="6.5" fill="none" stroke="#fff" strokeWidth="2" opacity="0.85" />
            <line x1="78" y1="110" x2="78" y2="122" stroke="#fff" strokeWidth="2" opacity="0.85" />
            <line x1="72" y1="116" x2="84" y2="116" stroke="#fff" strokeWidth="2" opacity="0.85" />
          </g>
        </g>
        <g>
          <circle cx="146" cy="116" r="15" fill="var(--color-ink)" />
          <circle cx="146" cy="116" r="15" fill="none" stroke="var(--color-line-strong)" strokeWidth="1" opacity="0.3" />
          <g className="loader-wheel" style={{ animationDelay: '-0.1s' }}>
            <circle cx="146" cy="116" r="6.5" fill="none" stroke="#fff" strokeWidth="2" opacity="0.85" />
            <line x1="146" y1="110" x2="146" y2="122" stroke="#fff" strokeWidth="2" opacity="0.85" />
            <line x1="140" y1="116" x2="152" y2="116" stroke="#fff" strokeWidth="2" opacity="0.85" />
          </g>
        </g>
      </g>

      {/* Road */}
      <line
        className="loader-road"
        x1="8"
        y1="134"
        x2="192"
        y2="134"
        stroke="var(--color-line-strong)"
        strokeWidth="3"
        strokeLinecap="round"
      />
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
      <div className="mt-8">
        <CarLoader />
      </div>
      {/* Indeterminate progress bar */}
      <div className="mt-6 h-1 w-40 overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full w-1/3 rounded-full bg-accent"
          style={{ animation: 'loader-bar 1.1s var(--ease-out-expo) infinite' }}
        />
      </div>
      <p className="mt-4 text-[13px] text-muted">Warming up the engine…</p>
    </div>
  );
}
