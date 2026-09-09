import * as THREE from 'three';
import type { Rarity } from '../lib/data/empire';

/**
 * Vehicle 3D visual resolver — the ONE place that turns the game's
 * existing, already-persisted vehicle state (rarity, silhouette,
 * condition, and the `customization` object written by `customize_car`)
 * into concrete Three.js material/geometry parameters.
 *
 * No new data model was introduced for this: `customization` is the
 * exact same `Record<category, optionKey>` object already stored on
 * `game_inventory.customization` and applied by every RPC in
 * empire.ts — it is read here, never duplicated. That is what makes a
 * customized car look identical in the Market preview, the
 * configurator, My Collection and (once built) Auction: they all pass
 * the same config through this same resolver.
 */

export interface VehicleConfig {
  silhouette: string;
  rarity: Rarity;
  /** 0-100 average of engine/body/interior — condition is a single
   *  visual "wear" dial, not three separate ones, since the body paint
   *  and tires are the only surfaces this asset can actually show wear
   *  on. */
  conditionAvg: number;
  customization: Record<string, string>;
}

export const RARITY_TINT: Record<Rarity, string> = {
  common: '#9aa3ad',
  uncommon: '#3ecf8e',
  rare: '#4fb2ff',
  epic: '#b06bff',
  legendary: '#ff9f40',
  mythic: '#ff5fd1',
};

/** First-pass proportion technique: the project ships exactly one
 *  sculpted vehicle asset (`/models/cx-rent-car.glb`, real named
 *  meshes/materials — body, glass, rims, lights, interior). Genuinely
 *  different per-category GLBs (a real SUV, a real hypercar, ...) can
 *  be dropped into `MODEL_SOURCES` below with zero changes anywhere
 *  else — every category simply falls back to this one, non-uniformly
 *  scaled, until a dedicated model exists for it. */
export const MODEL_SOURCES: Record<string, string> = {
  default: '/models/cx-rent-car.glb',
};

export function modelSourceFor(silhouette: string): string {
  return MODEL_SOURCES[silhouette] ?? MODEL_SOURCES.default;
}

interface ProportionProfile {
  length: number;
  height: number;
  width: number;
  rideHeight: number;
}

const PROPORTIONS: Record<string, ProportionProfile> = {
  hatchback: { length: 0.82, height: 1.0, width: 0.97, rideHeight: 0 },
  sedan: { length: 1.0, height: 1.0, width: 1.0, rideHeight: 0 },
  suv: { length: 1.05, height: 1.2, width: 1.06, rideHeight: 0.06 },
  offroad: { length: 1.08, height: 1.24, width: 1.08, rideHeight: 0.09 },
  coupe: { length: 0.98, height: 0.92, width: 1.02, rideHeight: -0.01 },
  sports: { length: 1.02, height: 0.88, width: 1.05, rideHeight: -0.02 },
  convertible: { length: 1.0, height: 0.9, width: 1.03, rideHeight: -0.015 },
  limousine: { length: 1.55, height: 0.98, width: 1.0, rideHeight: 0 },
  hypercar: { length: 1.08, height: 0.8, width: 1.1, rideHeight: -0.03 },
  'hypercar-wing': { length: 1.1, height: 0.78, width: 1.12, rideHeight: -0.03 },
  concept: { length: 1.06, height: 0.84, width: 1.09, rideHeight: -0.02 },
};

export function proportionFor(silhouette: string): ProportionProfile {
  return PROPORTIONS[silhouette] ?? PROPORTIONS.sedan;
}

