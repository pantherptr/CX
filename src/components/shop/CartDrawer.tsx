import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useShop } from '../../lib/shopStore';
import { unsplash } from '../../lib/img';
import { eur, eur2 } from '../../lib/format';
import { Icon } from '../Icon';

const FREE_SHIPPING_THRESHOLD = 50;
const FLAT_SHIPPING = 4.9;

/** Rendered once at the app root (see `App.tsx`), controlled entirely by
 *  `useShop()` — any "Add to cart" anywhere in the app opens it, the
 *  same one-instance-at-the-root shape `Toaster` already uses for
 *  toasts. Mirrors the Navbar drawers' slide-in-right chrome so it
 *  reads as the same interaction language, not a bolted-on widget. */
export function CartDrawer() {
  const { cartOpen, closeCart, cartLines, cartCount, cartSubtotal, setQuantity, removeFromCart } = useShop();

  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeCart();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [cartOpen, closeCart]);

  if (!cartOpen) return null;

  const shipping = cartSubtotal === 0 || cartSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING;
  const total = cartSubtotal + shipping;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={closeCart} />
      <div className="absolute right-0 top-0 flex h-full w-[90%] max-w-sm animate-[slide-in-right_0.35s_var(--ease-out-expo)] flex-col bg-surface shadow-pop">
        <div className="flex h-[64px] shrink-0 items-center justify-between border-b border-line px-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Icon name="cart" size={19} /> Your cart
            {cartCount > 0 && <span className="text-[13px] font-normal text-muted">({cartCount})</span>}
          </h2>
          <button onClick={closeCart} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-panel" aria-label="Close cart">
            <Icon name="x" size={20} />
          </button>
        </div>

        {cartLines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-muted">
              <Icon name="cart" size={24} />
            </span>
            <p className="text-[14.5px] font-medium text-ink">Your cart is empty</p>
            <p className="text-[13px] text-muted">Add CX essentials to get your drive ready.</p>
            <Link to="/shop" onClick={closeCart} className="btn btn-primary btn-sm mt-2">
              Explore CX Shop
            </Link>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="flex flex-col gap-4">
                {cartLines.map((line) => (
                  <li key={`${line.productId}-${line.variantId ?? ''}`} className="flex gap-3">
                    <img
                      src={unsplash(line.image, 200)}
                      alt=""
                      className="h-18 w-18 shrink-0 rounded-xl border border-line object-cover"
                      style={{ height: 72, width: 72 }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{line.name}</p>
                      {line.variantLabel && <p className="text-[12px] text-muted">{line.variantLabel}</p>}
                      <p className="mt-0.5 text-[13.5px] font-semibold text-ink">{eur(line.price)}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex items-center rounded-full border border-line">
                          <button
                            onClick={() => setQuantity(line.productId, line.variantId, line.quantity - 1)}
                            className="grid h-7 w-7 place-items-center text-ink-soft hover:text-ink"
                            aria-label="Decrease quantity"
                          >
                            <Icon name="minus" size={13} />
                          </button>
                          <span className="w-6 text-center text-[12.5px] font-medium tabular-nums text-ink">{line.quantity}</span>
                          <button
                            onClick={() => setQuantity(line.productId, line.variantId, line.quantity + 1)}
                            className="grid h-7 w-7 place-items-center text-ink-soft hover:text-ink"
                            aria-label="Increase quantity"
                          >
                            <Icon name="plus" size={13} />
                          </button>
                        </div>
                        <button
                          onClick={() => removeFromCart(line.productId, line.variantId)}
                          className="text-[12.5px] font-medium text-muted underline-offset-2 hover:text-danger hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="shrink-0 border-t border-line p-5">
              <div className="flex flex-col gap-1.5 text-[13.5px]">
                <div className="flex items-center justify-between text-ink-soft">
                  <span>Subtotal</span>
                  <span className="font-medium text-ink">{eur2(cartSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-ink-soft">
                  <span>Shipping</span>
                  <span className="font-medium text-ink">{shipping === 0 ? 'Free' : eur2(shipping)}</span>
                </div>
                {shipping > 0 && (
                  <p className="text-[12px] text-muted">
                    Add {eur(FREE_SHIPPING_THRESHOLD - cartSubtotal)} more for free shipping.
                  </p>
                )}
                <div className="mt-1.5 flex items-center justify-between border-t border-line pt-2.5 text-[15px]">
                  <span className="font-semibold text-ink">Total</span>
                  <span className="font-semibold text-ink">{eur2(total)}</span>
                </div>
              </div>
              <button className="btn btn-accent-bright btn-lg btn-block mt-4">
                Checkout <Icon name="arrowRight" size={17} />
              </button>
              <Link to="/shop" onClick={closeCart} className="mt-2.5 block text-center text-[13px] font-medium text-muted hover:text-ink">
                Continue shopping
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
