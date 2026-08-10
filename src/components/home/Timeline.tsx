import { useRef } from 'react';
import { Icon, type IconName } from '../Icon';
import { SectionHead } from '../primitives';
import { useScrollProgress } from '../motion';

/**
 * "The evolution of Velora."
 *
 * Deliberately conceptual: no dates, no milestones, no numbers. It
 * describes how the product is put together and where it points, which is
 * knowable — not a company history, which isn't. The final marker is
 * explicitly labelled as direction rather than fact.
 */

interface Era {
  tag: string;
  title: string;
  desc: string;
  icon: IconName;
  future?: boolean;
}

const eras: Era[] = [
  {
    tag: 'Velora 01',
    title: 'The beginning',
    desc: 'A simple observation: the best cars in any city already exist — they are parked. The first idea was to open them up to the people standing next to them.',
    icon: 'key',
  },
  {
    tag: 'Velora 02',
    title: 'The build',
    desc: 'Trust had to be structural, not a badge. Documented vehicles, identity-checked owners and reviews tied to completed trips became the foundation everything else sits on.',
    icon: 'shield',
  },
  {
    tag: 'Velora now',
    title: 'The platform',
    desc: 'Search, booking, protection, payouts, messaging and hosting in one place — a marketplace that behaves like a single product rather than a directory.',
    icon: 'grid',
  },
  {
    tag: 'Velora next',
    title: 'The future',
    desc: 'The direction is fewer steps between wanting a car and driving it: quieter handovers, smarter matching, more of the trip handled before you arrive.',
    icon: 'sparkles',
    future: true,
  },
];

export function Timeline() {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(ref);
  const fill = Math.min(1, Math.max(0, (progress - 0.08) / 0.66));

  return (
    <section className="relative mt-28 overflow-hidden">
      <div className="dot-grid mask-fade pointer-events-none absolute inset-0 -z-10 opacity-50" />

      <div className="container-page">
        <SectionHead
          center
          eyebrow="Where this is going"
          title="The evolution of Velora."
          desc="How the platform was put together, and the direction it keeps moving in."
        />

        <div ref={ref} className="relative mx-auto mt-14 max-w-3xl">
          {/* Spine */}
          <div className="pointer-events-none absolute bottom-6 left-[15px] top-2 w-px bg-line-strong sm:left-1/2 sm:-translate-x-1/2">
            <div
              className="absolute inset-x-0 top-0 bg-gradient-to-b from-accent to-accent/70 transition-[height] duration-300 ease-out"
              style={{ height: `${fill * 100}%` }}
            />
            <div
              className="absolute h-1.5 w-1.5 -translate-x-[3px] rounded-full bg-accent transition-[top,opacity] duration-300 ease-out"
              style={{
                top: `${fill * 100}%`,
                opacity: fill > 0.01 && fill < 0.99 ? 1 : 0,
                boxShadow: '0 0 0 4px rgba(11,122,91,0.15)',
              }}
            />
          </div>

          <ol className="space-y-9 sm:space-y-14">
            {eras.map((era, i) => {
              const live = fill >= 0.04 + i * 0.235;
              const left = i % 2 === 0;
              return (
                <li
                  key={era.tag}
                  className={`relative pl-11 sm:w-1/2 sm:pl-0 ${
                    left ? 'sm:pr-12 sm:text-right' : 'sm:ml-auto sm:pl-12'
                  }`}
                  style={{
                    opacity: live ? 1 : 0.35,
                    transform: live ? 'none' : 'translateY(12px)',
                    transition:
                      'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)',
                  }}
                >
                  {/* Marker on the spine */}
                  <span
                    className={`absolute left-[8px] top-[7px] h-4 w-4 rounded-full border-2 bg-bg transition-all duration-500 sm:left-auto sm:top-[9px] ${
                      left ? 'sm:-right-[8px]' : 'sm:-left-[8px]'
                    } ${live ? 'border-accent' : 'border-line-strong'}`}
                    style={{ boxShadow: live ? '0 0 0 5px rgba(11,122,91,0.10)' : 'none' }}
                  >
                    {era.future && live && (
                      <span className="animate-blink absolute inset-[3px] rounded-full bg-accent" />
                    )}
                  </span>

                  <div
                    className={`flex items-center gap-2.5 ${left ? 'sm:justify-end' : ''}`}
                  >
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-lg transition-colors duration-500 ${
                        live
                          ? era.future
                            ? 'bg-accent-050 text-accent'
                            : 'bg-ink text-white'
                          : 'bg-panel-2 text-faint'
                      } ${left ? 'sm:order-2' : ''}`}
                    >
                      <Icon name={era.icon} size={15} />
                    </span>
                    <span className="mono text-faint">{era.tag}</span>
                  </div>

                  <h3
                    className={`mt-3 font-display text-xl font-semibold text-ink sm:text-2xl ${
                      era.future ? 'tracking-[0.01em]' : ''
                    }`}
                  >
                    {era.title}
                  </h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-muted text-pretty">
                    {era.desc}
                  </p>

                  {era.future && (
                    <span
                      className={`mono mt-4 inline-flex items-center gap-1.5 rounded-md border border-dashed border-accent/40 bg-accent-050 px-2 py-1 text-accent ${
                        left ? 'sm:ml-auto' : ''
                      }`}
                    >
                      Direction, not a roadmap
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
