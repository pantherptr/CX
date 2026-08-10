import { useRef, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { SectionHead } from '../primitives';
import { Reveal, useInView, useMediaQuery } from '../motion';

/**
 * "One platform. Every part of the journey."
 *
 * A radial map of what Velora actually does, drawn as one system rather
 * than a feature list. The SVG carries only the connections; the core and
 * the nodes are real DOM so the type stays crisp and the hit targets stay
 * large. Both share the same 880×520 coordinate space — the SVG through
 * its viewBox, the nodes through percentages — so they always line up.
 */

interface Capability {
  key: string;
  label: string;
  icon: IconName;
  desc: string;
}

const capabilities: Capability[] = [
  {
    key: 'search',
    label: 'Search',
    icon: 'search',
    desc: 'Filter the fleet by city, category, price, transmission and the features that actually matter to your trip.',
  },
  {
    key: 'match',
    label: 'Match',
    icon: 'compass',
    desc: 'Sorting weighs rating, distance and price together, so the cars worth your attention surface first.',
  },
  {
    key: 'verify',
    label: 'Verify',
    icon: 'verified',
    desc: 'Every vehicle is documented and confirmed, and every host identity-checked, before a listing goes live.',
  },
  {
    key: 'book',
    label: 'Book',
    icon: 'calendar',
    desc: 'Reserve instantly or send a request. Dates, extras and the full price are settled before you confirm.',
  },
  {
    key: 'protect',
    label: 'Protect',
    icon: 'shield',
    desc: 'Cover, deposit and free cancellation up to 24 hours before pick-up are part of the booking, not an upsell.',
  },
  {
    key: 'host',
    label: 'Host',
    icon: 'chart',
    desc: 'Listings, availability, reservations and payouts run from a single dashboard built for owners.',
  },
  {
    key: 'support',
    label: 'Support',
    icon: 'headset',
    desc: 'Message your host directly inside the trip, with real people on hand around the clock behind them.',
  },
];

/* Shared geometry — the map is authored once, in one coordinate space. */
const W = 880;
const H = 520;
const CX = W / 2;
const CY = H / 2;
const RX = 332;
const RY = 196;

const nodePoint = (i: number) => {
  const angle = (-90 + (360 / capabilities.length) * i) * (Math.PI / 180);
  return { x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) };
};

/* ----------------------------- The core ----------------------------- */

function Core({ active, compact = false }: { active: Capability | null; compact?: boolean }) {
  return (
    <div
      className={`relative grid place-items-center transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        active ? 'scale-[1.04]' : 'scale-100'
      } ${compact ? 'h-[168px] w-[168px]' : 'h-[236px] w-[236px]'}`}
    >
      {/* Bloom */}
      <span
        className={`pointer-events-none absolute inset-[-38%] glow-accent transition-opacity duration-700 ${
          active ? 'opacity-100' : 'opacity-65'
        }`}
      />

      {/* Drifting rings */}
      <span className="animate-ring pointer-events-none absolute inset-0 rounded-full border border-dashed border-accent/25" />
      <span className="animate-ring-rev pointer-events-none absolute inset-[12%] rounded-full border border-line-strong/70" />

      {/* Orbiting particles */}
      {!compact &&
        [0, 1, 2].map((i) => (
          <span
            key={i}
            className="animate-orbit pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-accent/70"
            style={{
              ['--r' as string]: '112px',
              animationDelay: `${i * -6}s`,
              animationDuration: `${18 + i * 5}s`,
            }}
          />
        ))}

      {/* Disc */}
      <span className="animate-core absolute inset-[20%] rounded-full bg-surface shadow-lift ring-1 ring-line" />

      <span className="relative flex flex-col items-center text-center">
        <span
          className={`grid place-items-center rounded-2xl bg-ink text-white transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            compact ? 'h-9 w-9' : 'h-11 w-11'
          } ${active ? '-rotate-6' : ''}`}
        >
          <Icon
            name={active ? active.icon : 'sparkles'}
            size={compact ? 18 : 21}
            fill={!active}
          />
        </span>
        <span className={`mono mt-3 text-faint ${compact ? 'text-[10px]' : ''}`}>Velora</span>
        <span
          className={`font-display font-semibold leading-none text-ink ${
            compact ? 'text-base' : 'text-xl'
          }`}
        >
          {active ? active.label : 'Core'}
        </span>
      </span>
    </div>
  );
}

/* --------------------------- Desktop map ---------------------------- */

