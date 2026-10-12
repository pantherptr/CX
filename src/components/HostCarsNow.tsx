import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Img } from './motion';
import { useLocale } from '../lib/i18n';
import { uiLocale } from '../lib/i18n/uiLocale';

export interface HostCarNow {
  id: string;
  title: string;
  image: string;
  city: string;
}
export interface HostTripNow {
  carId: string;
  phase: 'active' | 'upcoming';
  startDate: string;
  endDate: string;
  renter: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });

/** "Your cars right now": one plain row per published car — on the road, booked, or free — built only
 *  from the host's real bookings. No map, no simulated movement, no sample people. */
export function HostCarsNow({ cars, trips }: { cars: HostCarNow[]; trips: HostTripNow[] }) {
  const { t } = useLocale();
  const rows = cars.map((car) => {
    const mine = trips.filter((x) => x.carId === car.id);
    const active = mine.find((x) => x.phase === 'active');
    const next = mine.filter((x) => x.phase === 'upcoming').sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    if (active) {
      return { car, kind: 'road' as const, line: t('{name} · back {date}', { name: active.renter, date: day(active.endDate) }) };
    }
    if (next) {
      return { car, kind: 'booked' as const, line: t('{name} · from {date}', { name: next.renter, date: day(next.startDate) }) };
    }
    return { car, kind: 'free' as const, line: car.city };
  });
  const onRoad = rows.filter((r) => r.kind === 'road').length;
  const booked = rows.filter((r) => r.kind === 'booked').length;
  const free = rows.length - onRoad - booked;

  const PILL: Record<'road' | 'booked' | 'free', { label: string; dot: string; text: string }> = {
    road: { label: t('On the road'), dot: 'bg-accent', text: 'text-accent-700' },
    booked: { label: t('Booked'), dot: 'bg-star', text: 'text-ink-soft' },
    free: { label: t('Available'), dot: 'bg-faint', text: 'text-muted' },
  };

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-lg font-semibold text-ink">{t('Your cars right now')}</h2>
        <p className="text-caption text-muted">
          {[onRoad > 0 && t('{n} on the road', { n: onRoad }), booked > 0 && t('{n} booked', { n: booked }), free > 0 && t('{n} available', { n: free })]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="card divide-y divide-line overflow-hidden">
        {rows.map(({ car, kind, line }) => {
          const p = PILL[kind];
          return (
            <Link key={car.id} to={`/host/cars/${car.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-panel/40 sm:p-4">
              <Img src={car.image} alt="" className="h-12 w-16 shrink-0 rounded-lg bg-panel object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-detail font-semibold text-ink">{car.title}</p>
                <p className="truncate text-caption text-muted">{line}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 text-caption font-semibold ${p.text}`}>
                <span className={`h-2 w-2 rounded-full ${p.dot}`} />
                {p.label}
              </span>
              <Icon name="chevronRight" size={16} className="hidden shrink-0 text-faint sm:block" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
