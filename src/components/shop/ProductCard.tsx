import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../../data/shop-types';
import { unsplash } from '../../lib/img';
import { eur } from '../../lib/format';
import { useShop } from '../../lib/shopStore';
import { Icon } from '../Icon';
import { Img, useTilt } from '../motion';
import { ProductQuickView } from './ProductQuickView';

function WishlistButton({ productId }: { productId: string }) {
  const { isWishlisted, toggleWishlist } = useShop();
  const fav = isWishlisted(productId);
  const [popping, setPopping] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        toggleWishlist(productId);
        setPopping(true);
      }}
      onAnimationEnd={() => setPopping(false)}
      aria-label={fav ? 'Remove from wishlist' : 'Save to wishlist'}
      aria-pressed={fav}
      className={`pressable grid h-9 w-9 place-items-center rounded-full bg-white/90 backdrop-blur shadow-hair transition-transform duration-200 hover:scale-110 ${
        popping ? 'animate-heart-pop' : ''
      }`}
    >
      <Icon name="heart" size={18} fill={fav} className={fav ? 'text-[#e2384d]' : 'text-ink'} strokeWidth={1.8} />
    </button>
  );
}

export function ProductCard({ product, priority }: { product: Product; priority?: boolean }) {
  const { ref: tiltRef, style: tiltStyle } = useTilt<HTMLAnchorElement>({ max: 5, lift: 1.012 });
  const [quickView, setQuickView] = useState(false);
  const { addToCart } = useShop();

  // At most one badge — LIMITED outranks BEST SELLER outranks NEW, so a
  // card never has to juggle more than one claim about itself.
  const badge = product.tags?.includes('limited')
    ? { label: 'Limited', icon: 'sparkles' as const }
    : product.tags?.includes('best-seller')
      ? { label: 'Best seller', icon: 'trending' as const }
      : product.tags?.includes('new')
        ? { label: 'New', icon: 'sparkles' as const }
        : null;

  return (
    <>
      <Link
        ref={tiltRef}
        to={`/shop/${product.slug}`}
        className="group block"
        style={{ ...tiltStyle, transformStyle: 'preserve-3d' }}
      >
        <article className="card card-hover overflow-hidden transition-colors duration-300 group-hover:border-accent-bright/25">
          <div className="relative aspect-square overflow-hidden bg-panel-2">
            <Img
              src={unsplash(product.images[0], 700)}
              alt={product.name}
              loading={priority ? 'eager' : 'lazy'}
              className="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
            />
            <div className="absolute left-3 top-3 flex gap-2">
              {badge && (
                <span className="badge badge-glass">
                  <Icon name={badge.icon} size={12} className="text-accent-bright" /> {badge.label}
                </span>
              )}
            </div>
            <div className="absolute right-3 top-3">
              <WishlistButton productId={product.id} />
            </div>

            <button
              onClick={(e) => {
                e.preventDefault();
                setQuickView(true);
              }}
              className="glass pressable absolute bottom-3 left-1/2 flex -translate-x-1/2 translate-y-1 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-medium text-ink opacity-70 shadow-hair transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 sm:opacity-0"
            >
              <Icon name="grid" size={13} /> Quick view
            </button>
          </div>

          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-medium text-ink">{product.name}</h3>
                <p className="mt-0.5 truncate text-[13px] text-muted">{product.tagline}</p>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-1 text-[12.5px] text-muted">
              <Icon name="star" size={12} className="text-star" />
              <span className="font-medium text-ink">{product.rating.toFixed(1)}</span>
              <span>({product.reviewCount})</span>
            </div>

            <div className="mt-3.5 flex items-end justify-between border-t border-line pt-3.5">
              <p className="text-ink">
                <span className="text-[17px] font-semibold">{eur(product.price)}</span>
                {product.compareAtPrice && (
                  <span className="ml-1.5 text-[13px] text-faint line-through">{eur(product.compareAtPrice)}</span>
                )}
              </p>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  addToCart(product.id);
                }}
                className="pressable inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-black"
              >
                <Icon name="cart" size={14} /> Add
              </button>
            </div>
          </div>
        </article>
      </Link>

      <ProductQuickView product={quickView ? product : null} open={quickView} onClose={() => setQuickView(false)} />
    </>
  );
}
