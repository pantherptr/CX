import { Link } from 'react-router-dom';
import type { Product } from '../../data/shop-types';
import { unsplash } from '../../lib/img';
import { eur } from '../../lib/format';
import { useShop } from '../../lib/shopStore';
import { Icon } from '../Icon';
import { Modal } from '../primitives';

/** A fast glance at a product without leaving the grid — mirrors
 *  `CarQuickView`'s shape exactly so the two feel like one interaction
 *  language rather than two separately-invented modals. */
export function ProductQuickView({
  product,
  open,
  onClose,
}: {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}) {
  const { addToCart } = useShop();
  if (!product) return null;

  return (
    <Modal open={open} onClose={onClose} className="max-w-lg overflow-hidden rounded-[1.75rem]" labelledBy="product-quick-view-title">
      <div className="relative aspect-square bg-panel-2">
        <img src={unsplash(product.images[0], 900)} alt={product.name} className="h-full w-full object-cover" />
        <button
          onClick={onClose}
          className="glass absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-ink shadow-hair"
          aria-label="Close quick view"
        >
          <Icon name="x" size={18} />
        </button>
        {product.tags?.includes('limited') && (
          <span className="badge badge-glass absolute left-3 top-3">
            <Icon name="sparkles" size={12} className="text-accent" /> Limited
          </span>
        )}
      </div>

      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="product-quick-view-title" className="font-display text-xl font-semibold text-ink">
              {product.name}
            </h2>
            <p className="mt-0.5 text-[13.5px] text-muted">{product.tagline}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-ink">
            <Icon name="star" size={14} className="text-star" /> {product.rating.toFixed(1)}
          </span>
        </div>

        <p className="mt-4 line-clamp-3 text-[14px] leading-relaxed text-muted text-pretty">{product.description}</p>

        {product.limited?.note && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-star/10 px-3 py-1.5 text-[12px] font-medium text-star">
            <Icon name="sparkles" size={13} /> {product.limited.note}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-line pt-5">
          <p className="text-ink">
            <span className="text-xl font-semibold">{eur(product.price)}</span>
            {product.compareAtPrice && (
              <span className="ml-1.5 text-[13.5px] text-faint line-through">{eur(product.compareAtPrice)}</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => addToCart(product.id)} className="btn btn-secondary btn-sm">
              <Icon name="cart" size={15} /> Add to cart
            </button>
            <Link to={`/shop/${product.slug}`} onClick={onClose} className="btn btn-primary btn-sm">
              View details <Icon name="arrowRight" size={15} />
            </Link>
          </div>
        </div>
      </div>
    </Modal>
  );
}
