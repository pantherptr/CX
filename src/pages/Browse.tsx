import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCars } from '../lib/data/cars';
import type { Car } from '../data/types';
import { BrowseCard } from '../components/browse/BrowseCard';
import { CarDrawer } from '../components/browse/CarDrawer';
import { PriceHistogram } from '../components/browse/PriceHistogram';
import { BrowseMap, type AreaBounds } from '../components/browse/BrowseMap';
import { SkeletonSwap } from '../components/SkeletonSwap';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/primitives';
import { ConciergeLauncher, ConciergeMark } from '../components/Concierge';
import { motion, AnimatePresence, SPRING_SNAPPY } from '../components/motionKit';
import { useScramble } from '../lib/useScramble';
import { useMediaQuery } from '../components/motion';
import { eur } from '../lib/format';
import { FindCarDeck } from '../components/FindCarDeck';
import { SnapSheet } from '../components/SnapSheet';
import { useBottomNavVisible } from '../components/BottomNav';
import { useLocale } from '../lib/i18n';
import { uiLocale } from '../lib/i18n/uiLocale';
import { fetchBookedRangesBulk, rangesOverlap, type BookedRange } from '../lib/data/bookings';

const ALL_TYPES = ['Economy', 'Luxury', 'SUV', 'Sport', 'Electric', 'Convertible', 'Family'];
const ALL_FUEL = ['Petrol', 'Diesel', 'Electric', 'Hybrid'];
const ALL_FEATURES = ['Apple CarPlay', 'Heated seats', 'Adaptive cruise control', 'Panoramic roof', 'Premium sound', 'Navigation'];
const SORTS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'newest', label: 'Newest' },
  { id: 'rating', label: 'Most booked' },
  { id: 'trips', label: 'Most booked' },
];
const PRICE_MIN = 30;
const PRICE_MAX = 800;

interface Filters {
  priceMin: number;
  priceMax: number;
  types: string[];
  brands: string[];
  transmission: string;
  fuels: string[];
  seats: number;
  bags: number;
  features: string[];
  rating: number;
  instant: boolean;
}