export interface PaintFinish {
  color: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

const PAINT_PRESETS: Record<string, PaintFinish> = {
  gloss_black: { color: '#0a0a0c', metalness: 0.75, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05 },
  pearl_white: { color: '#f1efe8', metalness: 0.35, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 },
  satin_carbon: { color: '#1b1c20', metalness: 0.35, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.3 },
};

/** No paint chosen yet — the rarity tint IS the factory colour, so
 *  rarity reads visually even before a player spends a cent
 *  customizing (spec §8: "do not rely only on a colour label"). */
export function paintFor(config: VehicleConfig): PaintFinish {
  const key = config.customization.paint;
  if (key && PAINT_PRESETS[key]) return PAINT_PRESETS[key];
  return { color: RARITY_TINT[config.rarity], metalness: 0.6, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 };
}

export interface WheelFinish {
  color: string;
  metalness: number;
  roughness: number;
}

const WHEEL_PRESETS: Record<string, WheelFinish> = {
  forged_alloy: { color: '#d9dbdf', metalness: 0.92, roughness: 0.2 },
  carbon_fiber: { color: '#16171b', metalness: 0.3, roughness: 0.45 },
};

export function wheelFor(config: VehicleConfig): WheelFinish {
  const key = config.customization.wheels;
  if (key && WHEEL_PRESETS[key]) return WHEEL_PRESETS[key];
  return { color: '#9aa0a6', metalness: 0.8, roughness: 0.3 };
}

export interface GlassTint {
  color: string;
  transmission: number;
}

const WINDOW_PRESETS: Record<string, GlassTint> = {
  tint: { color: '#08110d', transmission: 0.55 },
  smart_glass: { color: '#0c1a22', transmission: 0.92 },
};

export function glassFor(config: VehicleConfig): GlassTint {
  const key = config.customization.windows;
  if (key && WINDOW_PRESETS[key]) return WINDOW_PRESETS[key];
  return { color: '#0d1712', transmission: 0.95 };
}

export interface LightTune {
  color: string;
  intensity: number;
}

const LIGHT_PRESETS: Record<string, LightTune> = {
  led_matrix: { color: '#eaf4ff', intensity: 4 },
  laser: { color: '#bfe0ff', intensity: 6 },
};

export function headlightFor(config: VehicleConfig): LightTune {
  const key = config.customization.lights;
  if (key && LIGHT_PRESETS[key]) return LIGHT_PRESETS[key];
  return { color: '#fffaf0', intensity: 3 };
}

export interface InteriorTone {
  color: string;
  roughness: number;
}

const INTERIOR_PRESETS: Record<string, InteriorTone> = {
  leather: { color: '#5a3c26', roughness: 0.55 },
  alcantara: { color: '#1a0d10', roughness: 0.75 },
};

export function interiorFor(config: VehicleConfig): InteriorTone {
  const key = config.customization.interior;
  if (key && INTERIOR_PRESETS[key]) return INTERIOR_PRESETS[key];
  return { color: '#141518', roughness: 0.6 };
}

export interface CaliperAccent {
  color: string;
}

const BRAKE_PRESETS: Record<string, CaliperAccent> = {
  sport: { color: '#c23b2c' },
  carbon_ceramic: { color: '#e0a52a' },
};

/** No caliper mesh exists on the base asset — `customize_car`'s
 *  brakes option pays for a real, added 3D part (a small ring dropped
 *  inside each rim), not just a stat. Returns null when no brake
 *  upgrade has been bought, so nothing extra is drawn. */
export function caliperFor(config: VehicleConfig): CaliperAccent | null {
  const key = config.customization.brakes;
  return key ? (BRAKE_PRESETS[key] ?? null) : null;
}

export interface ExhaustTune {
  color: string;
  metalness: number;
  roughness: number;
  dual: boolean;
}

const EXHAUST_PRESETS: Record<string, ExhaustTune> = {
  sport: { color: '#c7c9cc', metalness: 0.9, roughness: 0.25, dual: false },
  titanium: { color: '#8d7fae', metalness: 0.85, roughness: 0.3, dual: true },
};

export function exhaustFor(config: VehicleConfig): ExhaustTune | null {
  const key = config.customization.exhaust;
  return key ? (EXHAUST_PRESETS[key] ?? null) : null;
}

export type BodyKitTune = 'aero' | 'widebody';

export function bodyKitFor(config: VehicleConfig): BodyKitTune | null {
  const key = config.customization.body_kit;
  return key === 'aero' || key === 'widebody' ? key : null;
}

/** Condition is the one dial that ties the 3D model back to the
 *  economy: a neglected car should visibly look neglected, and that
 *  same wear is exactly what depresses `estimate_car_value()` on the
 *  server. Applied as a blend on top of whatever paint/tyre colour was
 *  already resolved, so it composes with customization rather than
 *  overriding it. */
export function applyConditionWear(color: THREE.Color, roughness: number, clearcoat: number, conditionAvg: number) {
  const wear = 1 - Math.max(0, Math.min(1, conditionAvg / 100));
  const worn = color.clone().lerp(new THREE.Color('#6b6b66'), wear * 0.35);
  return {
    color: worn,
    roughness: Math.min(1, roughness + wear * 0.45),
    clearcoat: Math.max(0, clearcoat - wear * 0.5),
  };
}
