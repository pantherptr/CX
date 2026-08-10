import { Link } from 'react-router-dom';
import type { Car } from '../data/types';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { useApp } from '../lib/store';
import { Icon } from './Icon';
import { Img } from './motion';

function FavButton({ carId }: { carId: string }) {
  const { isFavorite, toggleFavorite, toast } = useApp();
  const fav = isFavorite(carId);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        toggleFavorite(carId);
        toast({
          title: fav ? 'Removed from saved' : 'Saved to your list',
          icon: 'heart',
        });
      }}
      aria-label={fav ? 'Remove from saved' : 'Save car'}
      aria-pressed={fav}
      className="grid h-9 w-9 place-items-center rounded-full bg-white/90 backdrop-blur shadow-hair transition-all duration-200 hover:scale-110 active:scale-95"
    >
      <Icon
        name="heart"
        size={18}
        fill={fav}
        className={fav ? 'text-[#e2384d]' : 'text-ink'}
        strokeWidth={1.8}
      />
    </button>
  );
}

export function CarCard({
  car,
  layout = 'grid',
  priority,
}: {
  car: Car;
  layout?: 'grid' | 'horizontal';
  priority?: boolean;
}) {
  if (layout === 'horizontal') {
    return (
      <Link
        to={`/cars/${car.slug}`}
        className="card card-hover group flex overflow-hidden"
      >
        <div className="relative w-36 shrink-0 overflow-hidden sm:w-44">
          <img
            src={unsplash(car.images[0], 500)}
            alt={`${car.make} ${car.model}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate font-medium text-ink">
                {car.make} {car.model}
              </h3>
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-ink">
                <Icon name="star" size={13} className="text-star" />
                {car.rating.toFixed(2)}
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
              <Icon name="pin" size={12} /> {car.city}
            </p>
          </div>
          <p className="text-ink">
            <span className="font-semibold">{eur(car.pricePerDay)}</span>
            <span className="text-[13px] text-muted"> / day</span>
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/cars/${car.slug}`} className="group block">
      <article className="card card-hover overflow-hidden">
        <div className="relative aspect-[4/3] overflow-hidden bg-panel-2">
          <Img
            src={unsplash(car.images[0], 700)}
            alt={`${car.year} ${car.make} ${car.model}`}
            loading={priority ? 'eager' : 'lazy'}
            className="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
          />
          <div className="absolute left-3 top-3 flex gap-2">
            {car.instantBook && (
              <span className="badge badge-glass">
                <Icon name="instant" size={12} className="text-accent" /> Instant book
              </span>
            )}
          </div>
          <div className="absolute right-3 top-3">
            <FavButton carId={car.id} />
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-medium text-[15px] text-ink">
                {car.make} {car.model}
              </h3>
              <p className="mt-0.5 text-[13px] text-muted">
                {car.trim ? `${car.trim} · ` : ''}
                {car.year}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-ink">
              <Icon name="star" size={13} className="text-star" />
              {car.rating.toFixed(2)}
            </span>
          </div>

          <p className="mt-2.5 flex items-center gap-1 text-[13px] text-muted">
            <Icon name="pin" size={13} /> {car.location}
          </p>

          <div className="mt-3.5 flex items-end justify-between border-t border-line pt-3.5">
            <p className="text-[13px] text-muted">
              {car.trips} trips
            </p>
            <p className="text-ink">
              <span className="text-[17px] font-semibold">{eur(car.pricePerDay)}</span>
              <span className="text-[13px] text-muted"> / day</span>
            </p>
          </div>
        </div>
      </article>
    </Link>
  );
}
