import { ComingBackNotice, useSlowLoading } from './ComingBackNotice';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { SwipeDeck } from './SwipeDeck';
import { Icon } from './Icon';
import { Img, vibrateTap } from './motion';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useCars } from '../lib/data/cars';
import { usePreferredCity } from '../lib/preferredCity';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { useLocale } from '../lib/i18n';

/**
 * "Find your car by swiping": the fleet as a deck of cards. Swipe right (or press Save) to keep a car in
 * your saved list — a big heart pulses over the deck — left to skip; Undo brings the last one back. Cars from
 * the city you chose (`city`, or the one you picked last in the search) come first.
 */
/** A handful of cards on purpose: the rest of the garage is kept for the other side of the button. */
const DECK_SIZE = 6;

export function FindCarDeck({ city }: { city?: string | null }) {
  const { t } = useLocale();
  const { session } = useAuth();
  const { cars } = useCars();
  const slowCars = useSlowLoading(cars === null);
  const { toggleFavorite, isFavorite } = useApp();
  const remembered = usePreferredCity();
  const reduced = useReducedMotion() === true;
  const [burst, setBurst] = useState(0);

  const wanted = (city ?? remembered ?? '').trim().toLowerCase();
  const deck = useMemo(() => {
    const withPhoto = (cars ?? []).filter((c) => c.images[0]);
    if (!wanted) return withPhoto.slice(0, DECK_SIZE);
    const near = withPhoto.filter((c) => c.city.toLowerCase() === wanted);
    const rest = withPhoto.filter((c) => c.city.toLowerCase() !== wanted);
    return [...near, ...rest].slice(0, DECK_SIZE);
  }, [cars, wanted]);
  // the cars are still coming: keep the deck's place so what is below does not jump down when they arrive
  if (cars === null && slowCars) return <div className="mx-4"><ComingBackNotice /></div>;
  if (cars === null) return <div aria-hidden="true" style={{ height: 368 }}><div className="skeleton mx-4 h-[330px] rounded-[28px]" /></div>;
  if (deck.length === 0) return null;
  const extra = Math.max(0, (cars ?? []).filter((c) => c.images[0]).length - deck.length);
  const teaserTitle = extra > 0 ? t('{n} more cars are waiting inside', { n: extra }) : t('The best ones are waiting inside');

  return (
    <div className="relative">
      <SwipeDeck
        items={deck}
        itemKey={(c) => c.id}
        itemLabel={(c) => `${c.make} ${c.model}`}
        label={t('Swipe to find your car')}
        leftLabel={t('Skip')}
        rightLabel={t('Save')}
        undoLabel={t('Undo')}
        emptyLabel={teaserTitle}
        emptyContent={
          <div className="flex flex-col items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-white shadow-[0_12px_24px_-10px_rgba(0,170,60,0.8)]">
              <Icon name="key" size={22} />
            </span>
            <span className="font-display text-[1.375rem] font-semibold leading-tight text-ink text-balance">{teaserTitle}</span>
            <span className="max-w-[16rem] text-detail text-muted">{t('Open the garage to see what we kept for you.')}</span>
            <Link to="/browse" className="btn btn-accent-bright btn-lg mt-1">
              {t('Open the garage')} <Icon name="arrowRight" size={17} />
            </Link>
          </div>
        }
        remainingText={(n) => (n > 0 ? t('{n} left', { n }) : t('More inside'))}
        positionText={(item, i, n) => t('{car}. Card {i} of {n}.', { car: item, i: i + 1, n })}
        hint={t('Left and right arrow keys decide the top card. Backspace brings the last one back.')}
        height={330}
        onDecide={(car, choice) => {
          if (choice !== 'right') return;
          if (!isFavorite(car.id)) toggleFavorite(car.id, { undo: false });
          if (session) {
            setBurst((b) => b + 1);
            vibrateTap();
          }
        }}
        onUndo={(car) => {
          if (isFavorite(car.id)) toggleFavorite(car.id, { undo: false });
        }}
      >
        {(car) => (
          <div className="flex h-full flex-col">
            <div className="relative min-h-0 flex-1 bg-panel">
              <Img src={unsplash(car.images[0], 900)} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />
              <span className="absolute bottom-3 left-3 rounded-full bg-surface/90 px-3 py-1.5 text-detail font-semibold text-ink shadow-hair backdrop-blur">
                {eur(car.pricePerDay)}
                <span className="font-normal text-muted"> / {t('day')}</span>
              </span>
              {wanted && car.city.toLowerCase() === wanted && (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-label font-semibold uppercase tracking-[0.08em] text-white">
                  <Icon name="pin" size={11} /> {t('Near you')}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <span className="min-w-0">
                <span className="block truncate font-display text-copy font-semibold text-ink">
                  {car.make} {car.model}
                </span>
                <span className="block truncate text-detail text-muted">{car.city}</span>
              </span>
              <Link
                to={`/cars/${car.slug}`}
                className="hit-44 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-detail font-semibold text-white"
              >
                {t('View')} <Icon name="arrowRight" size={14} />
              </Link>
            </div>
          </div>
        )}
      </SwipeDeck>

      {/* the big heart that pulses over the deck when a car is saved */}
      <AnimatePresence>
        {burst > 0 && (
          <motion.span
            key={burst}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[140px] z-30 -ml-14 grid h-28 w-28 place-items-center"
            initial={{ opacity: 0, scale: reduced ? 1 : 0.4 }}
            animate={reduced ? { opacity: [0, 1, 0] } : { opacity: [0, 1, 1, 0], scale: [0.4, 1.28, 1, 1.12] }}
            transition={{ duration: reduced ? 0.7 : 0.95, ease: 'easeOut', times: reduced ? [0, 0.3, 1] : [0, 0.3, 0.6, 1] }}
            exit={{ opacity: 0 }}
          >
            <svg viewBox="0 0 24 24" width="112" height="112" style={{ filter: 'drop-shadow(0 10px 22px rgba(0,170,60,0.55))' }}>
              <path
                d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c2 0 3.6 1.1 4.4 2.6h2.4C14 6.1 15.6 5 17.6 5 21 5 23.1 8.4 21.6 11.8 19.5 16.4 12 21 12 21z"
                fill="#00d447"
                stroke="#ffffff"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
