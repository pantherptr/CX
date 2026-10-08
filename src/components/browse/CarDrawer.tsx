import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Car } from '../../data/types';
import { unsplash } from '../../lib/img';
import { eur } from '../../lib/format';
import { useApp } from '../../lib/store';
import { useLocale } from '../../lib/i18n';
import { Ugc } from '../../lib/i18n/ugc';
import { Icon, type IconName } from '../Icon';
import { Img } from '../motion';
import { motion, AnimatePresence, SPRING_SMOOTH, SPRING_SNAPPY, useReducedMotion } from '../motionKit';
import { MiniMap } from './MiniMap';
import { CarRoadbook } from '../CarRoadbook';

type Tab = 'rent' | 'info' | 'specs' | 'reviews' | 'roadbook';
const TABS: { id: Tab; label: string }[] = [
  { id: 'rent', label: 'Rent details' },
  { id: 'info', label: 'Vehicle info' },
  { id: 'specs', label: 'Specifications' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'roadbook', label: 'Roadbook' },
];
const DURATIONS = [
  { days: 1, label: 'Daily' },
  { days: 3, label: '3 days' },
  { days: 7, label: 'Weekly' },
];

/** The car side panel: opens beside the grid so the list never disappears. Photo
 *  and gallery, name and price, four tabs, a real map of where the car is, the
 *  cost for 1 / 3 / 7 days (day rate × days — extras and fees are added at
 *  checkout), and a black "Book now" bar. On phones it rises as a sheet. */
