import type { Car } from '../../data/types';

/**
 * CX Configurator — configuration data access.
 *
 * DATA REALITY (audited against supabase/migrations/*.sql): the `cars`
 * table has NO colour, wheel, interior, horsepower or 0–100 columns, and
 * no 3D model assets exist in the project. So this layer deliberately
 * does NOT return invented swatches — `getExteriorOptions` and friends
 * return whatever the vehicle record actually publishes, which today is
 * an empty list for every car. The configurator renders an honest
 * "not published" state for those sections rather than fabricating
 * options the rental flow could never honour.
 *
 * Migration `0014_car_configurator.sql` adds the tables these functions
 * are shaped to read from. Once it's applied and populated with a host's
 * real options, only the bodies here change — no UI edits required.
 */

export interface ConfigOption {
  id: string;
  label: string;
  /** `#rrggbb` for a paint/interior swatch, or an image URL for a wheel. */
  swatch?: string;
  image?: string;
}

export interface CarConfigOptions {
  exterior: ConfigOption[];
  wheels: ConfigOption[];
  interior: ConfigOption[];
}

/**
 * Real, published configuration options for a vehicle.
 *
 * Reads only from fields that exist on the car record. Every list is
 * empty until a host actually publishes options (see the migration), so
 * nothing here can ever surface a colour or wheel the vehicle doesn't
 * genuinely offer.
 */
export function getCarConfigOptions(_car: Car): CarConfigOptions {
  return { exterior: [], wheels: [], interior: [] };
}

export function hasAnyConfigOptions(opts: CarConfigOptions): boolean {
  return opts.exterior.length > 0 || opts.wheels.length > 0 || opts.interior.length > 0;
}

/** Words in `features[]` that describe the cabin/finish rather than tech —
 *  used to surface the vehicle's REAL appointments in the Interior panel
 *  instead of an invented interior picker. */
const APPOINTMENT_HINTS = ['interior', 'seat', 'leather', 'trim', 'roof', 'lighting', 'sound', 'carbon', 'alcantara'];

/** The vehicle's genuine, listed appointments — a true subset of
 *  `car.features`, never a generated list. */
export function getAppointments(car: Car): string[] {
  return car.features.filter((f) => APPOINTMENT_HINTS.some((h) => f.toLowerCase().includes(h)));
}

/* ------------------------------------------------------------------ */
/* Saved builds                                                        */
/* ------------------------------------------------------------------ */

export interface SavedBuild {
  carId: string;
  carSlug: string;
  /** Index into `car.images` the user framed the vehicle at. */
  view: number;
  /** Option ids, only ever set when real options existed to choose from. */
  exteriorId?: string;
  wheelsId?: string;
  interiorId?: string;
  savedAt: string;
}

const BUILDS_KEY = 'cx-saved-builds';

/**
 * Saved builds are localStorage-backed, matching the existing precedent
 * for client-only state in this codebase (`compareStore`, `shopStore`) —
 * there is no `saved_configurations` table yet. Migration 0014 adds one;
 * until it's applied, a build is per-browser and won't sync across
 * devices. That limitation is surfaced in the UI rather than hidden.
 */
export function getSavedBuilds(): SavedBuild[] {
  try {
    const raw = localStorage.getItem(BUILDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBuild(build: Omit<SavedBuild, 'savedAt'>): SavedBuild[] {
  const next = [
    { ...build, savedAt: new Date().toISOString() },
    // One saved build per car — re-saving replaces rather than duplicates.
    ...getSavedBuilds().filter((b) => b.carId !== build.carId),
  ].slice(0, 20);
  try {
    localStorage.setItem(BUILDS_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — the build just won't persist past this visit.
  }
  return next;
}

export function removeBuild(carId: string): SavedBuild[] {
  const next = getSavedBuilds().filter((b) => b.carId !== carId);
  try {
    localStorage.setItem(BUILDS_KEY, JSON.stringify(next));
  } catch {
    // Same as above — non-fatal.
  }
  return next;
}
