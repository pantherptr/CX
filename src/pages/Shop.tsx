import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductCard } from '../components/shop/ProductCard';
import { SectionHead } from '../components/primitives';
import { Reveal } from '../components/motion';
import { Icon, type IconName } from '../components/Icon';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import {
  filterProducts,
  sortProducts,
  getBestSellers,
  getAllBundles,
  getBundleProducts,
  bundleIndividualTotal,
  type ShopFilter,
  type SortMode,
} from '../lib/data/shop';
import type { ProductCategory } from '../data/shop-types';

const FILTERS: { id: ShopFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'essentials', label: 'CX Essentials' },
  { id: 'accessories', label: 'Car Accessories' },
  { id: 'lifestyle', label: 'CX Lifestyle' },
  { id: 'limited', label: 'Limited' },
  { id: 'best-sellers', label: 'Best Sellers' },
  { id: 'new-arrivals', label: 'New Arrivals' },
];

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'newest', label: 'Newest' },
  { id: 'best-selling', label: 'Best Selling' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
];

const CATEGORY_TILES: { id: ProductCategory; label: string; desc: string; icon: IconName; image: string }[] = [
  {
    id: 'essentials',
    label: 'CX Essentials',
    desc: 'Everything that actually lives in the car.',
    icon: 'car',
    image: 'photo-1592890288564-76628a30a657',
  },
  {
    id: 'lifestyle',
    label: 'CX Lifestyle',
    desc: 'Premium pieces for outside the car.',
    icon: 'shoppingBag',
    image: 'photo-1556821840-3a63f95609a7',
  },
  {
    id: 'limited',
    label: 'CX Limited',
    desc: 'Numbered runs. Once they\'re gone, they\'re gone.',
    icon: 'sparkles',
    image: 'photo-1620799140408-edc6dcb6d633',
  },
];

export default function Shop() {
  const [filter, setFilter] = useState<ShopFilter>('all');
  const [sort, setSort] = useState<SortMode>('featured');
  const [sortOpen, setSortOpen] = useState(false);

  const products = useMemo(() => sortProducts(filterProducts(filter), sort), [filter, sort]);
  const bestSellers = useMemo(() => getBestSellers(4), []);
  const bundle = getAllBundles()[0];
  const bundleProducts = bundle ? getBundleProducts(bundle) : [];
  const bundleSavings = bundle ? bundleIndividualTotal(bundle) - bundle.price : 0;

  return (
    <div>
      {/* ---------------------------- Hero ---------------------------- */}
      <section className="relative overflow-hidden bg-noir">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(120% 90% at 50% -10%, rgba(0,212,71,0.28), transparent 60%)' }}
        />
        <div className="container-page relative py-16 text-center sm:py-24">
          <Reveal>
            <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-accent-bright">CX Automotive Experience</p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-4 font-display text-4xl font-semibold text-on-noir sm:text-6xl">CX Shop</h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-on-noir-muted sm:text-[18px]">
              Everything for your drive.
            </p>
          </Reveal>
          <Reveal delay={190}>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-on-noir-muted/80">
              Upgrade your drive with CX essentials.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ------------------------ Category tiles ------------------------ */}
      <section className="container-page py-10 sm:py-14">
        <div className="grid gap-4 sm:grid-cols-3">
          {CATEGORY_TILES.map((t, i) => (
            <Reveal key={t.id} delay={i * 60}>
              <button
                onClick={() => setFilter(t.id)}
                className="group relative block h-48 w-full overflow-hidden rounded-[1.75rem] text-left sm:h-56"
              >
                <img
                  src={unsplash(t.image, 700)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-noir/90 via-noir/25 to-transparent" />
                <div className="relative flex h-full flex-col justify-end p-5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur">
                    <Icon name={t.icon} size={17} />
                  </span>
                  <h3 className="mt-3 font-display text-xl font-semibold text-white">{t.label}</h3>
                  <p className="mt-1 text-[13px] text-white/70">{t.desc}</p>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------- Best sellers ------------------------- */}
      <section className="container-page py-8 sm:py-10">
        <Reveal>
          <SectionHead eyebrow="Most reached for" title="CX Best Sellers" />
        </Reveal>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {bestSellers.map((p, i) => (
            <Reveal key={p.id} delay={i * 60}>
              <ProductCard product={p} priority={i < 2} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------- Bundle ---------------------------- */}
      {bundle && (
        <section className="container-page py-8 sm:py-10">
          <Reveal>
            <div className="overflow-hidden rounded-[1.75rem] border border-line bg-panel">
              <div className="grid gap-0 sm:grid-cols-[1fr_1.2fr]">
                <div className="relative aspect-[4/3] sm:aspect-auto">
                  <img src={unsplash(bundle.image, 900)} alt="" className="h-full w-full object-cover" />
                  <span className="badge badge-ink absolute left-4 top-4">
                    <Icon name="package" size={12} /> Bundle
                  </span>
                </div>
                <div className="flex flex-col justify-center p-6 sm:p-9">
                  <p className="eyebrow">Save when you drive prepared</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">{bundle.name}</h2>
                  <p className="mt-2 text-[14.5px] text-muted">{bundle.tagline}</p>
                  <ul className="mt-4 flex flex-col gap-1.5">
                    {bundleProducts.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 text-[13.5px] text-ink-soft">
                        <Icon name="check" size={14} className="text-accent" /> {p.name}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex flex-wrap items-end gap-3">
                    <p className="text-ink">
                      <span className="text-2xl font-semibold">{eur(bundle.price)}</span>
                      <span className="ml-2 text-[14px] text-faint line-through">{eur(bundleIndividualTotal(bundle))}</span>
                    </p>
                    <span className="badge badge-accent">Save {eur(bundleSavings)}</span>
                  </div>
                  <Link to={`/shop/${bundleProducts[0]?.slug ?? ''}`} className="btn btn-accent-bright btn-lg mt-6 w-fit">
                    View CX Drive Kit <Icon name="arrowRight" size={17} />
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      )}

      {/* ------------------------- Full catalog ------------------------- */}
      <section className="container-page py-10 sm:py-14">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-2xl font-semibold text-ink">Shop all</h2>
          <div className="relative">
            <button onClick={() => setSortOpen((o) => !o)} className="btn btn-secondary" aria-haspopup="listbox">
              <Icon name="sort" size={16} />
              <span>{SORTS.find((s) => s.id === sort)!.label}</span>
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

        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className="chip shrink-0" data-active={filter === f.id}>
              {f.label}
            </button>
          ))}
        </div>

        {products.length === 0 ? (
          <p className="mt-10 text-center text-[14px] text-muted">No products match this filter yet.</p>
        ) : (
          <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 8) * 40}>
                <ProductCard product={p} priority={i < 4} />
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* --------------------------- Positioning --------------------------- */}
      <section className="border-t border-line bg-panel/50 py-12 text-center">
        <p className="font-display text-lg font-medium text-ink sm:text-xl">
          Rent. Drive. Experience. CX.
        </p>
      </section>
    </div>
  );
}
