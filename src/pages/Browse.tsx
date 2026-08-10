import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cars } from '../data/cars';
import type { Car } from '../data/types';
import { CarCard } from '../components/CarCard';
import { Icon } from '../components/Icon';
import { eur } from '../lib/format';

const ALL_TYPES = ['Economy', 'Luxury', 'SUV', 'Sport', 'Electric', 'Convertible', 'Family'];
const ALL_BRANDS = [...new Set(cars.map((c) => c.make))].sort();
const ALL_FUEL = ['Petrol', 'Diesel', 'Electric', 'Hybrid'];
const ALL_FEATURES = ['Apple CarPlay', 'Heated seats', 'Adaptive cruise control', 'Panoramic roof', 'Premium sound', 'Navigation'];
const SORTS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Top rated' },
  { id: 'trips', label: 'Most booked' },
];

interface Filters {
  priceMax: number;
  types: string[];
  brands: string[];
  transmission: string;
  fuels: string[];
  seats: number;
  features: string[];
  rating: number;
}

const emptyFilters: Filters = {
  priceMax: 800,
  types: [],
  brands: [],
  transmission: 'any',
  fuels: [],
  seats: 0,
  features: [],
  rating: 0,
};

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3.5 text-[13px] font-semibold uppercase tracking-wide text-ink">{title}</h3>
      {children}
    </div>
  );
}

function Check({ label, checked, onChange, note }: { label: string; checked: boolean; onChange: () => void; note?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1.5 group">
      <span className="flex items-center gap-2.5">
        <span
          className={`grid h-[18px] w-[18px] place-items-center rounded-[6px] border transition-all ${
            checked ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface group-hover:border-faint'
          }`}
        >
          {checked && <Icon name="check" size={12} strokeWidth={3} />}
        </span>
        <span className="text-[14px] text-ink-soft">{label}</span>
      </span>
      {note && <span className="text-[12.5px] text-faint">{note}</span>}
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
    </label>
  );
}

