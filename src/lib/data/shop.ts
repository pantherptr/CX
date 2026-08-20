import { products, bundles } from '../../data/products';
import type { Bundle, Product, ProductCategory } from '../../data/shop-types';

/**
 * CX Shop data-access layer — deliberately plain, synchronous functions
 * rather than hooks, because the catalog they read (`products.ts`) is a
 * static in-memory array with nothing to await.
 *
 * This is the exact seam `src/lib/data/cars.ts` had before its Supabase
 * migration: call sites already only ever touch functions from *this*
 * file, never `products.ts` directly. Swapping the catalog for a real
 * `products` table later means turning these into `async` fetchers and
 * wrapping call sites in `useEffect`/`useState` (or React Query) — the
 * same shift `fetchCars` → `useCars` already went through — without
 * touching a single component that only knows these function names.
 */

export type SortMode = 'featured' | 'newest' | 'best-selling' | 'price-asc' | 'price-desc';

export type ShopFilter = 'all' | ProductCategory | 'accessories' | 'best-sellers' | 'new-arrivals';

export function getAllProducts(): Product[] {
  return products;
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

/** "Accessories" spans both essentials that mount/plug into the car and
 *  the cleaning/organizing items — everything that isn't apparel or a
 *  limited drop. Used by the filter bar's "Car Accessories" chip, which
 *  is a narrower cut than the full "CX Essentials" category. */
const ACCESSORY_IDS = new Set([
  'p-phone-mount', 'p-usb-charger', 'p-charging-cable', 'p-key-tag',
  'p-cleaning-kit', 'p-detailing-cloth', 'p-car-organizer', 'p-emergency-kit',
]);

export function filterProducts(filter: ShopFilter): Product[] {
  switch (filter) {
    case 'all':
      return products;
    case 'best-sellers':
      return products.filter((p) => p.tags?.includes('best-seller'));
    case 'new-arrivals':
      return products.filter((p) => p.tags?.includes('new'));
    case 'accessories':
      return products.filter((p) => ACCESSORY_IDS.has(p.id));
    default:
      return products.filter((p) => p.category === filter);
  }
}

export function sortProducts(list: Product[], sort: SortMode): Product[] {
  const sorted = [...list];
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    case 'best-selling':
      return sorted.sort((a, b) => a.salesRank - b.salesRank);
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price);
    case 'featured':
    default:
      // "Featured" has no single natural key — best sellers first reads
      // as curated without needing a separate hand-picked flag.
      return sorted.sort((a, b) => a.salesRank - b.salesRank);
  }
}

export function getFeaturedProducts(limit = 4): Product[] {
  return sortProducts(products, 'best-selling').slice(0, limit);
}

export function getBestSellers(limit = 8): Product[] {
  return sortProducts(products, 'best-selling').slice(0, limit);
}

export function getNewArrivals(limit = 8): Product[] {
  return sortProducts(products, 'newest').slice(0, limit);
}

/** Same category, excluding the product itself — falls back to
 *  best-sellers if the category runs short so the rail is never sparse. */
export function getRelatedProducts(product: Product, limit = 4): Product[] {
  const sameCategory = products.filter((p) => p.category === product.category && p.id !== product.id);
  if (sameCategory.length >= limit) return sameCategory.slice(0, limit);
  const fill = products.filter((p) => p.id !== product.id && !sameCategory.includes(p));
  return [...sameCategory, ...fill].slice(0, limit);
}

export function getAllBundles(): Bundle[] {
  return bundles;
}

export function getBundleBySlug(slug: string): Bundle | undefined {
  return bundles.find((b) => b.slug === slug);
}

export function getBundleProducts(bundle: Bundle): Product[] {
  return bundle.productIds.map((id) => getProductById(id)).filter((p): p is Product => !!p);
}

/** What buying the bundle's products individually would cost — the
 *  saving shown next to the bundle price is always this minus the
 *  bundle's own price, never a hand-typed figure that can drift from
 *  the catalog. */
export function bundleIndividualTotal(bundle: Bundle): number {
  return getBundleProducts(bundle).reduce((sum, p) => sum + p.price, 0);
}
