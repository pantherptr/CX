import type { Car, CarCategory } from '../data/types';
import type { IconName } from '../components/Icon';

/**
 * Deterministic car-matching engine — the single source of truth behind
 * both CX Concierge and the Garage's "Find My Next CX" quiz. Every score
 * is computed from real `Car` attributes (src/data/types.ts) against the
 * user's stated preferences; nothing is random, and nothing here invents
 * a car, price, spec, or availability. It's a pure function of (cars,
 * preferences) → ranked cars, so it's trivially cacheable and an AI layer
 * could later replace `scoreCar`/`explain` without touching either caller.
 */

export type DriveType = 'city' | 'weekend' | 'road-trip' | 'business' | 'luxury' | 'performance' | 'night' | 'occasion';
export type Priority = 'performance' | 'comfort' | 'luxury' | 'style' | 'space' | 'efficiency' | 'technology';
export type PassengerBand = '1-2' | '3-4' | '5+';
export type BudgetBand = 'flexible' | 'low' | 'medium' | 'premium' | 'luxury';

export interface Preferences {
  driveType: DriveType | null;
  priorities: Priority[];
  passengers: PassengerBand | null;
  budget: BudgetBand | null;
  /** Exact daily cap in EUR — takes precedence over `budget` when set. */
  maxPricePerDay?: number | null;
  city: string | null;
}

export const DRIVE_TYPES: { id: DriveType; label: string; icon: IconName; blurb: string }[] = [
  { id: 'city', label: 'City', icon: 'pin', blurb: 'Nimble around town' },
  { id: 'weekend', label: 'Weekend', icon: 'sun', blurb: 'Two days, open road' },
  { id: 'road-trip', label: 'Road Trip', icon: 'route', blurb: 'Long-haul comfort' },
  { id: 'business', label: 'Business', icon: 'bag', blurb: 'Arrive in style' },
  { id: 'luxury', label: 'Luxury', icon: 'gem', blurb: 'The finest ride' },
  { id: 'performance', label: 'Performance', icon: 'gauge', blurb: 'Pure driving thrill' },
  { id: 'night', label: 'Night Drive', icon: 'sparkles', blurb: 'After dark, in style' },
  { id: 'occasion', label: 'Special Occasion', icon: 'star', blurb: 'A moment to remember' },
];

export const PRIORITIES: { id: Priority; label: string; icon: IconName }[] = [
  { id: 'performance', label: 'Performance', icon: 'gauge' },
  { id: 'comfort', label: 'Comfort', icon: 'seat' },
  { id: 'luxury', label: 'Luxury', icon: 'gem' },
  { id: 'style', label: 'Style', icon: 'sparkles' },
  { id: 'space', label: 'Space', icon: 'bag' },
  { id: 'efficiency', label: 'Fuel efficiency', icon: 'leaf' },
  { id: 'technology', label: 'Technology', icon: 'bolt' },
];

export const PASSENGER_BANDS: { id: PassengerBand; label: string }[] = [
  { id: '1-2', label: '1–2' },
  { id: '3-4', label: '3–4' },
  { id: '5+', label: '5+' },
];

export const BUDGET_BANDS: { id: BudgetBand; label: string; note: string }[] = [
  { id: 'flexible', label: 'Flexible', note: 'Show me the best' },
  { id: 'low', label: 'Low', note: 'Up to €80/day' },
  { id: 'medium', label: 'Medium', note: '€80–200/day' },
  { id: 'premium', label: 'Premium', note: '€200–400/day' },
  { id: 'luxury', label: 'Luxury', note: '€400+/day' },
];

/** Upper price bound (EUR/day) implied by each budget band — `Infinity`
 *  for flexible/luxury. Kept as a soft signal for scoring, not a hard
 *  filter, so a car €10 over budget still appears (ranked lower) rather
 *  than vanishing. `maxPricePerDay`, when set, IS treated as a hard cap. */
const BUDGET_CEIL: Record<BudgetBand, number> = {
  flexible: Infinity,
  low: 80,
  medium: 200,
  premium: 400,
  luxury: Infinity,
};

/** Which categories each drive type leans toward — the strongest single
 *  signal, mirroring how a human concierge would first narrow the fleet. */
