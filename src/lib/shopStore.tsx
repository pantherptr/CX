import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useApp } from './store';
import { getProductById } from './data/shop';
import type { CartLine } from '../data/shop-types';

const CART_KEY = 'cx-shop-cart';
const WISHLIST_KEY = 'cx-shop-wishlist';

export interface CartLineDetailed extends CartLine {
  price: number;
  name: string;
  image: string;
  variantLabel?: string;
}

interface ShopState {
  cart: CartLine[];
  cartLines: CartLineDetailed[];
  cartCount: number;
  cartSubtotal: number;
  addToCart: (productId: string, opts?: { variantId?: string; quantity?: number }) => void;
  removeFromCart: (productId: string, variantId?: string) => void;
  setQuantity: (productId: string, variantId: string | undefined, quantity: number) => void;
  clearCart: () => void;
  wishlist: Set<string>;
  toggleWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const Ctx = createContext<ShopState | null>(null);

const sameLine = (a: CartLine, productId: string, variantId?: string) =>
  a.productId === productId && a.variantId === variantId;

/**
 * Cart + wishlist state for the CX Shop. LocalStorage-backed rather than
 * Supabase-backed like `AppProvider`'s car favorites, since there is no
 * real order/inventory backend yet (see `src/lib/data/shop.ts`'s header)
 * — this hook's shape is what stays stable when that arrives; only the
 * persistence underneath swaps out.
 */
export function ShopProvider({ children }: { children: ReactNode }) {
  const { toast } = useApp();
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [wishlist, setWishlist] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(WISHLIST_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // Storage unavailable — the cart just won't persist across visits.
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify([...wishlist]));
    } catch {
      // Storage unavailable — the wishlist just won't persist across visits.
    }
  }, [wishlist]);

  const addToCart = useCallback(
    (productId: string, opts?: { variantId?: string; quantity?: number }) => {
      const product = getProductById(productId);
      if (!product) return;
      const variantId = opts?.variantId;
      const quantity = opts?.quantity ?? 1;
      setCart((prev) => {
        const existing = prev.find((l) => sameLine(l, productId, variantId));
        if (existing) {
          return prev.map((l) =>
            sameLine(l, productId, variantId) ? { ...l, quantity: l.quantity + quantity } : l,
          );
        }
        return [...prev, { productId, variantId, quantity }];
      });
      toast({ title: `${product.name} added to cart`, icon: 'cart' });
      setCartOpen(true);
    },
    [toast],
  );

  const removeFromCart = useCallback((productId: string, variantId?: string) => {
    setCart((prev) => prev.filter((l) => !sameLine(l, productId, variantId)));
  }, []);

  const setQuantity = useCallback(
    (productId: string, variantId: string | undefined, quantity: number) => {
      if (quantity <= 0) {
        setCart((prev) => prev.filter((l) => !sameLine(l, productId, variantId)));
        return;
      }
      setCart((prev) => prev.map((l) => (sameLine(l, productId, variantId) ? { ...l, quantity } : l)));
    },
    [],
  );

  const clearCart = useCallback(() => setCart([]), []);

  const toggleWishlist = useCallback(
    (productId: string) => {
      const product = getProductById(productId);
      setWishlist((prev) => {
        const next = new Set(prev);
        const was = next.has(productId);
        if (was) next.delete(productId);
        else next.add(productId);
        toast({
          title: was ? 'Removed from wishlist' : 'Saved to wishlist',
          desc: !was && product ? product.name : undefined,
          icon: 'heart',
        });
        return next;
      });
    },
    [toast],
  );

  const isWishlisted = useCallback((productId: string) => wishlist.has(productId), [wishlist]);

  const cartLines = useMemo<CartLineDetailed[]>(
    () =>
      cart
        .map((line): CartLineDetailed | null => {
          const product = getProductById(line.productId);
          if (!product) return null;
          const variantLabel = product.variants?.find((v) => v.id === line.variantId)?.label;
          return {
            ...line,
            price: product.price,
            name: product.name,
            image: product.images[0],
            variantLabel,
          };
        })
        .filter((l): l is CartLineDetailed => l !== null),
    [cart],
  );

  const cartCount = useMemo(() => cart.reduce((sum, l) => sum + l.quantity, 0), [cart]);
  const cartSubtotal = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.price * l.quantity, 0),
    [cartLines],
  );

  const value = useMemo(
    () => ({
      cart,
      cartLines,
      cartCount,
      cartSubtotal,
      addToCart,
      removeFromCart,
      setQuantity,
      clearCart,
      wishlist,
      toggleWishlist,
      isWishlisted,
      cartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
    }),
    [cart, cartLines, cartCount, cartSubtotal, addToCart, removeFromCart, setQuantity, clearCart, wishlist, toggleWishlist, isWishlisted, cartOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useShop() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useShop must be used within ShopProvider');
  return ctx;
}
