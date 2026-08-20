/**
 * CX Shop domain types.
 *
 * Mirrors the shape convention `src/data/types.ts` already established
 * for cars/hosts/reviews: a plain, backend-agnostic interface that the
 * UI consumes, currently populated from the static catalog in
 * `products.ts`. When real inventory/orders exist, only
 * `src/lib/data/shop.ts`'s fetchers need to change — every component
 * below that already speaks these types unchanged, the same migration
 * path `src/lib/data/cars.ts` already walked from mock to Supabase.
 */

export type ProductCategory = 'essentials' | 'lifestyle' | 'limited';

export type ProductTag = 'best-seller' | 'new' | 'limited';

export interface ProductVariant {
  id: string;
  label: string;
}

export interface ProductSpec {
  label: string;
  value: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  /** One line, shown on the card. */
  tagline: string;
  /** Longer copy for the product detail page. */
  description: string;
  price: number;
  /** Present only when the product is discounted from a former price —
   *  drives the "was / now" treatment, never fabricated for products
   *  that were never priced higher. */
  compareAtPrice?: number;
  /** Unsplash photo ids, same convention as `unsplash()` in `lib/img.ts`. */
  images: string[];
  rating: number;
  reviewCount: number;
  variants?: ProductVariant[];
  specs?: ProductSpec[];
  tags?: ProductTag[];
  /** Scarcity messaging for CX Limited — omitted entirely for regular stock
   *  rather than defaulting to a fake number. */
  limited?: { stockLeft?: number; note?: string };
  /** ISO date — drives the "Newest" sort. */
  createdAt: string;
  /** Lower = sells more — drives "Best Selling" sort and the Best
   *  Sellers rail. Not shown to shoppers directly. */
  salesRank: number;
}

export interface Bundle {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  productIds: string[];
  /** The bundle's own price — always below the sum of its members'
   *  individual prices; the saving is derived, never hand-typed twice. */
  price: number;
  image: string;
}

export interface CartLine {
  productId: string;
  variantId?: string;
  quantity: number;
}
