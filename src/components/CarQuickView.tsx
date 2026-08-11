import { Link } from 'react-router-dom';
import type { Car } from '../data/types';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { Icon, type IconName } from './Icon';
import { Modal } from './primitives';

/** A fast glance at a car without leaving the grid — full detail page is one tap away. */
export function CarQuickView({
  car,
  open,
  onClose,
}: {
  car: Car | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!car) return null;

  const specs: { icon: IconName; v: string }[] = [
    { icon: 'seat', v: `${car.seats} seats` },
    { icon: 'gear', v: car.transmission },
    { icon: 'gas', v: car.fuel },
    { icon: 'compass', v: car.drive },
  ];

  return (
    <Modal open={open} onClose={onClose} className="max-w-lg overflow-hidden rounded-[1.75rem]" labelledBy="quick-view-title">
      <div className="relative aspect-[16/10]">
        <img src={unsplash(car.images[0], 900)} alt={`${car.make} ${car.model}`} className="h-full w-full object-cover" />
        <button
          onClick={onClose}
          className="glass absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-ink shadow-hair"
          aria-label="Close quick view"
        >
          <Icon name="x" size={18} />
        </button>
        {car.instantBook && (
          <span className="badge badge-glass absolute left-3 top-3">
            <Icon name="instant" size={12} className="text-accent" /> Instant book
          </span>
        )}
      </div>

      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="quick-view-title" className="font-display text-xl font-semibold text-ink">
              {car.year} {car.make} {car.model}
            </h2>
            <p className="mt-0.5 flex items-center gap-1 text-[13.5px] text-muted">
              <Icon name="pin" size={13} /> {car.location}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-ink">
            <Icon name="star" size={14} className="text-star" /> {car.rating.toFixed(2)}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {specs.map((s) => (
            <span key={s.v} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-[12.5px] font-medium text-ink-soft">
              <Icon name={s.icon} size={14} className="text-muted" /> {s.v}
            </span>
          ))}
        </div>

        <p className="mt-4 line-clamp-2 text-[14px] leading-relaxed text-muted text-pretty">{car.description}</p>

        <div className="mt-5 flex items-center justify-between border-t border-line pt-5">
          <p className="text-ink">
            <span className="text-xl font-semibold">{eur(car.pricePerDay)}</span>
            <span className="text-[13px] text-muted"> / day</span>
          </p>
          <Link to={`/cars/${car.slug}`} onClick={onClose} className="btn btn-primary">
            View full details <Icon name="arrowRight" size={16} />
          </Link>
        </div>
      </div>
    </Modal>
  );
}
