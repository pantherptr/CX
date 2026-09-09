import type { Rarity } from '../lib/data/empire';

/**
 * CX Vehicle Art — the visual system that replaced real-time 3D
 * rendering (see git history: src/three/*, removed). Every vehicle is
 * a single hero photograph (AI-generated, an original design — never a
 * copy of a real production car or a reference photo) presented with
 * CSS-only depth: parallax tilt, a rarity-tinted glow, a soft ambient
 * shadow, and — for the very top tiers — a light sparkle overlay.
 *
 * This is deliberately NOT true per-part layer compositing (a separate
 * transparent PNG per wheel/spoiler/etc.): getting AI-generated layers
 * to align pixel-for-pixel across independent generations isn't
 * reliable. Instead:
 *   - PAINT recolors the actual photo in real time via a CSS filter
 *     stack, so it's genuinely instant and free — no per-colour asset.
 *   - BODY_KIT swaps to a second, fully pre-rendered "wide" photo of
 *     the same car when one exists for it — a real, different image,
 *     not a filter.
 *   - The remaining categories (wheels, wheel finish, brakes, exhaust,
 *     window tint, interior, lights) are real, persisted, and priced
 *     exactly like every other option, but do not yet change the
 *     flat photo — there is no honest way to depict a wheel swap on a
 *     single baked image without a dedicated render per option, which
 *     would multiply the asset count combinatorially. Flagged here
 *     rather than silently faked.
 */

export interface VehicleArtSources {
  base: string;
  wide?: string;
}

/** Keyed by the exact `game_vehicle_templates.name` — every template
 *  gets its own bespoke artwork rather than a shared placeholder. */
export const ARTWORK_SOURCES: Record<string, VehicleArtSources> = {
  'Metro Runabout': { base: '/vehicle-art/metro_runabout.webp' },
  'Highway Cruiser': { base: '/vehicle-art/highway_cruiser.webp' },
  'Trail Blazer': { base: '/vehicle-art/trail_blazer.webp' },
  'Retro Coupe': { base: '/vehicle-art/retro_coupe.webp' },
  'Nightfury X': { base: '/vehicle-art/nightfury_x.webp' },
  'Apex GTR': { base: '/vehicle-art/apex_gtr.webp' },
  'Vortex Spyder': { base: '/vehicle-art/vortex_spyder.webp', wide: '/vehicle-art/vortex_spyder_wide.webp' },
  'Titan 4x4': { base: '/vehicle-art/titan_4x4.webp' },
  'Phantom Reaper': { base: '/vehicle-art/phantom_reaper.webp' },
  'Obsidian Landau': { base: '/vehicle-art/obsidian_landau.webp' },
  'Eclipse Zero': { base: '/vehicle-art/eclipse_zero.webp' },
  'Celestial One': { base: '/vehicle-art/celestial_one.webp' },
};

const FALLBACK_ART: VehicleArtSources = { base: '/vehicle-art/metro_runabout.webp' };

export function artworkFor(name: string): VehicleArtSources {
  return ARTWORK_SOURCES[name] ?? FALLBACK_ART;
}

export const RARITY_TINT: Record<Rarity, string> = {
  common: '#9aa3ad',
  uncommon: '#3ecf8e',
  rare: '#4fb2ff',
  epic: '#b06bff',
  legendary: '#ff9f40',
  mythic: '#ff5fd1',
};

const RARITY_GLOW_COLOR: Record<Rarity, string> = {
  common: 'rgba(154,163,173,0)',
  uncommon: 'rgba(62,207,142,0.35)',
  rare: 'rgba(79,178,255,0.4)',
  epic: 'rgba(176,107,255,0.45)',
  legendary: 'rgba(255,159,64,0.5)',
  mythic: 'rgba(255,95,209,0.55)',
};

export const RARITY_GLOW: Record<Rarity, string> = {
  common: `0 0 0 ${RARITY_GLOW_COLOR.common}`,
  uncommon: `0 0 28px ${RARITY_GLOW_COLOR.uncommon}`,
  rare: `0 0 32px ${RARITY_GLOW_COLOR.rare}`,
  epic: `0 0 36px ${RARITY_GLOW_COLOR.epic}`,
  legendary: `0 0 42px ${RARITY_GLOW_COLOR.legendary}`,
  mythic: `0 0 48px ${RARITY_GLOW_COLOR.mythic}`,
};

export function rarityGlowRadial(rarity: Rarity): string {
  return `radial-gradient(60% 55% at 50% 62%, ${RARITY_GLOW_COLOR[rarity]}, transparent 70%)`;
}

/** Rarity tiers that earn the sparkle-particle overlay — reserved for
 *  the top of the ladder so it reads as genuinely exclusive rather
 *  than decorating every card. */
export const SPARKLE_RARITIES = new Set<Rarity>(['legendary', 'mythic']);

export interface PaintFilter {
  /** CSS `filter` value applied straight to the photo. Empty string
   *  leaves the vehicle's own generated colour untouched — used as the
   *  "factory" look before any paint is purchased. */
  css: string;
}

const PAINT_FILTERS: Record<string, PaintFilter> = {
  gloss_black: { css: 'grayscale(0.85) brightness(0.55) contrast(1.35)' },
  pearl_white: { css: 'grayscale(0.92) brightness(1.65) contrast(0.85) saturate(0.4)' },
  satin_carbon: { css: 'grayscale(0.9) brightness(0.7) contrast(1.15)' },
};

export function paintFilterFor(customization: Record<string, string>): string {
  const key = customization.paint;
  if (!key) return '';
  return PAINT_FILTERS[key]?.css ?? '';
}

export function bodyKitActive(customization: Record<string, string>): boolean {
  const key = customization.body_kit;
  return key === 'aero' || key === 'widebody';
}
