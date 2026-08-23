import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useCompare } from '../lib/compareStore';
import { useCars } from '../lib/data/cars';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { Icon, type IconName } from '../components/Icon';
import { CarLoader } from '../components/CarLoader';
import type { Car } from '../data/types';

/**
 * Every value on this page reads straight from the real `Car` shape
 * (src/data/types.ts) — the same fields CarDetails already shows. No
 * horsepower/torque/0-60 row exists because that data isn't in the model;
 * inventing plausible-looking numbers for real listings would be exactly
 * the "never invent specifications" the platform explicitly rules out.
 */

type SpecRow = { label: string; icon: IconName; value: (c: Car) => string; best?: 'min' | 'max' };

const SPEC_ROWS: SpecRow[] = [
  { label: 'Price per day', icon: 'euro', value: (c) => eur(c.pricePerDay), best: 'min' },
  { label: 'Rating', icon: 'star', value: (c) => `${c.rating.toFixed(2)} (${c.reviews.length} reviews)`, best: 'max' },
  { label: 'Category', icon: 'grid', value: (c) => c.category },
  { label: 'Transmission', icon: 'gear', value: (c) => c.transmission },
  { label: 'Fuel', icon: 'gas', value: (c) => c.fuel },
  { label: 'Drive type', icon: 'compass', value: (c) => c.drive || '—' },
  { label: 'Seats', icon: 'seat', value: (c) => String(c.seats), best: 'max' },
  { label: 'Doors', icon: 'door', value: (c) => String(c.doors) },
  { label: 'Luggage', icon: 'bag', value: (c) => `${c.luggage} ${c.luggage === 1 ? 'bag' : 'bags'}`, best: 'max' },
  { label: 'Mileage', icon: 'gauge', value: (c) => c.mileage || '—' },
  { label: 'Location', icon: 'pin', value: (c) => c.location },
];

/** Raw numeric value behind a spec row's display string, so "best" can be
 *  computed without re-parsing formatted text — kept separate so a row's
 *  `value` formatter stays free to add units/labels for display. */
const rawFor: Partial<Record<string, (c: Car) => number>> = {
  'Price per day': (c) => c.pricePerDay,
  Rating: (c) => c.rating,
  Seats: (c) => c.seats,
  Luggage: (c) => c.luggage,
};

export default function Compare() {
  const { ids, removeFromCompare, clearCompare } = useCompare();
  const { cars, loading } = useCars();

  const selected = ids.map((id) => cars?.find((c) => c.id === id)).filter((c): c is Car => !!c);

  const bestId = (row: SpecRow): string | null => {
    if (!row.best) return null;
    const raw = rawFor[row.label];
    if (!raw) return null;
    const values = selected.map((c) => ({ id: c.id, v: raw(c) }));
    if (values.length < 2) return null;
    const target = row.best === 'min' ? Math.min(...values.map((v) => v.v)) : Math.max(...values.map((v) => v.v));
    const winners = values.filter((v) => v.v === target);
    return winners.length === 1 ? winners[0].id : null;
  };

  return (
    <div className="container-page py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">CX Compare</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">Compare cars</h1>
          <p className="mt-1.5 max-w-md text-[14.5px] text-muted">
            Side by side, so the right car is obvious — not a guess.
          </p>
        </div>
        {selected.length > 0 && (
          <button onClick={clearCompare} className="btn btn-secondary btn-sm">
            <Icon name="x" size={15} /> Clear all
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-16 flex flex-col items-center gap-3 py-16 text-center">
          <CarLoader size={80} />
        </div>
      ) : selected.length === 0 ? (
        <div className="card mt-8 flex flex-col items-center gap-3 px-6 py-20 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-muted">
            <Icon name="compare" size={26} />
          </span>
          <h2 className="mt-2 font-display text-xl font-semibold text-ink">Nothing to compare yet</h2>
          <p className="max-w-sm text-[14px] text-muted">
            Tap "Compare" on any car in Browse to add it here — you can compare up to 4 at once.
          </p>
          <Link to="/browse" className="btn btn-primary mt-2">Browse cars</Link>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <div
            className="grid min-w-[560px] gap-px overflow-hidden rounded-2xl border border-line bg-line"
            style={{ gridTemplateColumns: `180px repeat(${selected.length}, minmax(180px, 1fr))` }}
          >
            {/* Header row — car cards */}
            <div className="bg-surface" />
            {selected.map((car) => (
              <div key={car.id} className="relative bg-surface p-4">
                <button
                  onClick={() => removeFromCompare(car.id)}
                  aria-label="Remove from compare"
                  className="pressable absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-panel text-muted hover:text-ink"
                >
                  <Icon name="x" size={14} />
                </button>
                <Link to={`/cars/${car.slug}`} className="block">
                  <div className="aspect-[4/3] overflow-hidden rounded-xl bg-panel-2">
                    <img src={unsplash(car.images[0], 400)} alt={`${car.make} ${car.model}`} className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-3 truncate font-display text-[15px] font-semibold text-ink">
                    {car.make} {car.model}
                  </p>
                  <p className="text-[12.5px] text-muted">{car.trim ? `${car.trim} · ` : ''}{car.year}</p>
                </Link>
                <Link to={`/book/${car.slug}`} className="btn btn-accent-bright btn-sm btn-block mt-3">
                  Rent this car
                </Link>
              </div>
            ))}

            {/* Spec rows */}
            {SPEC_ROWS.map((row) => {
              const winner = bestId(row);
              return (
                <Fragment key={row.label}>
                  <div className="flex items-center gap-2 bg-panel/60 px-4 py-3.5 text-[13px] font-medium text-ink-soft">
                    <Icon name={row.icon} size={15} className="shrink-0 text-muted" /> {row.label}
                  </div>
                  {selected.map((car) => {
                    const isWinner = winner === car.id;
                    return (
                      <div
                        key={car.id}
                        className={`flex items-center gap-1.5 px-4 py-3.5 text-[13.5px] ${
                          isWinner ? 'bg-accent-050 font-semibold text-accent-700' : 'bg-surface text-ink'
                        }`}
                      >
                        {row.value(car)}
                        {isWinner && <Icon name="checkCircle" size={14} className="shrink-0 text-accent-bright" />}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}

            {/* Features row */}
            <div className="flex items-start gap-2 bg-panel/60 px-4 py-3.5 text-[13px] font-medium text-ink-soft">
              <Icon name="sparkles" size={15} className="mt-0.5 shrink-0 text-muted" /> Features
            </div>
            {selected.map((car) => (
              <div key={`features-${car.id}`} className="bg-surface px-4 py-3.5">
                <ul className="space-y-1.5">
                  {car.features.slice(0, 6).map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[12.5px] text-ink-soft">
                      <Icon name="check" size={13} className="mt-0.5 shrink-0 text-accent" /> {f}
                    </li>
                  ))}
                  {car.features.length === 0 && <li className="text-[12.5px] text-faint">—</li>}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
