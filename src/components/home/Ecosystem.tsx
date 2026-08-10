import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';
import { SectionHead } from '../primitives';
import { Reveal, useInView } from '../motion';
import { useApp } from '../../lib/store';

/**
 * "Everything connected."
 *
 * A 3×3 constellation with Velora in the middle cell. Because the cells
 * sit at known fractions of the grid, the connecting lines can be drawn in
 * a percentage viewBox and land exactly on each tile — no measurement, no
 * resize observer.
 *
 * Tiles that map to a real route navigate there. Tiles that don't are
 * marked `soon` and say so rather than pretending: no placeholder pages.
 */

interface Node {
  key: string;
  label: string;
  icon: IconName;
  desc: string;
  /** Existing route, or undefined when the surface isn't built yet. */
  to?: string;
  /** Grid position, 0-indexed, in the 3×3 constellation. */
  col: number;
  row: number;
}

const nodes: Node[] = [
  { key: 'browse', label: 'Browse', icon: 'search', desc: 'The whole fleet, filterable.', to: '/browse', col: 0, row: 0 },
  { key: 'trips', label: 'Trips', icon: 'trips', desc: 'Every booking, past and upcoming.', to: '/dashboard', col: 1, row: 0 },
  { key: 'messages', label: 'Messages', icon: 'message', desc: 'Talk to your host directly.', to: '/messages', col: 2, row: 0 },
  { key: 'protection', label: 'Protection', icon: 'shield', desc: 'Cover and deposits, in one view.', col: 0, row: 1 },
  { key: 'fleet', label: 'Fleet', icon: 'chart', desc: 'Earnings, bookings and cars you own.', to: '/host', col: 2, row: 1 },
  { key: 'listing', label: 'Hosting', icon: 'key', desc: 'List a car in a few steps.', to: '/list-your-car', col: 0, row: 2 },
  { key: 'keyless', label: 'Keyless', icon: 'bolt', desc: 'Unlock without meeting anyone.', col: 1, row: 2 },
  { key: 'account', label: 'Account', icon: 'settings', desc: 'Profile, payment and preferences.', to: '/settings', col: 2, row: 2 },
];

/* Cell centres as percentages of the 3×3 grid. */
const cx = (col: number) => col * (100 / 3) + 100 / 6;
const cy = (row: number) => row * (100 / 3) + 100 / 6;

/* Static placement classes — Tailwind needs the full class name in source,
   so the 3×3 positions are spelled out rather than interpolated. Below
   `sm` none of these apply and the tiles simply flow in two columns. */
const PLACE: Record<string, string> = {
  '0-0': 'sm:col-start-1 sm:row-start-1',
  '1-0': 'sm:col-start-2 sm:row-start-1',
  '2-0': 'sm:col-start-3 sm:row-start-1',
  '0-1': 'sm:col-start-1 sm:row-start-2',
  '2-1': 'sm:col-start-3 sm:row-start-2',
  '0-2': 'sm:col-start-1 sm:row-start-3',
  '1-2': 'sm:col-start-2 sm:row-start-3',
  '2-2': 'sm:col-start-3 sm:row-start-3',
};