const DRIVE_TYPE_CATEGORIES: Record<DriveType, CarCategory[]> = {
  city: ['Economy', 'Electric'],
  weekend: ['Convertible', 'Sport'],
  'road-trip': ['SUV', 'Family'],
  business: ['Luxury', 'Electric'],
  luxury: ['Luxury'],
  performance: ['Sport'],
  night: ['Sport', 'Luxury', 'Convertible'],
  occasion: ['Luxury', 'Convertible', 'Sport'],
};

const passengerMin: Record<PassengerBand, number> = { '1-2': 1, '3-4': 3, '5+': 5 };

/** Signals a returning user's own history contributes — all optional, all
 *  real (favorites the user actually saved, categories they actually
 *  rented). Absent data simply contributes nothing. */
export interface PersonalSignals {
  favoriteCategories?: CarCategory[];
  rentedCategories?: CarCategory[];
  rentedCarIds?: string[];
}

export interface ScoredCar {
  car: Car;
  /** 0–100, presentation-friendly. Derived from the raw score relative to
   *  a theoretical best, so the top match reads as a high % without ever
   *  being a hand-picked number. */
  match: number;
  /** Short, true reasons this car scored — only ever facts from the car
   *  row and the user's own answers, never an unsupported claim. */
  reasons: string[];
}

const MAX_RAW = 60; // ceiling used to normalise raw score → 0–100%

function rawScore(car: Car, prefs: Preferences, personal: PersonalSignals): number {
  let s = 20; // baseline so every real car reads as a plausible match, not 0%
  const reasonsFired = new Set<string>();

  // Drive type → category (strongest signal).
  if (prefs.driveType && DRIVE_TYPE_CATEGORIES[prefs.driveType].includes(car.category)) {
    s += 14;
    reasonsFired.add('drive');
  }

  // Priorities.
  for (const p of prefs.priorities) {
    if (p === 'performance' && car.category === 'Sport') s += 6;
    if (p === 'luxury' && car.category === 'Luxury') s += 6;
    if (p === 'comfort') s += Math.min(4, car.seats * 0.6);
    if (p === 'space') s += Math.min(6, car.seats * 0.5 + car.luggage);
    if (p === 'style' && (car.category === 'Convertible' || car.category === 'Sport')) s += 4;
    if (p === 'efficiency' && (car.fuel === 'Electric' || car.fuel === 'Hybrid')) s += 6;
    if (p === 'technology' && (car.category === 'Electric' || car.fuel === 'Electric')) s += 4;
  }

  // Passengers — a hard-ish need: enough seats scores, too few is penalised.
  if (prefs.passengers) {
    const need = passengerMin[prefs.passengers];
    if (car.seats >= need) s += 6;
    else s -= 10;
  }

  // Budget — soft signal (a hard cap is applied separately in `matchCars`).
  const ceil = prefs.budget ? BUDGET_CEIL[prefs.budget] : Infinity;
  if (Number.isFinite(ceil)) {
    if (car.pricePerDay <= ceil) s += 5;
    else s -= Math.min(12, (car.pricePerDay - ceil) / 20);
  }
  if (prefs.budget === 'luxury' && car.pricePerDay >= 300) s += 3;

  // Location — same city is a real convenience signal, never a hard filter.
  if (prefs.city && car.city.toLowerCase() === prefs.city.toLowerCase()) s += 5;

  // Personalisation — real history only.
  if (personal.favoriteCategories?.includes(car.category)) s += 4;
  if (personal.rentedCategories?.includes(car.category)) s += 3;

  // Quality tiebreaker.
  s += car.rating;

  return Math.max(0, s);
}