const emptyFilters: Filters = {
  priceMin: PRICE_MIN,
  priceMax: PRICE_MAX,
  types: [],
  brands: [],
  transmission: 'any',
  fuels: [],
  seats: 0,
  bags: 0,
  features: [],
  rating: 0,
  instant: false,
};

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/** A filter section that folds away with a smooth height change. */
function Section({ title, open: initial = true, children }: { title: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <h3 className="text-label font-semibold uppercase tracking-[0.12em] text-muted">{title}</h3>
        <Icon name="chevronDown" size={15} className={`text-faint transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-3.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="group flex cursor-pointer items-center gap-2.5 py-1.5">
      <span
        className={`grid h-[18px] w-[18px] place-items-center rounded-[5px] border transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-active:scale-90 ${
          checked ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface group-hover:border-ink/50'
        }`}
      >
        {checked && <Icon name="check" size={12} strokeWidth={3} />}
      </span>
      <span className="text-body text-ink-soft">{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
    </label>
  );
}

/** A grey pill with a white thumb that slides to the chosen option. */
function Segmented<T extends string | number>({ id, options, value, onChange }: { id: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-panel p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} onClick={() => onChange(o.value)} className={`relative flex-1 rounded-[9px] px-2 py-1.5 text-detail font-medium transition-colors ${on ? 'text-ink' : 'text-muted hover:text-ink'}`}>
            {on && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-[9px] bg-surface shadow-hair" transition={SPRING_SNAPPY} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between py-1 text-left">
      <span className="text-label font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
      <span className={`relative h-[22px] w-10 rounded-full transition-colors duration-300 ${checked ? 'bg-ink' : 'bg-line-strong'}`}>
        <motion.span className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-hair" animate={{ left: checked ? 21 : 3 }} transition={SPRING_SNAPPY} />
      </span>
    </button>
  );
}

function FilterPanel({
  f,
  set,
  reset,
  brands,
  prices,
  pickupDate,
  returnDate,
  setPickupDate,
  setReturnDate,
}: {
  f: Filters;
  set: (fn: (p: Filters) => Filters) => void;
  reset: () => void;
  brands: string[];
  prices: number[];
  pickupDate: string;
  returnDate: string;
  setPickupDate: (v: string) => void;
  setReturnDate: (v: string) => void;
}) {
  const { t } = useLocale();
  return (
    <div>
      <div className="pb-4">
        <Switch checked={f.instant} onChange={(v) => set((p) => ({ ...p, instant: v }))} label={t('Instant book only')} />
      </div>

      <Section title={t('Dates')}>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-label font-semibold uppercase tracking-wide text-muted">{t('Pick-up')}</span>
            <input type="date" value={pickupDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setPickupDate(e.target.value)} className="input mt-1 !py-2 !text-[16px] sm:!text-detail" />
          </label>
          <label className="block">
            <span className="text-label font-semibold uppercase tracking-wide text-muted">{t('Return')}</span>
            <input type="date" value={returnDate} min={pickupDate || new Date().toISOString().slice(0, 10)} onChange={(e) => setReturnDate(e.target.value)} className="input mt-1 !py-2 !text-[16px] sm:!text-detail" />
          </label>
        </div>
      </Section>

      <Section title={t('Price range / day')}>
        <PriceHistogram
          prices={prices}
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={10}
          low={f.priceMin}
          high={f.priceMax}
          onLow={(v) => set((p) => ({ ...p, priceMin: Math.min(v, p.priceMax) }))}
          onHigh={(v) => set((p) => ({ ...p, priceMax: Math.max(v, p.priceMin) }))}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-panel px-3 py-2"><p className="text-caption text-muted">{t('From')}</p><p className="text-body font-semibold tabular-nums text-ink">{eur(f.priceMin)}</p></div>
          <div className="rounded-xl bg-panel px-3 py-2"><p className="text-caption text-muted">{t('To')}</p><p className="text-body font-semibold tabular-nums text-ink">{eur(f.priceMax)}{f.priceMax >= PRICE_MAX ? '+' : ''}</p></div>
        </div>
      </Section>

      <Section title={t('Car type')}>
        <div className="grid grid-cols-2 gap-x-3">
          {ALL_TYPES.map((ty) => (
            <Check key={ty} label={t(ty)} checked={f.types.includes(ty)} onChange={() => set((p) => ({ ...p, types: toggle(p.types, ty) }))} />
          ))}
        </div>
      </Section>

      <Section title={t('Brand')} open={false}>
        <div className="max-h-52 overflow-y-auto pr-1">
          {brands.map((b) => (
            <Check key={b} label={b} checked={f.brands.includes(b)} onChange={() => set((p) => ({ ...p, brands: toggle(p.brands, b) }))} />
          ))}
        </div>
      </Section>

      <Section title={t('Transmission')}>
        <Segmented
          id="tr"
          value={f.transmission}
          onChange={(v) => set((p) => ({ ...p, transmission: v }))}
          options={[{ value: 'any', label: t('Any') }, { value: 'Automatic', label: t('Automatic') }, { value: 'Manual', label: t('Manual') }]}
        />
      </Section>

      <Section title={t('Fuel type')} open={false}>
        <div className="grid grid-cols-2 gap-x-3">
          {ALL_FUEL.map((fu) => (
            <Check key={fu} label={t(fu)} checked={f.fuels.includes(fu)} onChange={() => set((p) => ({ ...p, fuels: toggle(p.fuels, fu) }))} />
          ))}
        </div>
      </Section>

      <Section title={t('Seats')} open={false}>
        <Segmented id="seats" value={f.seats} onChange={(v) => set((p) => ({ ...p, seats: v }))} options={[0, 2, 4, 5, 7].map((s) => ({ value: s, label: s === 0 ? t('Any') : `${s}+` }))} />
      </Section>

      <Section title={t('Luggage')} open={false}>
        <Segmented id="bags" value={f.bags} onChange={(v) => set((p) => ({ ...p, bags: v }))} options={[0, 1, 2, 3, 4].map((b) => ({ value: b, label: b === 0 ? t('Any') : `${b}+` }))} />
      </Section>

      <Section title={t('Features')} open={false}>
        {ALL_FEATURES.map((ft) => (
          <Check key={ft} label={t(ft)} checked={f.features.includes(ft)} onChange={() => set((p) => ({ ...p, features: toggle(p.features, ft) }))} />
        ))}
      </Section>


      <button onClick={reset} className="mt-4 w-full rounded-xl border border-line py-2.5 text-detail font-medium text-muted transition-colors hover:border-ink hover:text-ink">
        {t('Clear all filters')}
      </button>
    </div>
  );
}

function CarCardSkeleton() {
  return (
    <div className="rounded-[24px] border border-line bg-surface p-3">
      <div className="mb-2.5 flex justify-between"><div className="skeleton h-6 w-20 rounded-full" /><div className="skeleton h-6 w-16 rounded-full" /></div>
      <div className="skeleton aspect-[4/3] rounded-[18px]" />
      <div className="space-y-2.5 px-1 pt-3.5">
        <div className="skeleton h-4 w-3/5 rounded-md" />
        <div className="skeleton h-3 w-2/5 rounded-md" />
      </div>
    </div>
  );
}

export default function Browse() {
  const { t } = useLocale();
  const findCxScramble = useScramble(t('Find Your CX'));
  const [params, setParams] = useSearchParams();
  const { cars, loading, error } = useCars();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...emptyFilters,
    types: params.get('type') && ALL_TYPES.includes(params.get('type')!) ? [params.get('type')!] : [],
  }));
  const [city, setCity] = useState(params.get('city') ?? '');
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [sort, setSort] = useState('recommended');
  const [sortOpen, setSortOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [openCar, setOpenCar] = useState<Car | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const wide = useMediaQuery('(min-width: 1280px)');
  const dockShown = useBottomNavVisible();
  const [showMap, setShowMap] = useState(true);
  // below xl the page is one piece: the map on top (what you see first) and the list that rises over it as you
  // scroll — the page itself is the sheet, so it follows the finger exactly
  const phone = useMediaQuery('(max-width: 1023px)');
  const navigate = useNavigate();
  const mapFirst = !wide;
  const mapBeside = wide && showMap;
  const listRef = useRef<HTMLDivElement>(null);
  const [listUp, setListUp] = useState(false);
  useEffect(() => {
    if (!mapFirst) return;
    const onScroll = () => setListUp(window.scrollY > window.innerHeight * 0.35);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [mapFirst]);
  const goList = () => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const goMap = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const [bookedByCar, setBookedByCar] = useState<Map<string, BookedRange[]>>(new Map());

  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => void (document.body.style.overflow = '');
  }, [drawer]);

  // Fetched once per car list (real, date-only exposure via migration
  // 0009's security-definer functions — bookings' own RLS hides everything
  // else from a browsing customer). Small catalogue, one bulk round trip.
  useEffect(() => {
    if (!cars || cars.length === 0) return;
    let cancelled = false;
    fetchBookedRangesBulk(cars.map((c) => c.id))
      .then((map) => {
        if (!cancelled) setBookedByCar(map);
      })
      .catch(() => {
        /* availability filtering is a nicety — fail open, show all cars */
      });
    return () => {
      cancelled = true;
    };
  }, [cars]);

  const brands = useMemo(() => [...new Set((cars ?? []).map((c) => c.make))].sort(), [cars]);
  const prices = useMemo(() => (cars ?? []).map((c) => c.pricePerDay), [cars]);

  const hasDateFilter = Boolean(pickupDate && returnDate && returnDate > pickupDate);

  const results = useMemo(() => {
    let out = (cars ?? []).filter((c: Car) => {
      if (c.pricePerDay < filters.priceMin || c.pricePerDay > filters.priceMax) return false;
      if (filters.types.length && !filters.types.includes(c.category)) return false;
      if (filters.brands.length && !filters.brands.includes(c.make)) return false;
      if (filters.transmission !== 'any' && c.transmission !== filters.transmission) return false;
      if (filters.fuels.length && !filters.fuels.includes(c.fuel)) return false;
      if (filters.seats && c.seats < filters.seats) return false;
      if (filters.bags && c.luggage < filters.bags) return false;
      if (filters.instant && !c.instantBook) return false;
      if (filters.features.length && !filters.features.every((ft) => c.features.includes(ft))) return false;
      if (city && c.city.toLowerCase() !== city.toLowerCase()) return false;
      if (hasDateFilter && rangesOverlap(pickupDate, returnDate, bookedByCar.get(c.id) ?? [])) return false;
      return true;
    });
    switch (sort) {
      case 'price-asc': out = [...out].sort((a, b) => a.pricePerDay - b.pricePerDay); break;
      case 'price-desc': out = [...out].sort((a, b) => b.pricePerDay - a.pricePerDay); break;
      case 'newest': out = [...out].sort((a, b) => b.year - a.year); break;
      case 'rating': out = [...out].sort((a, b) => b.trips - a.trips); break;
      case 'trips': out = [...out].sort((a, b) => b.trips - a.trips); break;
    }
    return out;
  }, [cars, filters, sort, city, hasDateFilter, pickupDate, returnDate, bookedByCar]);

  // "Search this area": the results narrowed to what the map shows
  const [area, setArea] = useState<AreaBounds | null>(null);
  const shown = useMemo(
    () => (area
      ? results.filter((c) => c.lat != null && c.lng != null && c.lng >= area.west && c.lng <= area.east && c.lat >= area.south && c.lat <= area.north)
      : results),
    [results, area],
  );

  const reset = () => {
    setFilters(emptyFilters);
    setArea(null);
    setCity('');
    setPickupDate('');
    setReturnDate('');
    setParams({});
  };

  const activeCount =
    filters.types.length + filters.brands.length + filters.fuels.length + filters.features.length +
    (filters.transmission !== 'any' ? 1 : 0) + (filters.seats ? 1 : 0) + (filters.bags ? 1 : 0) + (filters.rating ? 1 : 0) +
    (filters.instant ? 1 : 0) +
    (filters.priceMax !== emptyFilters.priceMax || filters.priceMin !== emptyFilters.priceMin ? 1 : 0) +
    (hasDateFilter ? 1 : 0);

  const panel = (
    <FilterPanel
      f={filters}
      set={setFilters}
      reset={reset}
      brands={brands}
      prices={prices}
      pickupDate={pickupDate}
      returnDate={returnDate}
      setPickupDate={setPickupDate}
      setReturnDate={setReturnDate}
    />
  );


  // ------------------------------------------------------------------ phone: the map is the page (like a map app)
  if (phone) {
    const chips: { id: string; label: string; on: boolean; toggle: () => void }[] = [
      { id: 'instant', label: t('Instant book'), on: filters.instant, toggle: () => setFilters((p) => ({ ...p, instant: !p.instant })) },
      { id: 'auto', label: t('Automatic'), on: filters.transmission === 'Automatic', toggle: () => setFilters((p) => ({ ...p, transmission: p.transmission === 'Automatic' ? 'any' : 'Automatic' })) },
      ...['Luxury', 'SUV', 'Sport', 'Electric', 'Convertible'].map((ty) => ({
        id: ty,
        label: t(ty),
        on: filters.types.includes(ty),
        toggle: () => setFilters((p) => ({ ...p, types: toggle(p.types, ty) })),
      })),
    ];
    const dates = hasDateFilter
      ? `${new Date(pickupDate).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' })} – ${new Date(returnDate).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' })}`
      : t('Any dates');
    return (
      <div className="relative bg-surface">
        {/* the top: back, what you are looking at, filters, then the quick chips */}
        <div className="fixed inset-x-0 top-0 z-40 bg-gradient-to-b from-surface via-surface/95 to-surface/0 pb-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}>
          <div className="flex items-center gap-2 px-3">
            <button type="button" onClick={() => navigate('/')} aria-label={t('Back')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)] active:scale-95">
              <Icon name="chevronLeft" size={20} />
            </button>
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="min-h-11 min-w-0 flex-1 rounded-full bg-surface px-4 py-1.5 text-center shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)] active:scale-[0.99]"
            >
              <span className="block truncate text-detail font-semibold text-ink">{area ? t('Cars in the map area') : city.trim() || t('Cars in the map area')}</span>
              <span className="block truncate text-caption text-muted">{dates}</span>
            </button>
            <button type="button" onClick={() => setDrawer(true)} aria-label={t('Filters')} className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)] active:scale-95">
              <Icon name="sliders" size={19} />
              {activeCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-label font-semibold text-white">{activeCount}</span>}
            </button>
          </div>
          <div className="scrollbar-none mt-2.5 flex gap-2 overflow-x-auto px-3 pb-1">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={c.toggle}
                aria-pressed={c.on}
                className={`min-h-9 shrink-0 rounded-full px-3.5 text-caption font-semibold shadow-[0_4px_12px_-6px_rgba(0,0,0,0.45)] transition-colors ${c.on ? 'bg-ink text-white' : 'bg-surface text-ink'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* the map: the whole screen, behind everything */}
        <div className="sticky top-0 z-0 h-dvh">
          {loading ? (
            <div className="skeleton h-full w-full" />
          ) : (
            <BrowseMap variant="main" cars={shown} areaActive={area !== null} onAreaChange={setArea} activeId={openCar?.id ?? null} hoverId={hoverId} onSelect={setOpenCar} className="h-full w-full" />
          )}
        </div>

        {/* the list: a sheet whose top edge peeks over the map and rises with the page */}
        <div
          ref={listRef}
          className="relative z-10 -mt-[3.6rem] rounded-t-[28px] bg-surface px-4 pb-28 shadow-[0_-16px_36px_-18px_rgba(0,0,0,0.5)]"
        >
          <button type="button" onClick={goList} aria-label={t('Show all cars')} className="flex w-full flex-col items-center gap-1 pb-2 pt-2.5">
            <span className="h-1 w-10 rounded-full bg-line-strong" />
            <span className="text-detail font-semibold text-ink">
              {loading ? t('Loading…') : shown.length === 1 ? t('1 car') : t('{n} cars', { n: shown.length })}
            </span>
          </button>
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3">
            <span className="text-caption text-muted">{area ? t('In the map area') : t('Sorted by')}</span>
            <label className="relative">
              <span className="sr-only">{t('Sort')}</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="min-h-10 max-w-[11rem] rounded-full border border-line bg-surface py-1.5 pl-3.5 pr-7 !text-[14px] font-semibold text-ink"
              >
                {SORTS.filter((x) => x.id !== 'rating').map((x) => <option key={x.id} value={x.id}>{t(x.label)}</option>)}
              </select>
            </label>
          </div>
          {!loading && !error && (
            <div className="mb-5">
              <p className="mb-3 px-1 text-label font-semibold uppercase tracking-[0.14em] text-accent-700">{t('Swipe to find your car')}</p>
              <div className="-mx-4">
                <FindCarDeck city={city.trim() || null} />
              </div>
            </div>
          )}
          <SkeletonSwap
            ready={!loading}
            skeleton={<div className="grid grid-cols-1 gap-4">{Array.from({ length: 4 }).map((_, i) => <CarCardSkeleton key={i} />)}</div>}
          >
            {error ? (
              <div className="card"><EmptyState size="lg" tone="danger" icon="info" title={t("Couldn't load cars")} description={error} className="px-6 py-16" /></div>
            ) : shown.length === 0 ? (
              <div className="card">
                <EmptyState
                  size="lg"
                  icon="search"
                  title={t('No cars match your filters')}
                  description={t('Move the map or clear a few filters to see more of the fleet.')}
                  action={<button onClick={reset} className="btn btn-primary">{t('Clear all filters')}</button>}
                  className="px-6 py-16"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {shown.map((car, i) => (
                  <BrowseCard key={car.id} car={car} variant="grid" active={openCar?.id === car.id} priority={i < 3} available={hasDateFilter} onOpen={() => setOpenCar(car)} onHover={setHoverId} />
                ))}
              </div>
            )}
          </SkeletonSwap>
        </div>

        {listUp && (
          <button
            type="button"
            onClick={goMap}
            className="fixed left-1/2 z-30 inline-flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 text-detail font-semibold text-white shadow-[0_14px_30px_-10px_rgba(0,0,0,0.6)] active:scale-95"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.4rem)' }}
          >
            <Icon name="pin" size={16} /> {t('Map')}
          </button>
        )}

        <CarDrawer car={openCar} onClose={() => setOpenCar(null)} />
        <SnapSheet
          open={drawer}
          onClose={() => setDrawer(false)}
          title={t('Filter by')}
          labelledBy="filters-sheet-title"
          footer={<button onClick={() => setDrawer(false)} className="btn btn-primary btn-block btn-lg">{t('Show cars')}</button>}
        >
          {panel}
        </SnapSheet>
      </div>
    );
  }

  return (
    <div className="container-page !max-w-[1760px] py-6 sm:py-8">
      <div className="flex gap-6 lg:gap-8">
        {/* Filters */}
        <aside className="hidden w-[280px] shrink-0 lg:block">
          <div className="sticky top-[84px] max-h-[calc(100dvh-100px)] overflow-y-auto rounded-[24px] border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-copy font-semibold text-ink">{t('Filter by')}</h2>
              {activeCount > 0 && (
                <button onClick={reset} className="text-caption font-medium text-muted transition-colors hover:text-ink">{t('Reset all')} · {activeCount}</button>
              )}
            </div>
            {panel}
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className={`font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem] ${mapFirst ? 'sr-only' : ''}`}>
              {t('Browse cars')}
            </h1>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => (wide ? setShowMap((v) => !v) : listUp ? goMap() : goList())}
                className="btn btn-secondary"
                aria-pressed={wide ? showMap : listUp}
              >
                <Icon name={wide ? 'pin' : listUp ? 'pin' : 'grid'} size={16} />
                {wide ? (showMap ? t('Hide map') : t('Show map')) : listUp ? t('Map') : t('List')}
              </button>
              <button onClick={() => setDrawer(true)} className="btn btn-secondary relative lg:hidden">
                <Icon name="sliders" size={17} /> {t('Filters')}
                {activeCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-label font-semibold text-white">{activeCount}</span>}
              </button>
              <div className="relative">
                <button onClick={() => setSortOpen((o) => !o)} className="btn btn-secondary" aria-haspopup="listbox" aria-expanded={sortOpen} aria-label={t('Sort')}>
                  <Icon name="sort" size={16} />
                  <span className="hidden sm:inline">{t(SORTS.find((s) => s.id === sort)!.label)}</span>
                  <Icon name="chevronDown" size={15} className="text-muted" />
                </button>
                {sortOpen && (
                  <>
                    <div aria-hidden className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                    <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop" role="listbox">
                      {SORTS.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { setSort(s.id); setSortOpen(false); }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-body transition-colors hover:bg-panel ${sort === s.id ? 'text-ink' : 'text-ink-soft'}`}
                        >
                          {t(s.label)}
                          {sort === s.id && <Icon name="check" size={16} className="text-ink" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Icon name="pin" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t('Search by city — Milan, Rome, Paris…')}
                className="h-11 w-full rounded-full border border-line bg-surface pl-11 pr-4 text-[16px] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink sm:text-body"
              />
            </div>
            <ConciergeLauncher className={`group h-11 shrink-0 items-center gap-2.5 rounded-full border border-line bg-surface pl-1.5 pr-4 text-detail font-semibold text-ink transition-colors hover:border-ink ${mapFirst ? 'hidden' : 'inline-flex'}`} {...findCxScramble}>
              <ConciergeMark size={32} />
              {findCxScramble.display} <Icon name="arrowRight" size={14} className="transition-transform group-hover:translate-x-0.5" />
            </ConciergeLauncher>
          </div>

          {(() => {
            const grid = (
              <SkeletonSwap
                ready={!loading}
                skeleton={
                  <div className={mapBeside ? 'space-y-3' : 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <CarCardSkeleton key={i} />
                    ))}
                  </div>
                }
              >
                {error ? (
                  <div className="card">
                    <EmptyState size="lg" tone="danger" icon="info" title={t("Couldn't load cars")} description={error} className="px-6 py-20" />
                  </div>
                ) : shown.length === 0 ? (
                  <div className="card">
                    <EmptyState
                      size="lg"
                      icon="search"
                      title={t('No cars match your filters')}
                      description={t('Try widening your price range or clearing a few filters to see more of the fleet.')}
                      action={<button onClick={reset} className="btn btn-primary">{t('Clear all filters')}</button>}
                      className="px-6 py-20"
                    />
                  </div>
                ) : (
                  <motion.div layout className={mapBeside ? 'space-y-3' : 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
                    <AnimatePresence mode="popLayout">
                      {shown.map((car, i) => (
                        <BrowseCard
                          key={car.id}
                          car={car}
                          variant={mapBeside ? 'row' : 'grid'}
                          active={openCar?.id === car.id}
                          priority={i < 6}
                          available={hasDateFilter}
                          onOpen={() => setOpenCar(car)}
                          onHover={setHoverId}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </SkeletonSwap>
            );

            if (mapFirst) {
              return (
                <div className="relative">
                  {/* the map stays put while the list slides up over it */}
                  <div className="sticky z-0" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.25rem)' }}>
                    {loading ? (
                      <div className="skeleton h-[calc(100dvh-13.5rem)] min-h-[26rem] rounded-[24px]" />
                    ) : (
                      <BrowseMap variant="main" cars={shown} areaActive={area !== null} onAreaChange={setArea} activeId={openCar?.id ?? null} hoverId={hoverId} onSelect={setOpenCar} className="h-[calc(100dvh-13.5rem)] min-h-[26rem] rounded-[24px] border border-line" />
                    )}
                  </div>
                  <div
                    ref={listRef}
                    className="relative z-10 -mx-4 mt-3 scroll-mt-[4.5rem] rounded-t-[28px] bg-surface px-4 pb-28 pt-3 shadow-[0_-16px_36px_-18px_rgba(0,0,0,0.5)] sm:-mx-6 sm:px-6"
                  >
                    <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-strong" />
                    {!loading && !error && (
                      <div className="mb-6 md:hidden">
                        <p className="mb-3 px-1 text-label font-semibold uppercase tracking-[0.14em] text-accent-700">{t('Swipe to find your car')}</p>
                        <div className="-mx-4">
                          <FindCarDeck city={city.trim() || null} />
                        </div>
                      </div>
                    )}
                    {grid}
                  </div>
                </div>
              );
            }
            return (
              <div className={mapBeside ? 'flex items-start gap-5' : ''}>
                <div className={mapBeside ? 'w-[470px] shrink-0' : 'min-w-0'}>{grid}</div>
                {mapBeside && (
                  <div className="sticky top-[84px] min-w-0 flex-1">
                    <BrowseMap cars={shown} areaActive={area !== null} onAreaChange={setArea} activeId={openCar?.id ?? null} hoverId={hoverId} onSelect={setOpenCar} className="h-[calc(100dvh-104px)] rounded-[24px] border border-line" />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* phone list view: one tap back to the map */}
      {mapFirst && listUp && (
        <button
          type="button"
          onClick={goMap}
          className="fixed left-1/2 z-30 inline-flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 text-detail font-semibold text-white shadow-[0_14px_30px_-10px_rgba(0,0,0,0.6)] active:scale-95"
          style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${dockShown ? '5.4rem' : '1.1rem'})` }}
        >
          <Icon name="pin" size={16} /> {t('Map')}
        </button>
      )}

      <CarDrawer car={openCar} onClose={() => setOpenCar(null)} />

      {/* Mobile filter sheet: half height first, pulled up (or tapped on its handle) to almost full */}
      <SnapSheet
        open={drawer}
        onClose={() => setDrawer(false)}
        title={t('Filter by')}
        labelledBy="filters-sheet-title"
        footer={<button onClick={() => setDrawer(false)} className="btn btn-primary btn-block btn-lg">{t('Show cars')}</button>}
      >
        {panel}
      </SnapSheet>
    </div>
  );
}
