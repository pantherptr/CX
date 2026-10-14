import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SwipeDeck } from './SwipeDeck';
import { Icon } from './Icon';
import { Img } from './motion';
import { useApp } from '../lib/store';
import { useCars } from '../lib/data/cars';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { useLocale } from '../lib/i18n';

/**
 * "Find your car by swiping": the fleet as a deck of cards. Swipe right (or press Save) to keep a car in
 * your saved list, left to skip; Undo brings the last one back. Works with a finger, a mouse and the arrow
 * keys. Signed-out visitors get the usual "sign in to save cars" prompt on a save.
 */
export function FindCarDeck() {
  const { t } = useLocale();
  const { cars } = useCars();
  const { toggleFavorite, isFavorite } = useApp();

  const deck = useMemo(() => (cars ?? []).filter((c) => c.images[0]).slice(0, 8), [cars]);
  if (deck.length === 0) return null;

  return (
    <SwipeDeck
      items={deck}
      itemKey={(c) => c.id}
      itemLabel={(c) => `${c.make} ${c.model}`}
      label={t('Swipe to find your car')}
      leftLabel={t('Skip')}
      rightLabel={t('Save')}
      undoLabel={t('Undo')}
      emptyLabel={t('You have seen them all. Your saved cars are in your account.')}
      remainingText={(n) => t('{n} left', { n })}
      positionText={(item, i, n) => t('{car}. Card {i} of {n}.', { car: item, i: i + 1, n })}
      hint={t('Left and right arrow keys decide the top card. Backspace brings the last one back.')}
      height={330}
      onDecide={(car, choice) => {
        if (choice === 'right' && !isFavorite(car.id)) toggleFavorite(car.id);
      }}
      onUndo={(car) => {
        if (isFavorite(car.id)) toggleFavorite(car.id);
      }}
    >
      {(car) => (
        <div className="flex h-full flex-col">
          <div className="relative min-h-0 flex-1 bg-panel">
            <Img src={unsplash(car.images[0], 900)} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />
            <span className="absolute bottom-3 left-3 rounded-full bg-white/92 px-3 py-1.5 text-detail font-semibold text-ink shadow-hair backdrop-blur">
              {eur(car.pricePerDay)}
              <span className="font-normal text-muted"> / {t('day')}</span>
            </span>
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
  );
}
