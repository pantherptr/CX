import { useRef } from 'react';
import { Icon, type IconName } from '../Icon';
import { SectionHead } from '../primitives';
import { useScrollProgress } from '../motion';

/**
 * "From idea to execution."
 *
 * Three stages of one continuous process, told by scroll position rather
 * than by three cards appearing. A single rail runs through all three and
 * fills as the section moves up the viewport; each stage lifts as the fill
 * reaches it. The rail is the point — the stages are moments on it.
 */

interface Stage {
  n: string;
  name: string;
  line: string;
  desc: string;
  icon: IconName;
  signals: string[];
}

const stages: Stage[] = [
  {
    n: '01',
    name: 'Think',
    line: 'Velora understands what you need.',
    desc: 'A city, a set of dates, a kind of driving. The search takes the shape of the trip before it ever shows you a car.',
    icon: 'compass',
    signals: ['City', 'Dates', 'Category', 'Budget'],
  },
  {
    n: '02',
    name: 'Create',
    line: 'It turns that into a real shortlist.',
    desc: 'The fleet is filtered and ranked against what you asked for — rating, price, location and availability weighed together.',
    icon: 'sparkles',
    signals: ['Filter', 'Rank', 'Compare'],
  },
  {
    n: '03',
    name: 'Execute',
    line: 'And the choice becomes a trip.',
    desc: 'Dates locked, protection applied, payment settled and the host in your messages — confirmed before you close the tab.',
    icon: 'key',
    signals: ['Confirm', 'Protect', 'Hand over'],
  },
];

/** Fill percentage of the rail, eased across the section's scroll span. */
const railFill = (p: number) => Math.min(1, Math.max(0, (p - 0.12) / 0.62));

/** A stage is live once the fill has reached its position on the rail. */
const stageLive = (p: number, i: number) => railFill(p) >= 0.12 + i * 0.3;

export function Pipeline() {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(ref);
  const fill = railFill(progress);

  return (
    <section className="container-page mt-28">
      <SectionHead
        eyebrow="How it thinks"
        title="From idea to execution."
        desc="Not three features in a row — three moments in a single process that starts the second you describe where you're going."
      />

      <div ref={ref} className="relative mt-14">
        {/* ---------- Rail ---------- */}
        {/* Desktop: horizontal, threaded through the three markers. */}
        <div className="pointer-events-none absolute inset-x-0 top-[13px] hidden md:block">
          <div className="relative mx-[16.666%] h-px bg-line-strong">
            <div
              className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${fill * 100}%` }}
            />
            {/* Leading edge glow */}
            <div
              className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent transition-[left,opacity] duration-300 ease-out"
              style={{
                left: `${fill * 100}%`,
                opacity: fill > 0.01 && fill < 0.995 ? 1 : 0,
                boxShadow: '0 0 0 4px rgba(11,122,91,0.16)',
              }}
            />
          </div>
        </div>

        {/* Mobile: vertical spine down the left. */}
        <div className="pointer-events-none absolute bottom-10 left-[13px] top-10 w-px bg-line-strong md:hidden">
          <div
            className="absolute inset-x-0 top-0 bg-accent transition-[height] duration-300 ease-out"
            style={{ height: `${fill * 100}%` }}
          />
        </div>

        {/* ---------- Stages ---------- */}
        <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
          {stages.map((s, i) => {
            const live = stageLive(progress, i);
            return (
              <li
                key={s.n}
                className="relative pl-11 md:pl-0"
                style={{
                  opacity: live ? 1 : 0.42,
                  transform: live ? 'none' : 'translateY(10px)',
                  transition:
                    'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)',
                }}
              >
                {/* Marker */}
                <span
                  className={`absolute left-0 top-[18px] grid h-[27px] w-[27px] place-items-center rounded-full border bg-bg transition-all duration-500 md:relative md:left-auto md:top-auto md:mx-auto md:mb-7 ${
                    live ? 'border-accent' : 'border-line-strong'
                  }`}
                  style={{
                    boxShadow: live ? '0 0 0 5px rgba(11,122,91,0.10)' : 'none',
                  }}
                >
                  <span
                    className={`h-2 w-2 rounded-full transition-colors duration-500 ${
                      live ? 'bg-accent' : 'bg-line-strong'
                    }`}
                  />
                </span>

                <div className="md:text-center">
                  <div className="flex items-center gap-3 md:justify-center">
                    <span className="mono tabular-nums text-faint">{s.n}</span>
                    <span className="h-px w-6 bg-line-strong md:hidden" />
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-lg transition-colors duration-500 ${
                        live ? 'bg-ink text-white' : 'bg-panel-2 text-faint'
                      }`}
                    >
                      <Icon name={s.icon} size={16} />
                    </span>
                  </div>

                  <h3 className="mt-4 font-display text-2xl font-semibold text-ink">{s.name}</h3>
                  <p className="mt-1.5 text-[15px] font-medium text-ink-soft text-balance">
                    {s.line}
                  </p>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted text-pretty">
                    {s.desc}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-1.5 md:justify-center">
                    {s.signals.map((sig, j) => (
                      <span
                        key={sig}
                        className={`mono rounded-md border px-2 py-1 transition-all duration-500 ${
                          live
                            ? 'border-line-strong bg-surface text-ink-soft'
                            : 'border-line bg-panel text-faint'
                        }`}
                        style={{ transitionDelay: live ? `${j * 70}ms` : '0ms' }}
                      >
                        {sig}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