function RadialMap() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const seen = useInView(wrapRef, 0.15);
  const [active, setActive] = useState<number | null>(null);
  const current = active === null ? null : capabilities[active];

  return (
    <div ref={wrapRef} className="relative mx-auto w-full max-w-5xl">
      <div className="relative aspect-[880/520] w-full">
        {/* Connections */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {capabilities.map((cap, i) => {
            const p = nodePoint(i);
            const on = active === i;
            return (
              <g key={cap.key}>
                <line
                  x1={CX}
                  y1={CY}
                  x2={p.x}
                  y2={p.y}
                  vectorEffect="non-scaling-stroke"
                  stroke="var(--color-line-strong)"
                  strokeWidth={1}
                  className="transition-opacity duration-500"
                  style={{
                    opacity: seen ? (active === null ? 0.9 : on ? 0 : 0.35) : 0,
                    transitionDelay: `${i * 60}ms`,
                  }}
                />
                {/* Live branch — only the hovered one animates. */}
                <line
                  x1={CX}
                  y1={CY}
                  x2={p.x}
                  y2={p.y}
                  vectorEffect="non-scaling-stroke"
                  stroke="var(--color-accent)"
                  strokeWidth={1.5}
                  className={on ? 'flow-line' : ''}
                  style={{
                    opacity: on ? 0.9 : 0,
                    transition: 'opacity 0.45s ease',
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* Core */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Core active={current} />
        </div>

        {/* Nodes */}
        {capabilities.map((cap, i) => {
          const p = nodePoint(i);
          const on = active === i;
          const dimmed = active !== null && !on;
          return (
            <button
              key={cap.key}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive((v) => (v === i ? null : v))}
              onFocus={() => setActive(i)}
              onBlur={() => setActive((v) => (v === i ? null : v))}
              aria-label={`${cap.label} — ${cap.desc}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(p.x / W) * 100}%`,
                top: `${(p.y / H) * 100}%`,
                opacity: seen ? 1 : 0,
                transform: `translate(-50%, -50%) scale(${seen ? 1 : 0.86})`,
                transition:
                  'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)',
                transitionDelay: `${120 + i * 70}ms`,
              }}
            >
              <span
                className={`flex items-center gap-2.5 rounded-full border bg-surface py-2 pl-2 pr-4 transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  on
                    ? 'border-accent/40 shadow-pop'
                    : 'border-line shadow-soft hover:border-line-strong'
                }`}
                style={{
                  opacity: dimmed ? 0.5 : 1,
                  transform: on ? 'scale(1.06)' : 'scale(1)',
                  boxShadow: on
                    ? '0 4px 12px rgba(22,22,26,0.08), 0 20px 44px -20px rgba(11,122,91,0.5)'
                    : undefined,
                }}
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full transition-colors duration-300 ${
                    on ? 'bg-accent text-white' : 'bg-accent-050 text-accent'
                  }`}
                >
                  <Icon name={cap.icon} size={16} />
                </span>
                <span className="mono text-ink-soft">{cap.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Description slot — fixed height so nothing below ever shifts. */}
      <div className="relative mx-auto mt-2 h-[76px] max-w-xl text-center">
        {capabilities.map((cap, i) => (
          <p
            key={cap.key}
            className="absolute inset-x-0 top-0 text-[15px] leading-relaxed text-muted text-pretty transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              opacity: active === i ? 1 : 0,
              transform: active === i ? 'none' : 'translateY(6px)',
            }}
          >
            {cap.desc}
          </p>
        ))}
        <p
          className="absolute inset-x-0 top-0 text-[15px] leading-relaxed text-faint transition-all duration-500"
          style={{ opacity: active === null ? 1 : 0 }}
        >
          Hover a capability to trace it back to the core.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------- Mobile map ---------------------------- */

function VerticalMap() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const seen = useInView(wrapRef, 0.05);

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex justify-center">
        <Core active={null} compact />
      </div>

      <div className="relative mt-2 pl-11">
        {/* Spine descending from the core */}
        <span
          className="absolute left-[19px] top-0 w-px bg-line-strong transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ height: seen ? '100%' : '0%' }}
        />
        <ul className="space-y-3">
          {capabilities.map((cap, i) => (
            <li
              key={cap.key}
              className="relative"
              style={{
                opacity: seen ? 1 : 0,
                transform: seen ? 'none' : 'translateY(14px)',
                transition:
                  'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)',
                transitionDelay: `${i * 80}ms`,
              }}
            >
              {/* Connector into the spine */}
              <span className="absolute -left-[22px] top-[30px] h-px w-[22px] bg-line-strong" />
              <span className="absolute -left-[25px] top-[27px] h-1.5 w-1.5 rounded-full bg-accent" />

              <div className="card p-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
                    <Icon name={cap.icon} size={16} />
                  </span>
                  <span className="mono text-ink-soft">{cap.label}</span>
                </div>
                <p className="mt-2.5 text-[14px] leading-relaxed text-muted text-pretty">
                  {cap.desc}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------------------------- Section ------------------------------- */

export function IntelligenceMap() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return (
    <section className="relative mt-28 overflow-hidden py-4">
      {/* Section texture */}
      <div className="fine-grid mask-fade pointer-events-none absolute inset-0 -z-10 opacity-70" />

      <div className="container-page">
        <SectionHead
          center
          eyebrow="Velora Intelligence"
          title="One platform. Every part of the journey."
          desc="Search, trust, booking, protection, hosting and support aren't separate products bolted together — they're one system, and each part knows what the others are doing."
        />

        <Reveal>
          <div className="mt-12 lg:mt-6">{isDesktop ? <RadialMap /> : <VerticalMap />}</div>
        </Reveal>
      </div>
    </section>
  );
}