/** Human-readable, strictly-true reasons the top card can show as ✓ rows. */
export function explain(car: Car, prefs: Preferences): string[] {
  const out: string[] = [];
  if (prefs.driveType && DRIVE_TYPE_CATEGORIES[prefs.driveType].includes(car.category)) {
    const label = DRIVE_TYPES.find((d) => d.id === prefs.driveType)?.label ?? '';
    out.push(`Built for a ${label.toLowerCase()} drive`);
  }
  if (prefs.passengers) {
    const need = passengerMin[prefs.passengers];
    if (car.seats >= need) out.push(`Seats ${car.seats} — fits ${prefs.passengers} passengers`);
  }
  for (const p of prefs.priorities) {
    if (p === 'performance' && car.category === 'Sport') out.push('Performance-focused');
    if (p === 'luxury' && car.category === 'Luxury') out.push('Luxury class');
    if (p === 'efficiency' && (car.fuel === 'Electric' || car.fuel === 'Hybrid')) out.push(`${car.fuel} — efficient`);
    if (p === 'space' && car.luggage >= 3) out.push(`${car.luggage} bags of luggage`);
  }
  const ceil = prefs.budget ? BUDGET_CEIL[prefs.budget] : Infinity;
  if (prefs.maxPricePerDay && car.pricePerDay <= prefs.maxPricePerDay) out.push('Within your budget');
  else if (Number.isFinite(ceil) && car.pricePerDay <= ceil) out.push('Fits your budget');
  if (prefs.city && car.city.toLowerCase() === prefs.city.toLowerCase()) out.push(`Available in ${car.city}`);
  return out.slice(0, 5);
}

/** One-sentence "why CX chose this", assembled from the same true signals
 *  plus the car's own real category — every clause is a fact, never a
 *  claim the data can't back. */
export function summary(car: Car, prefs: Preferences): string {
  const drive = DRIVE_TYPES.find((d) => d.id === prefs.driveType)?.label.toLowerCase();
  const bits: string[] = [];
  if (drive) bits.push(`a ${drive} drive`);
  if (prefs.passengers) bits.push(`${prefs.passengers} passengers`);
  const lead = bits.length
    ? `A ${car.category.toLowerCase()} pick for ${bits.join(' with ')}.`
    : `A strong ${car.category.toLowerCase()} all-rounder.`;
  const topPriority = prefs.priorities[0];
  const priorityLabel = PRIORITIES.find((p) => p.id === topPriority)?.label.toLowerCase();
  const tail = priorityLabel ? ` It leans into your ${priorityLabel} priority.` : '';
  return lead + tail;
}

export interface MatchResult {
  results: ScoredCar[];
  /** True when the hard budget cap (an explicit `maxPricePerDay`) removed
   *  every car — the caller shows the "expand my options" path. */
  budgetExcludedAll: boolean;
}

/**
 * Rank the fleet for a set of preferences. `maxPricePerDay` is the only
 * hard filter (a user who typed an exact cap means it); every other
 * preference is a soft score so the list is never empty for a normal set
 * of answers. `available` (optional) lets a caller pass a set of car ids
 * confirmed bookable for chosen dates — present cars are ranked ahead of
 * absent ones without ever being *claimed* available when they aren't.
 */
export function matchCars(
  cars: Car[],
  prefs: Preferences,
  personal: PersonalSignals = {},
  available?: Set<string>,
): MatchResult {
  const hardCap = prefs.maxPricePerDay ?? null;
  const withinCap = hardCap ? cars.filter((c) => c.pricePerDay <= hardCap) : cars;
  const budgetExcludedAll = hardCap != null && withinCap.length === 0;
  const pool = budgetExcludedAll ? cars : withinCap;

  const raw = pool.map((car) => {
    const availBonus = available ? (available.has(car.id) ? 4 : 0) : 0;
    return { car, raw: rawScore(car, prefs, personal) + availBonus };
  });
  raw.sort((a, b) => b.raw - a.raw);

  // Normalise against the actual best score in THIS result set (blended
  // with the theoretical ceiling so a weak overall field can't push a
  // mediocre car to 99%). This is what keeps the top match reading as the
  // clear winner while alternatives visibly step down, instead of every
  // card flattening to the same percentage.
  const best = raw[0]?.raw ?? 1;
  const denom = Math.max(MAX_RAW * 0.72, best);
  const scored = raw.map(({ car, raw: r }, i) => {
    const base = Math.round((r / denom) * 100);
    // A gentle rank step (≈2 pts each for the first few) so a set of
    // genuinely-close top cars still reads as an ordered shortlist — the
    // #1 pick is unambiguous — rather than a wall of identical 99%s. It
    // only ever *lowers* a lower-ranked card, never inflates one, so no
    // car is ever shown as a better match than its real score supports.
    const rankStep = i === 0 ? 0 : Math.min(14, i * 2 + 1);
    return {
      car,
      match: Math.max(40, Math.min(99, base) - rankStep),
      reasons: explain(car, prefs),
    };
  });

  return { results: scored, budgetExcludedAll };
}
