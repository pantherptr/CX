import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getProductBySlug, getRelatedProducts } from '../lib/data/shop';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { Icon } from '../components/Icon';
import { Stars } from '../components/primitives';
import { Reveal } from '../components/motion';
import { ProductCard } from '../components/shop/ProductCard';
import { useShop } from '../lib/shopStore';
import NotFound from './NotFound';

export default function ProductDetails() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const product = slug ? getProductBySlug(slug) : undefined;
  const { addToCart, toggleWishlist, isWishlisted, openCart } = useShop();

  const [activeImage, setActiveImage] = useState(0);
  const [variantId, setVariantId] = useState<string | undefined>(product?.variants?.[0]?.id);
  const [quantity, setQuantity] = useState(1);

  if (!product) return <NotFound />;

  const related = getRelatedProducts(product, 4);
  const wishlisted = isWishlisted(product.id);

  const buyNow = () => {
    addToCart(product.id, { variantId, quantity });
    openCart();
  };

  return (
    <div className="container-page py-8">
      <button onClick={() => navigate(-1)} className="mb-6 inline-flex items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-ink">
        <Icon name="chevronLeft" size={16} /> Back
      </button>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        {/* --------------------------- Gallery --------------------------- */}
        <div className="min-w-0">
          <Reveal>
            <div className="relative aspect-square overflow-hidden rounded-[1.75rem] bg-panel-2">
              <img
                key={activeImage}
                src={unsplash(product.images[activeImage], 1000)}
                alt={product.name}
                className="h-full w-full animate-fade-in object-cover"
              />
              {product.tags?.includes('limited') && (
                <span className="badge badge-glass absolute left-4 top-4">
                  <Icon name="sparkles" size={12} className="text-accent" /> Limited
                </span>
              )}
              {product.compareAtPrice && (
                <span className="badge badge-accent absolute right-4 top-4">
                  Save {eur(product.compareAtPrice - product.price)}
                </span>
              )}
            </div>
          </Reveal>
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-2.5">
              {product.images.map((img, i) => (
                <button
                  key={img + i}
                  onClick={() => setActiveImage(i)}
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 transition-colors ${
                    activeImage === i ? 'border-accent' : 'border-transparent hover:border-line-strong'
                  }`}
                >
                  <img src={unsplash(img, 200)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---------------------------- Info ---------------------------- */}
        <div className="min-w-0">
          <Reveal delay={60}>
            <p className="eyebrow">
              {product.category === 'essentials' ? 'CX Essentials' : product.category === 'lifestyle' ? 'CX Lifestyle' : 'CX Limited'}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">{product.name}</h1>
            <p className="mt-2 text-[15px] text-muted">{product.tagline}</p>

            <div className="mt-4 flex items-center gap-3">
              <Stars value={product.rating} size={15} />
              <span className="text-[13.5px] text-muted">
                {product.rating.toFixed(1)} ({product.reviewCount} reviews)
              </span>
            </div>

            {product.limited?.note && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-star/25 bg-star/10 px-4 py-3 text-[13.5px] font-medium text-star">
                <Icon name="sparkles" size={16} />
                {product.limited.note}
                {product.limited.stockLeft !== undefined && ` — ${product.limited.stockLeft} left`}
              </div>
            )}

            <p className="mt-6 text-ink">
              <span className="text-[28px] font-semibold">{eur(product.price)}</span>
              {product.compareAtPrice && (
                <span className="ml-2 text-[16px] text-faint line-through">{eur(product.compareAtPrice)}</span>
              )}
            </p>

            <p className="mt-4 max-w-lg text-[14.5px] leading-relaxed text-ink-soft text-pretty">{product.description}</p>

            {product.variants && product.variants.length > 0 && (
              <div className="mt-6">
                <p className="field-label">Options</p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVariantId(v.id)}
                      className="chip"
                      data-active={variantId === v.id}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-4">
              <div>
                <p className="field-label">Quantity</p>
                <div className="flex items-center rounded-full border border-line-strong">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="grid h-11 w-11 place-items-center text-ink-soft hover:text-ink"
                    aria-label="Decrease quantity"
                  >
                    <Icon name="minus" size={15} />
                  </button>
                  <span className="w-8 text-center text-[15px] font-medium tabular-nums text-ink">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    className="grid h-11 w-11 place-items-center text-ink-soft hover:text-ink"
                    aria-label="Increase quantity"
                  >
                    <Icon name="plus" size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => addToCart(product.id, { variantId, quantity })} className="btn btn-secondary btn-lg flex-1">
                <Icon name="cart" size={17} /> Add to cart
              </button>
              <button onClick={buyNow} className="btn btn-accent-bright btn-lg flex-1">
                Buy now <Icon name="arrowRight" size={17} />
              </button>
              <button
                onClick={() => toggleWishlist(product.id)}
                aria-label={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
                aria-pressed={wishlisted}
                className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl border border-line-strong text-ink transition-colors hover:border-ink"
              >
                <Icon name="heart" size={19} fill={wishlisted} className={wishlisted ? 'text-[#e2384d]' : ''} />
              </button>
            </div>

            <div className="mt-6 flex items-center gap-2.5 rounded-2xl bg-panel px-4 py-3 text-[13px] text-ink-soft">
              <Icon name="truck" size={16} className="text-muted" />
              Free shipping on orders over {eur(50)} · Ships in 2–4 business days
            </div>

            {product.specs && product.specs.length > 0 && (
              <div className="mt-8 border-t border-line pt-6">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink">Specifications</h2>
                <dl className="mt-3 flex flex-col gap-2.5">
                  {product.specs.map((s) => (
                    <div key={s.label} className="flex items-center justify-between text-[14px]">
                      <dt className="text-muted">{s.label}</dt>
                      <dd className="font-medium text-ink">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </Reveal>
        </div>
      </div>

      {/* ------------------------ Related products ------------------------ */}
      {related.length > 0 && (
        <section className="mt-16 border-t border-line pt-10">
          <h2 className="font-display text-2xl font-semibold text-ink">You might also like</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {related.map((p, i) => (
              <Reveal key={p.id} delay={i * 60}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 text-center">
        <Link to="/shop" className="text-[13.5px] font-medium text-muted hover:text-ink">
          ← Back to CX Shop
        </Link>
      </div>
    </div>
  );
}
