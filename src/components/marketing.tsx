import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Reveal } from './motion';

/** Shared building blocks for the public marketing pages (About, How it
 *  works, Garage/List-your-car teasers, Home's storytelling sections), so
 *  they read as one system instead of five separately styled pages. */

export function PageHero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-panel/60">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(60% 80% at 85% 0%, rgba(0,212,71,0.10), transparent 65%)' }}
      />
      <div className="container-page relative py-14 text-center sm:py-20">
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mx-auto mt-3 max-w-3xl font-display text-4xl font-semibold leading-[1.05] text-ink text-balance sm:text-6xl">
            {title}
          </h1>
          {lead && (
            <p className="mx-auto mt-5 max-w-xl text-copy leading-relaxed text-muted text-pretty sm:text-lead">{lead}</p>
          )}
          {children && <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>}
        </Reveal>
      </div>
    </section>
  );
}

export interface Feature {
  icon: IconName;
  title: string;
  desc: string;
}

export function FeatureGrid({ items, cols = 3 }: { items: Feature[]; cols?: 2 | 3 | 4 }) {
  const colClass = cols === 4 ? 'lg:grid-cols-4' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';
  return (
    <div className={`grid gap-3 sm:gap-5 ${colClass}`}>
      {items.map((f, i) => (
        <Reveal key={f.title} delay={i * 70}>
          <div className="flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-col sm:gap-0 sm:p-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-050 text-accent-700">
              <Icon name={f.icon} size={21} />
            </span>
            <div className="sm:mt-5">
              <h3 className="font-display text-lg font-semibold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-detail leading-relaxed text-muted">{f.desc}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

export function CtaBand({
  title,
  text,
  primary,
  secondary,
}: {
  title: string;
  text: string;
  primary: { to: string; label: string };
  secondary?: { to: string; label: string };
}) {
  return (
    <Reveal>
      <div className="relative overflow-hidden rounded-[1.75rem] border border-accent/15 bg-[#eaf7ef] px-6 py-12 text-center sm:px-12 sm:py-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{ background: 'radial-gradient(45% 75% at 50% 0%, rgba(0,212,71,0.16), transparent 65%)' }}
        />
        <div className="relative mx-auto max-w-xl">
          <h2 className="font-display text-3xl font-semibold text-ink text-balance sm:text-4xl">{title}</h2>
          <p className="mt-3 text-copy leading-relaxed text-ink-soft">{text}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to={primary.to} className="btn btn-accent-bright btn-lg">
              {primary.label} <Icon name="arrowRight" size={17} />
            </Link>
            {secondary && (
              <Link to={secondary.to} className="btn btn-secondary btn-lg">
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </Reveal>
  );
}