function FilterPanel({ f, set, reset }: { f: Filters; set: (fn: (p: Filters) => Filters) => void; reset: () => void }) {
  return (
    <div>
      <FilterGroup title="Price per day">
        <div className="flex items-center justify-between text-[14px] text-ink">
          <span className="text-muted">Up to</span>
          <span className="font-semibold">{eur(f.priceMax)}</span>
        </div>
        <input
          type="range"
          min={30}
          max={800}
          step={10}
          value={f.priceMax}
          onChange={(e) => set((p) => ({ ...p, priceMax: +e.target.value }))}
          className="mt-3 w-full accent-[var(--color-accent)]"
        />
        <div className="mt-1 flex justify-between text-[12px] text-faint">
          <span>€30</span>
          <span>€800+</span>
        </div>
      </FilterGroup>

      <FilterGroup title="Car type">
        {ALL_TYPES.map((t) => (
          <Check key={t} label={t} checked={f.types.includes(t)} onChange={() => set((p) => ({ ...p, types: toggle(p.types, t) }))} />
        ))}
      </FilterGroup>

      <FilterGroup title="Brand">
        <div className="max-h-52 overflow-y-auto pr-1">
          {ALL_BRANDS.map((b) => (
            <Check key={b} label={b} checked={f.brands.includes(b)} onChange={() => set((p) => ({ ...p, brands: toggle(p.brands, b) }))} />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Transmission">
        <div className="flex gap-2">
          {['any', 'Automatic', 'Manual'].map((t) => (
            <button
              key={t}
              onClick={() => set((p) => ({ ...p, transmission: t }))}
              data-active={f.transmission === t}
              className="chip flex-1 justify-center capitalize"
            >
              {t}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Fuel type">
        {ALL_FUEL.map((t) => (
          <Check key={t} label={t} checked={f.fuels.includes(t)} onChange={() => set((p) => ({ ...p, fuels: toggle(p.fuels, t) }))} />
        ))}
      </FilterGroup>

      <FilterGroup title="Seats">
        <div className="flex gap-2">
          {[0, 2, 4, 5, 7].map((s) => (
            <button
              key={s}
              onClick={() => set((p) => ({ ...p, seats: s }))}
              data-active={f.seats === s}
              className="chip flex-1 justify-center"
            >
              {s === 0 ? 'Any' : `${s}+`}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Features">
        {ALL_FEATURES.map((t) => (
          <Check key={t} label={t} checked={f.features.includes(t)} onChange={() => set((p) => ({ ...p, features: toggle(p.features, t) }))} />
        ))}
      </FilterGroup>

      <FilterGroup title="Rating">
        <div className="flex gap-2">
          {[0, 4.5, 4.8, 4.9].map((r) => (
            <button key={r} onClick={() => set((p) => ({ ...p, rating: r }))} data-active={f.rating === r} className="chip flex-1 justify-center gap-1">
              {r === 0 ? 'Any' : <><Icon name="star" size={12} className="text-star" />{r}+</>}
            </button>
          ))}
        </div>
      </FilterGroup>

      <button onClick={reset} className="mt-5 w-full text-[14px] font-medium text-muted transition-colors hover:text-ink">
        Clear all filters
      </button>
    </div>
  );
}

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...emptyFilters,
    types: params.get('type') && ALL_TYPES.includes(params.get('type')!) ? [params.get('type')!] : [],
  }));
  const [city, setCity] = useState(params.get('city') ?? '');
  const [sort, setSort] = useState('recommended');
  const [sortOpen, setSortOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => void (document.body.style.overflow = '');
  }, [drawer]);

  const results = useMemo(() => {
    let out = cars.filter((c: Car) => {
      if (c.pricePerDay > filters.priceMax) return false;
      if (filters.types.length && !filters.types.includes(c.category)) return false;
      if (filters.brands.length && !filters.brands.includes(c.make)) return false;
      if (filters.transmission !== 'any' && c.transmission !== filters.transmission) return false;
      if (filters.fuels.length && !filters.fuels.includes(c.fuel)) return false;
      if (filters.seats && c.seats < filters.seats) return false;
      if (filters.rating && c.rating < filters.rating) return false;
      if (filters.features.length && !filters.features.every((ft) => c.features.includes(ft))) return false;
      if (city && c.city.toLowerCase() !== city.toLowerCase()) return false;
      return true;
    });
    switch (sort) {
      case 'price-asc': out = [...out].sort((a, b) => a.pricePerDay - b.pricePerDay); break;
      case 'price-desc': out = [...out].sort((a, b) => b.pricePerDay - a.pricePerDay); break;
      case 'rating': out = [...out].sort((a, b) => b.rating - a.rating); break;
      case 'trips': out = [...out].sort((a, b) => b.trips - a.trips); break;
    }
    return out;
  }, [filters, sort, city]);

  const reset = () => {
    setFilters(emptyFilters);
    setCity('');
    setParams({});
  };

  const activeCount =
    filters.types.length + filters.brands.length + filters.fuels.length + filters.features.length +
    (filters.transmission !== 'any' ? 1 : 0) + (filters.seats ? 1 : 0) + (filters.rating ? 1 : 0) +
    (filters.priceMax !== emptyFilters.priceMax ? 1 : 0);

  return (
    <div className="container-page py-8">
      {/* Top bar */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Browse cars</h1>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Icon name="pin" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Search by city — Milan, Rome, Paris…"
              className="input !pl-11"
            />
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={() => setDrawer(true)} className="btn btn-secondary relative lg:hidden">
              <Icon name="sliders" size={17} /> Filters
              {activeCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white">{activeCount}</span>
              )}
            </button>
            <div className="relative">
              <button onClick={() => setSortOpen((o) => !o)} className="btn btn-secondary" aria-haspopup="listbox">
                <Icon name="sort" size={16} />
                <span className="hidden sm:inline">{SORTS.find((s) => s.id === sort)!.label}</span>
                <Icon name="chevronDown" size={15} className="text-muted" />
              </button>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop" role="listbox">
                    {SORTS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setSort(s.id); setSortOpen(false); }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors hover:bg-panel ${sort === s.id ? 'text-ink' : 'text-ink-soft'}`}
                      >
                        {s.label}
                        {sort === s.id && <Icon name="check" size={16} className="text-accent" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-[84px] card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium text-ink">Filters</h2>
              {activeCount > 0 && <span className="badge badge-accent">{activeCount} active</span>}
            </div>
            <FilterPanel f={filters} set={setFilters} reset={reset} />
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          <p className="mb-4 text-[14px] text-muted">
            <span className="font-medium text-ink">{results.length}</span> cars available
            {city && <> in <span className="font-medium text-ink">{city}</span></>}
          </p>

          {results.length === 0 ? (
            <div className="card flex flex-col items-center gap-3 px-6 py-20 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-muted">
                <Icon name="search" size={26} />
              </span>
              <h3 className="mt-2 font-display text-xl font-semibold text-ink">No cars match your filters</h3>
              <p className="max-w-sm text-[14px] text-muted">Try widening your price range or clearing a few filters to see more of the fleet.</p>
              <button onClick={reset} className="btn btn-primary mt-2">Clear all filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((car, i) => (
                <CarCard key={car.id} car={car} priority={i < 6} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {drawer && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={() => setDrawer(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-[1.75rem] bg-surface shadow-pop animate-[fade-up_0.3s_ease]">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-display text-lg font-semibold text-ink">Filters</h2>
              <button onClick={() => setDrawer(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel" aria-label="Close">
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-2">
              <FilterPanel f={filters} set={setFilters} reset={reset} />
            </div>
            <div className="border-t border-line p-4">
              <button onClick={() => setDrawer(false)} className="btn btn-primary btn-block btn-lg">
                Show {results.length} cars
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