export function Ecosystem() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const seen = useInView(wrapRef, 0.1);
  const [active, setActive] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useApp();

  const open = (node: Node) => {
    if (node.to) {
      navigate(node.to);
    } else {
      toast({
        title: `${node.label} — coming soon`,
        desc: 'A concept for a future release. It has no page yet.',
        icon: 'sparkles',
      });
    }
  };

  const tile = (node: Node) => {
    const on = active === node.key;
    const dimmed = active !== null && !on;
    return (
      <button
        key={node.key}
        type="button"
        onClick={() => open(node)}
        onMouseEnter={() => setActive(node.key)}
        onMouseLeave={() => setActive((v) => (v === node.key ? null : v))}
        onFocus={() => setActive(node.key)}
        onBlur={() => setActive((v) => (v === node.key ? null : v))}
        className={`group relative text-left ${PLACE[`${node.col}-${node.row}`]}`}
        style={{
          opacity: seen ? 1 : 0,
          transform: seen ? 'none' : 'translateY(12px)',
          transition:
            'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)',
          transitionDelay: `${(node.col + node.row) * 70}ms`,
        }}
      >
        <span
          className="card block h-full p-4 transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] sm:p-5"
          style={{
            opacity: dimmed ? 0.55 : 1,
            transform: on ? 'scale(1.025)' : 'scale(1)',
            borderColor: on ? 'rgba(11,122,91,0.35)' : undefined,
            boxShadow: on
              ? '0 4px 12px rgba(22,22,26,0.06), 0 22px 44px -24px rgba(11,122,91,0.45)'
              : undefined,
          }}
        >
          <span className="flex items-center justify-between gap-2">
            <span
              className={`grid h-9 w-9 place-items-center rounded-xl transition-colors duration-300 ${
                on ? 'bg-accent text-white' : 'bg-accent-050 text-accent'
              }`}
            >
              <Icon name={node.icon} size={17} />
            </span>
            {node.to ? (
              <span
                className={`text-faint transition-all duration-300 ${
                  on ? 'translate-x-0 text-accent opacity-100' : '-translate-x-1 opacity-0'
                }`}
              >
                <Icon name="arrowUpRight" size={16} />
              </span>
            ) : (
              <span className="mono rounded border border-dashed border-line-strong px-1.5 py-0.5 text-faint">
                Soon
              </span>
            )}
          </span>

          <span className="mt-3.5 block font-display text-[17px] font-semibold text-ink">
            {node.label}
          </span>
          <span className="mt-1 block text-[13.5px] leading-snug text-muted text-pretty">
            {node.desc}
          </span>
        </span>
      </button>
    );
  };

  return (
    <section className="relative mt-28 overflow-hidden">
      <div className="fine-grid mask-fade pointer-events-none absolute inset-0 -z-10 opacity-60" />

      <div className="container-page">
        <SectionHead
          center
          eyebrow="The ecosystem"
          title="Everything connected."
          desc="Renting, hosting, paying and talking to each other are not separate apps. They're one account, one history, one place."
        />

        <Reveal>
          <div ref={wrapRef} className="relative mx-auto mt-12 max-w-4xl">
            {/* Connections — desktop only, where the 3×3 geometry holds. */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block"
              aria-hidden="true"
            >
              {nodes.map((n) => {
                const on = active === n.key;
                return (
                  <g key={n.key}>
                    <line
                      x1={50}
                      y1={50}
                      x2={cx(n.col)}
                      y2={cy(n.row)}
                      vectorEffect="non-scaling-stroke"
                      stroke="var(--color-line-strong)"
                      strokeWidth={1}
                      style={{
                        opacity: seen ? (active === null ? 0.8 : on ? 0 : 0.3) : 0,
                        transition: 'opacity 0.5s ease',
                      }}
                    />
                    <line
                      x1={50}
                      y1={50}
                      x2={cx(n.col)}
                      y2={cy(n.row)}
                      vectorEffect="non-scaling-stroke"
                      stroke="var(--color-accent)"
                      strokeWidth={1.5}
                      className={on ? 'flow-line' : ''}
                      style={{ opacity: on ? 0.85 : 0, transition: 'opacity 0.4s ease' }}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Constellation — two columns on phones, a true 3×3 from `sm`,
                where the centre cell belongs to Velora itself. */}
            <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 sm:grid-rows-3 sm:gap-4">
              <div className="order-first col-span-2 sm:order-none sm:col-span-1 sm:col-start-2 sm:row-start-2">
                <div className="relative grid h-full min-h-[136px] place-items-center overflow-hidden rounded-[1.25rem] border border-line bg-ink p-5 text-center text-white">
                  <CentreMark />
                </div>
              </div>

              {nodes.map(tile)}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CentreMark() {
  return (
    <>
      <span className="glow-accent pointer-events-none absolute inset-[-30%] opacity-70" />
      <span className="animate-ring pointer-events-none absolute inset-3 rounded-full border border-dashed border-white/15" />
      <span className="relative flex flex-col items-center">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 backdrop-blur">
          <Icon name="sparkles" size={19} fill />
        </span>
        <span
          className="mt-3 font-display text-lg font-semibold"
          style={{ letterSpacing: '0.06em' }}
        >
          VELORA
        </span>
        <span className="mono mt-1 text-white/45">One account</span>
      </span>
    </>
  );
}
