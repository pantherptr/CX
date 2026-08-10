import { cars } from '../data/cars';
import { categories } from '../data/content';
import { hosts } from '../data/hosts';

/**
 * Facts measured from the data the app actually ships with.
 *
 * Nothing here is authored by hand — every value is counted from
 * `src/data`, so the Command Center can display figures without
 * inventing them. If the catalogue changes, these change with it.
 */

const cities = [...new Set(cars.map((c) => c.city))];
const prices = cars.map((c) => c.pricePerDay);
const electric = cars.filter((c) => c.fuel === 'Electric' || c.fuel === 'Hybrid');

export const catalogue = {
  vehicles: cars.length,
  cities: cities.length,
  cityNames: cities,
  categories: categories.length,
  hosts: Object.keys(hosts).length,
  instantBook: cars.filter((c) => c.instantBook).length,
  electrified: electric.length,
  priceFrom: Math.min(...prices),
  priceTo: Math.max(...prices),
  /** Mean of the per-vehicle ratings carried in the catalogue. */
  meanRating: cars.reduce((sum, c) => sum + c.rating, 0) / cars.length,
};
