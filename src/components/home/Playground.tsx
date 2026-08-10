import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';
import { SectionHead } from '../primitives';
import { Reveal, Img } from '../motion';
import { unsplash } from '../../lib/img';
import { cars } from '../../data/cars';

/**
 * "Experience Velora."
 *
 * A single interface, four tabs, each a small preview of a real flow
 * (search, compare, book, host) rather than a separate demo per tab. It's
 * explicitly a preview: interactions are local to the panel and the footer
 * says so, then hands off to the real page for the actual thing.
 */

type ModeKey = 'search' | 'compare' | 'book' | 'host';

const modes: { key: ModeKey; label: string; icon: IconName }[] = [
  { key: 'search', label: 'Search', icon: 'search' },
  { key: 'compare', label: 'Compare', icon: 'sliders' },
  { key: 'book', label: 'Book', icon: 'calendar' },
  { key: 'host', label: 'Host', icon: 'chart' },
];

const previewCars = cars.slice(0, 3);

function SearchPreview() {
  const [query, setQuery] = useState('Milan');
  const results = previewCars.filter((c) =>
    query.trim() ? c.city.toLowerCase().includes(query.toLowerCase()) || query.length < 2 : true,
  );
  return (
    <div>
      <div className="input flex items-center gap-2.5 py-2.5">
        <Icon name="search" size={16} className="text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by city…"
          className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
        />
      </div>
      <div className="mt-4 space-y-2">
        {(results.length ? results : previewCars).map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
            <Img
              src={unsplash(c.images[0], 120)}
              alt=""
              className="h-11 w-11 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-ink">
                {c.make} {c.model}
              </p>
              <p className="text-[12px] text-muted">{c.city}</p>
            </div>
            <p className="mono shrink-0 text-ink-soft">€{c.pricePerDay}/day</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparePreview() {
  const rows: [string, (c: (typeof cars)[number]) => string][] = [
    ['Price', (c) => `€${c.pricePerDay}/day`],
    ['Rating', (c) => c.rating.toFixed(2)],
    ['Seats', (c) => String(c.seats)],
    ['Fuel', (c) => c.fuel],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-0 text-left text-[13px]">
        <thead>
          <tr>
            <th className="pb-3 font-normal text-faint" />
            {previewCars.map((c) => (
              <th key={c.id} className="pb-3 pl-3 font-medium text-ink">
                {c.make} {c.model}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, get]) => (
            <tr key={label}>
              <td className="mono border-t border-line py-2.5 pr-3 text-faint">{label}</td>
              {previewCars.map((c) => (
                <td key={c.id} className="border-t border-line py-2.5 pl-3 text-ink-soft">
                  {get(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BookPreview() {
  const steps = ['Dates', 'Protection', 'Payment', 'Confirm'];
  const [step, setStep] = useState(0);
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(i)}
            className="group flex flex-1 flex-col items-start gap-1.5"
          >
            <span
              className={`h-1 w-full rounded-full transition-colors duration-300 ${
                i <= step ? 'bg-accent' : 'bg-panel-2'
              }`}
            />
            <span
              className={`mono transition-colors duration-300 ${
                i === step ? 'text-ink' : 'text-faint'
              }`}
            >
              {s}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-5 rounded-xl border border-line bg-surface p-4 text-[13.5px] leading-relaxed text-muted">
        {step === 0 && 'Pick a pick-up and drop-off date — availability updates instantly.'}
        {step === 1 && 'Add cover for peace of mind, or skip it and go with the included basics.'}
        {step === 2 && 'Pay securely inside Velora. Your card details never touch the host.'}
        {step === 3 && (
          <span className="flex items-center gap-2 text-ink-soft">
            <Icon name="checkCircle" size={16} className="text-accent" />
            That's the whole flow — four steps, no counter, no waiting.
          </span>
        )}
      </div>
    </div>
  );
}

function HostPreview() {
  const bars = [58, 71, 66, 84, 93, 100, 88];
  return (
    <div>
      <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-4">
        {bars.map((h, i) => (
          <div key={i} className="flex-1">
            <div
              className="rounded-t-sm bg-accent/80 transition-all duration-700 ease-out"
              style={{ height: `${h * 0.6}px` }}
            />
          </div>
        ))}
      </div>
      <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
        List a car, set your price and availability, and track bookings and payouts from one
        dashboard — the same one behind the{' '}
        <Link to="/host" className="link-quiet font-medium text-ink underline underline-offset-2">
          host dashboard
        </Link>
        .
      </p>
    </div>
  );
}

const panels: Record<ModeKey, () => ReactNode> = {
  search: SearchPreview,
  compare: ComparePreview,
  book: BookPreview,
  host: HostPreview,
};

const ctas: Record<ModeKey, { label: string; to: string }> = {
  search: { label: 'Open full search', to: '/browse' },
  compare: { label: 'Browse the fleet', to: '/browse' },
  book: { label: 'Start a real booking', to: '/browse' },
  host: { label: 'Open host dashboard', to: '/host' },
};

export function Playground() {
  const [mode, setMode] = useState<ModeKey>('search');
  const Panel = panels[mode];

  return (
    <section className="container-page mt-28">
      <SectionHead
        center
        eyebrow="Try it"
        title="Experience Velora."
        desc="A small, live preview of how search, comparison, booking and hosting actually work — switch tabs to see each one."
      />

      <Reveal>
        <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-[1.5rem] border border-line bg-panel shadow-lift">
          {/* Tabs */}
          <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line bg-surface p-1.5">
            {modes.map((m) => {
              const on = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[13.5px] font-medium transition-colors duration-200 ${
                    on ? 'bg-ink text-white' : 'text-ink-soft hover:bg-panel'
                  }`}
                >
                  <Icon name={m.icon} size={15} />
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div className="p-5 sm:p-7">
            <div key={mode} className="animate-fade-in">
              <Panel />
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3.5 sm:px-7">
            <span className="mono text-faint">Live preview · not the full experience</span>
            <Link to={ctas[mode].to} className="btn btn-secondary btn-sm">
              {ctas[mode].label} <Icon name="arrowRight" size={14} />
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
