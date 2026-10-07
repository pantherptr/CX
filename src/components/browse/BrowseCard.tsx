import { forwardRef } from 'react';
import type { Car } from '../../data/types';
import { unsplash, unsplashSrcSet } from '../../lib/img';
import { eur } from '../../lib/format';
import { useApp } from '../../lib/store';
import { haptics } from '../../lib/native';
import { useLocale } from '../../lib/i18n';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { motion, SPRING_SMOOTH } from '../motionKit';

/** A car in the Browse grid: a quiet white card — where it is and how it is
 *  rated on top, the photo, then name, price and the three things that matter.
 *  Hover draws a black outline; the open car keeps it. */
export const BrowseCard = forwardRef<HTMLDivElement, { car: Car; active: boolean; priority: boolean; available?: boolean; variant?: 'grid' | 'row'; onOpen: () => void; onHover?: (id: string | null) => void }>(function BrowseCard(
  { car, active, priority, available, variant = 'grid', onOpen, onHover },
  ref,
) {
  const { t } = useLocale();
  const { isFavorite, toggleFavorite } = useApp();
  const fav = isFavorite(car.id);
  const rated = car.trips > 0 && car.rating > 0;

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={SPRING_SMOOTH}
      whileHover={{ y: -3 }}
      className={`group relative cursor-pointer rounded-[24px] border bg-surface p-3 transition-[border-color,box-shadow] duration-300 ${
        active ? 'border-ink shadow-[0_0_0_1px_#16161a,0_18px_40px_-18px_rgba(22,22,26,0.4)]' : 'border-line hover:border-ink/70 hover:shadow-[0_18px_40px_-22px_rgba(22,22,26,0.35)]'
      }`}
      onClick={onOpen}
      onMouseEnter={() => onHover?.(car.id)}
      onMouseLeave={() => onHover?.(null)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      aria-label={`${car.make} ${car.model}`}
    >
      {variant === 'row' ? (
        <div className="flex gap-3">
          <div className="relative w-[42%] shrink-0 overflow-hidden rounded-[16px] bg-panel">
            <div className="aspect-[4/3]">
              <Img
                src={unsplash(car.images[0], 520)}
                srcSet={unsplashSrcSet(car.images[0], [300, 520, 800])}
                sizes="220px"
                alt={`${car.year} ${car.make} ${car.model}`}
                loading={priority ? 'eager' : 'lazy'}
                className="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
                fallback={<span className="grid h-full w-full place-items-center bg-gradient-to-br from-panel to-panel-2 text-faint"><Icon name="car" size={28} /></span>}
              />
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); haptics.tick(); toggleFavorite(car.id); }}
              aria-label={fav ? t('Remove from saved') : t('Save car')}
              aria-pressed={fav}
              className="pressable absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-hair backdrop-blur transition-transform duration-200 hover:scale-110"
            >
              <Icon name="heart" size={15} fill={fav} className={fav ? 'text-[#e2384d]' : 'text-ink'} strokeWidth={1.8} />
            </button>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5 pr-1">
            <div>
              <div className="flex items-center gap-1.5 text-caption text-muted">
                <Icon name="pin" size={12} className="shrink-0" /> <span className="truncate">{car.city}</span>
                <span className="text-faint">·</span>
                {rated ? (<span className="inline-flex shrink-0 items-center gap-1"><Icon name="star" size={11} className="text-star" /> {car.rating.toFixed(1)}</span>) : (<span className="shrink-0">{t('New')}</span>)}
              </div>
              <h3 className="mt-1 truncate font-display text-copy font-semibold text-ink">{car.make} {car.model}</h3>
              <p className="truncate text-detail text-muted">{car.trim ? `${car.trim} · ` : ''}{car.year}</p>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <p className="flex min-w-0 items-center gap-2.5 text-caption text-muted">
                <span className="inline-flex items-center gap-1"><Icon name="seat" size={12} /> {car.seats}</span>
                <span className="inline-flex items-center gap-1"><Icon name="gear" size={12} /> {t(car.transmission)}</span>
                {car.instantBook && <Icon name="instant" size={12} className="text-accent" />}
              </p>
              <p className="shrink-0 text-ink"><span className="font-display text-lead font-semibold">{eur(car.pricePerDay)}</span><span className="text-detail text-muted"> {t('/ day')}</span></p>
            </div>
          </div>
        </div>
      ) : (
        <>
      <div className="flex items-center justify-between gap-2 px-1 pb-2.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-caption font-medium text-ink-soft">
          <Icon name="pin" size={12} className="shrink-0" /> <span className="truncate">{car.city}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-panel px-2.5 py-1 text-caption font-medium text-ink-soft">
          {rated ? (
            <>
              <Icon name="star" size={12} className="text-star" /> {car.rating.toFixed(1)} <span className="text-faint">({car.trips})</span>
            </>
          ) : (
            t('New')
          )}
        </span>
      </div>

      <div className="relative aspect-[4/3] overflow-hidden rounded-[18px] bg-panel">
        <Img
          src={unsplash(car.images[0], 700)}
          srcSet={unsplashSrcSet(car.images[0], [400, 700, 1000, 1400])}
          sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 33vw"
          alt={`${car.year} ${car.make} ${car.model}`}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          className="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
          fallback={<span className="grid h-full w-full place-items-center bg-gradient-to-br from-panel to-panel-2 text-faint"><Icon name="car" size={34} /></span>}
        />
        <button
          onClick={(e) => { e.stopPropagation(); haptics.tick(); toggleFavorite(car.id); }}
          aria-label={fav ? t('Remove from saved') : t('Save car')}
          aria-pressed={fav}
          className="pressable absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-hair backdrop-blur transition-transform duration-200 before:absolute before:-inset-1.5 before:content-[''] hover:scale-110"
        >
          <Icon name="heart" size={17} fill={fav} className={fav ? 'text-[#e2384d]' : 'text-ink'} strokeWidth={1.8} />
        </button>
        {car.instantBook && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-caption font-semibold text-ink shadow-hair backdrop-blur">
            <Icon name="instant" size={11} className="text-accent" /> {t('Instant book')}
          </span>
        )}
        {available && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-caption font-semibold text-white">
            <Icon name="check" size={11} /> {t('Available')}
          </span>
        )}
      </div>

      <div className="px-1 pb-0.5 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-copy font-semibold text-ink">
              {car.make} {car.model}
            </h3>
            <p className="mt-0.5 truncate text-detail text-muted">
              {car.trim ? `${car.trim} · ` : ''}
              {car.year}
            </p>
          </div>
          <p className="shrink-0 text-right text-ink">
            <span className="font-display text-lead font-semibold">{eur(car.pricePerDay)}</span>
            <span className="text-detail text-muted"> {t('/ day')}</span>
          </p>
        </div>
        <p className="mt-2.5 flex items-center gap-3 text-caption text-muted">
          <span className="inline-flex items-center gap-1"><Icon name="seat" size={13} /> {t('{n} seats', { n: car.seats })}</span>
          <span className="inline-flex items-center gap-1"><Icon name="gear" size={13} /> {t(car.transmission)}</span>
          <span className="inline-flex items-center gap-1"><Icon name="gas" size={13} /> {t(car.fuel)}</span>
        </p>
      </div>
        </>
      )}
    </motion.div>
  );
});
