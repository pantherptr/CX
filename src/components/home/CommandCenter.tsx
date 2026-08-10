import { useEffect, useRef, useState, type RefObject } from 'react';
import { Icon, type IconName } from '../Icon';
import { Reveal, useInView } from '../motion';
import { catalogue } from '../../lib/catalogue';

/**
 * "Velora Command Center."
 *
 * Two kinds of information, and nothing else:
 *
 *   1. Counts measured from the catalogue the app ships with
 *      (see `src/lib/catalogue.ts`) — real, and labelled as the demo
 *      catalogue so no one reads them as company metrics.
 *   2. Purely visual statuses — READY, ONLINE, SYNCED — which describe
 *      the interface, not business performance.
 *
 * No invented figures. The clock is the visitor's own device time.
 */

/**
 * Continuous visibility — unlike `useInView`, this flips back to false when
 * the panel leaves the viewport, so the clock and the city ticker stop
 * running the moment they're off screen. `seen` latches for entrance work.
 */
function useOnScreen(ref: RefObject<HTMLElement | null>) {
  const [state, setState] = useState({ visible: false, seen: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      ([entry]) =>
        setState((prev) => ({
          visible: entry.isIntersecting,
          seen: prev.seen || entry.isIntersecting,
        })),
      { threshold: 0.15 },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [ref]);

  return state;
}

const statuses: { label: string; state: string; icon: IconName }[] = [
  { label: 'Platform', state: 'Online', icon: 'globe' },
  { label: 'Catalogue', state: 'Synced', icon: 'cars' },
  { label: 'Booking engine', state: 'Ready', icon: 'calendar' },
  { label: 'Messaging', state: 'Online', icon: 'message' },
  { label: 'Protection', state: 'Active', icon: 'shield' },
];

function useClock(live: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [live]);
  return now;
}

/** Cycles through the catalogue's real cities, one at a time. */
function useCityTicker(live: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(
      () => setI((v) => (v + 1) % catalogue.cityNames.length),
      2600,
    );
    return () => window.clearInterval(id);
  }, [live]);
  return catalogue.cityNames[i];
}

function Meter({ label, value, total }: { label: string; value: number; total: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, 0.4);
  const pct = (value / total) * 100;

  return (
    <div ref={ref}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="mono text-faint">{label}</span>
        <span className="mono tabular-nums text-ink-soft">
          {value}/{total}
        </span>
      </div>
      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: seen ? `${pct}%` : '0%' }}
        />
      </div>
    </div>
  );
}

export function CommandCenter() {
  const ref = useRef<HTMLDivElement>(null);
  const { visible, seen } = useOnScreen(ref);
  const now = useClock(visible);
  const city = useCityTicker(visible);
  const live = seen;

  const figures = [
    { v: catalogue.vehicles, l: 'Vehicles' },
    { v: catalogue.cities, l: 'Cities' },
    { v: catalogue.categories, l: 'Categories' },
    { v: catalogue.hosts, l: 'Hosts' },
  ];

  return (
    <section className="container-page mt-28">
      <Reveal>
        <div
          ref={ref}
          className="relative overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-lift"
        >
          {/* Texture + scanning sweep */}
          <div className="fine-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="animate-scan absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-accent/[0.045] to-transparent" />
          </div>
          <div className="glow-accent pointer-events-none absolute -right-24 -top-24 h-72 w-72 opacity-70" />

          {/* ---------- Header ---------- */}
          <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <span
                className="font-display text-[15px] font-semibold text-ink"
                style={{ letterSpacing: '0.08em' }}
              >
                VELORA COMMAND CENTER
              </span>
            </div>
            <span className="mono tabular-nums text-faint">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <div className="relative grid gap-px bg-line lg:grid-cols-[1fr_1.05fr]">
            {/* ---------- Statuses ---------- */}
            <div className="bg-surface px-5 py-7 sm:px-8">
              <p className="mono text-faint">System status</p>
              <ul className="mt-5 space-y-px">
                {statuses.map((s, i) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0"
                    style={{
                      opacity: live ? 1 : 0,
                      transform: live ? 'none' : 'translateX(-8px)',
                      transition:
                        'opacity 0.5s cubic-bezier(0.16,1,0.3,1), transform 0.5s cubic-bezier(0.16,1,0.3,1)',
                      transitionDelay: `${i * 80}ms`,
                    }}
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-panel text-ink-soft">
                        <Icon name={s.icon} size={14} />
                      </span>
                      <span className="text-[14px] text-ink-soft">{s.label}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className="animate-blink h-1.5 w-1.5 rounded-full bg-accent"
                        style={{ animationDelay: `${i * 0.4}s` }}
                      />
                      <span className="mono text-accent">{s.state}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 space-y-4">
                <Meter
                  label="Instant book"
                  value={catalogue.instantBook}
                  total={catalogue.vehicles}
                />
                <Meter
                  label="Electric & hybrid"
                  value={catalogue.electrified}
                  total={catalogue.vehicles}
                />
              </div>
            </div>

            {/* ---------- Figures ---------- */}
            <div className="bg-surface px-5 py-7 sm:px-8">
              <p className="mono text-faint">Catalogue</p>

              <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
                {figures.map((f, i) => (
                  <div
                    key={f.l}
                    className="bg-surface px-4 py-5 text-center"
                    style={{
                      opacity: live ? 1 : 0,
                      transform: live ? 'none' : 'translateY(8px)',
                      transition:
                        'opacity 0.55s cubic-bezier(0.16,1,0.3,1), transform 0.55s cubic-bezier(0.16,1,0.3,1)',
                      transitionDelay: `${120 + i * 80}ms`,
                    }}
                  >
                    <p className="font-display text-3xl font-semibold tabular-nums text-ink">
                      {f.v}
                    </p>
                    <p className="mono mt-1.5 text-faint">{f.l}</p>
                  </div>
                ))}
              </div>

              <dl className="mt-5 space-y-px overflow-hidden rounded-2xl border border-line">
                <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
                  <dt className="mono text-faint">Daily rate range</dt>
                  <dd className="mono tabular-nums text-ink-soft">
                    €{catalogue.priceFrom} — €{catalogue.priceTo}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
                  <dt className="mono text-faint">Mean vehicle rating</dt>
                  <dd className="mono tabular-nums text-ink-soft">
                    {catalogue.meanRating.toFixed(2)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="mono text-faint">Coverage</dt>
                  <dd className="mono flex items-center gap-2 text-ink-soft">
                    <Icon name="pin" size={13} className="text-accent" />
                    <span key={city} className="animate-fade-in">
                      {city}
                    </span>
                  </dd>
                </div>
              </dl>

              {/* Terminal detail */}
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3">
                <span className="mono text-accent">velora</span>
                <span className="mono text-faint">status --all</span>
                <span className="animate-caret ml-auto h-3.5 w-[7px] bg-ink-soft" />
              </div>
            </div>
          </div>

          {/* ---------- Footnote ---------- */}
          <p className="relative border-t border-line px-5 py-3.5 text-[12px] text-faint sm:px-8">
            Figures above are counted directly from the catalogue this demo ships with — not
            company metrics. Statuses describe the interface state.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