export function CarDrawer({ car, onClose }: { car: Car | null; onClose: () => void }) {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const { isFavorite, toggleFavorite } = useApp();
  const [tab, setTab] = useState<Tab>('rent');
  const [shot, setShot] = useState(0);
  const [days, setDays] = useState(1);

  useEffect(() => { setTab('rent'); setShot(0); setDays(1); }, [car?.id]);
  useEffect(() => {
    if (!car) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [car, onClose]);

  return (
    <AnimatePresence>
      {car && (
        <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={`${car.make} ${car.model}`}>
          <motion.div
            className="absolute inset-0 bg-ink/15 backdrop-blur-[3px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key={car.id}
            className="absolute inset-x-0 bottom-0 flex max-h-[94dvh] flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-[0_-20px_60px_-20px_rgba(22,22,26,0.35)] lg:inset-y-3 lg:left-auto lg:right-3 lg:max-h-none lg:w-[480px] lg:rounded-[28px] lg:shadow-[0_30px_80px_-24px_rgba(22,22,26,0.45)]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, x: 0, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.98 }}
            transition={SPRING_SMOOTH}
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {/* photo */}
              <div className="relative p-3 pb-0">
                <div className="relative aspect-[16/10] overflow-hidden rounded-[20px] bg-panel">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div key={shot} className="absolute inset-0" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                      <Img
                        src={unsplash(car.images[shot] ?? car.images[0], 1000)}
                        alt={`${car.make} ${car.model}`}
                        className="h-full w-full object-cover"
                        fallback={<span className="grid h-full w-full place-items-center text-faint"><Icon name="car" size={36} /></span>}
                      />
                    </motion.div>
                  </AnimatePresence>
                  <div className="absolute right-3 top-3 flex gap-2">
                    <button onClick={() => toggleFavorite(car.id)} aria-label={t('Save car')} aria-pressed={isFavorite(car.id)} className="pressable grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-hair backdrop-blur">
                      <Icon name="heart" size={17} fill={isFavorite(car.id)} className={isFavorite(car.id) ? 'text-[#e2384d]' : 'text-ink'} strokeWidth={1.8} />
                    </button>
                    <button onClick={onClose} aria-label={t('Close')} className="pressable grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-hair backdrop-blur">
                      <Icon name="x" size={17} />
                    </button>
                  </div>
                  {car.images.length > 1 && (
                    <div className="absolute inset-x-3 bottom-3 flex gap-1.5">
                      {car.images.slice(0, 5).map((im, i) => (
                        <button key={im} onClick={() => setShot(i)} aria-label={`Photo ${i + 1}`} className={`h-1.5 flex-1 rounded-full transition-colors ${i === shot ? 'bg-white' : 'bg-white/45'}`} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* title */}
              <div className="flex items-start justify-between gap-3 px-5 pt-4">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-xl font-semibold text-ink">{car.make} {car.model}</h2>
                  <p className="mt-0.5 truncate text-detail text-muted">{car.trim ? `${car.trim} · ` : ''}{car.year} · {car.city}</p>
                </div>
                <p className="shrink-0 text-right text-ink">
                  <span className="font-display text-xl font-semibold">{eur(car.pricePerDay)}</span>
                  <span className="text-detail text-muted"> {t('/ day')}</span>
                </p>
              </div>

              {/* tabs */}
              <div className="mt-4 flex gap-5 overflow-x-auto border-b border-line px-5" role="tablist">
                {TABS.map((tb) => (
                  <button
                    key={tb.id}
                    role="tab"
                    aria-selected={tab === tb.id}
                    onClick={() => setTab(tb.id)}
                    className={`relative shrink-0 pb-3 text-detail font-semibold transition-colors ${tab === tb.id ? 'text-ink' : 'text-muted hover:text-ink'}`}
                  >
                    {t(tb.label)}
                    {tab === tb.id && <motion.span layoutId="drawer-tab" className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink" transition={SPRING_SNAPPY} />}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab} className="px-5 pb-5 pt-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
                  {tab === 'rent' && (
                    <div>
                      <div className="relative overflow-hidden rounded-[20px] border border-line">
                        <MiniMap city={car.city} className="h-52" />
                        <div className="absolute inset-x-3 bottom-8 flex items-center gap-3 rounded-2xl bg-white/95 p-2.5 shadow-pop backdrop-blur">
                          <Img src={unsplash(car.images[0], 240)} alt="" className="h-11 w-16 shrink-0 rounded-xl object-cover" fallback={<span className="h-11 w-16 shrink-0 rounded-xl bg-panel" />} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-detail font-semibold text-ink">{car.make} {car.model}</p>
                            <p className="truncate text-caption text-muted">{t('Pick-up in {city}', { city: car.city })}</p>
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 text-caption text-faint">{t('The exact address is shared once your booking is confirmed.')}</p>

                      <div className="mt-4 grid grid-cols-3 gap-2.5">
                        {DURATIONS.map((d) => {
                          const on = days === d.days;
                          return (
                            <button
                              key={d.days}
                              onClick={() => setDays(d.days)}
                              className={`relative rounded-2xl border p-3 text-left transition-[border-color,box-shadow,background-color] duration-300 ${on ? 'border-ink bg-surface shadow-[0_0_0_1px_#16161a]' : 'border-line bg-panel/60 hover:bg-panel'}`}
                            >
                              <span className="text-caption font-medium text-muted">{t(d.label)}</span>
                              <span className="mt-1 block font-display text-lead font-semibold leading-tight text-ink">{eur(car.pricePerDay * d.days)}</span>
                              <span className="text-caption text-faint">{d.days === 1 ? t('/ day') : t('{n} days', { n: d.days })}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-caption text-faint">{t('Day rate × days. Extras and fees are added at checkout.')}</p>
                    </div>
                  )}

                  {tab === 'info' && (
                    <dl className="divide-y divide-line text-detail">
                      {([
                        ['calendar', 'Year', String(car.year)],
                        ['grid', 'Category', t(car.category)],
                        ['gear', 'Transmission', t(car.transmission)],
                        ['gas', 'Fuel', t(car.fuel)],
                        ['compass', 'Drive', car.drive],
                        ['gauge', 'Mileage', car.mileage],
                      ] as [IconName, string, string][]).map(([ic, k, v]) => (
                        <div key={k} className="flex items-center justify-between py-3">
                          <dt className="flex items-center gap-2 text-muted"><Icon name={ic} size={15} /> {t(k)}</dt>
                          <dd className="font-medium text-ink">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {tab === 'specs' && (
                    <div>
                      <div className="grid grid-cols-3 gap-2.5">
                        {([['seat', String(car.seats), 'Seats'], ['door', String(car.doors), 'Doors'], ['bag', String(car.luggage), 'Bags']] as [IconName, string, string][]).map(([ic, v, l]) => (
                          <div key={l} className="rounded-2xl border border-line bg-panel/60 p-3 text-center">
                            <Icon name={ic} size={16} className="mx-auto text-muted" />
                            <p className="mt-1.5 font-display text-lead font-semibold text-ink">{v}</p>
                            <p className="text-caption text-muted">{t(l)}</p>
                          </div>
                        ))}
                      </div>
                      {car.features.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {car.features.map((f) => (
                            <span key={f} className="rounded-full border border-line bg-surface px-3 py-1.5 text-caption font-medium text-ink-soft">{t(f)}</span>
                          ))}
                        </div>
                      )}
                      {car.description && <p className="mt-4 text-body leading-relaxed text-muted text-pretty"><Ugc text={car.description} /></p>}
                    </div>
                  )}

                  {tab === 'roadbook' && <CarRoadbook carId={car.id} carSlug={car.slug} />}

                  {tab === 'reviews' && (
                    <div>
                      <p className="flex items-center gap-2 text-ink">
                        <Icon name="star" size={18} className="text-star" />
                        <span className="font-display text-xl font-semibold">{car.trips > 0 ? car.rating.toFixed(2) : '—'}</span>
                        <span className="text-detail text-muted">{t('{n} trips', { n: car.trips })}</span>
                      </p>
                      {car.reviews.length === 0 ? (
                        <p className="mt-4 text-detail text-muted">{t('No reviews yet.')}</p>
                      ) : (
                        <ul className="mt-4 space-y-4">
                          {car.reviews.slice(0, 3).map((r) => (
                            <li key={r.id} className="rounded-2xl border border-line p-4">
                              <div className="flex items-center gap-2.5">
                                <Img src={r.avatar} alt="" className="h-8 w-8 rounded-full object-cover" fallback={<span className="h-8 w-8 rounded-full bg-panel" />} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-detail font-semibold text-ink">{r.author}</p>
                                  <p className="text-caption text-faint">{r.date}</p>
                                </div>
                                <span className="inline-flex items-center gap-1 text-detail font-medium text-ink"><Icon name="star" size={12} className="text-star" /> {r.rating}</span>
                              </div>
                              <p className="mt-2.5 text-detail leading-relaxed text-muted"><Ugc text={r.body} /></p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* book bar */}
            <div className="shrink-0 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <Link
                to={`/cars/${car.slug}`}
                onClick={onClose}
                className="pressable flex items-center justify-between rounded-2xl bg-ink px-5 py-4 text-white shadow-[0_14px_30px_-12px_rgba(22,22,26,0.6)] transition-transform hover:-translate-y-0.5"
              >
                <span className="font-semibold">{t('Book now')} · {eur(car.pricePerDay * days)}</span>
                <span className="flex items-center gap-1.5 text-detail text-white/70">
                  {car.instantBook ? <><Icon name="instant" size={13} className="text-accent-bright" /> {t('Instant book')}</> : t('Request to book')}
                  <Icon name="arrowRight" size={15} />
                </span>
              </Link>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
