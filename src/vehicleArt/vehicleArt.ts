import type { Rarity } from '../lib/data/empire';

/**
 * CX Vehicle Art — two coexisting rendering styles, chosen per template
 * by which asset fields are present (see ARTWORK_SOURCES):
 *
 * 1. STYLIZED GAME ART (every template except CX Vortex): a single
 *    AI-generated hero cutout on a rarity-tinted CSS gradient backdrop,
 *    pointer-tracked tilt, soft CSS ground shadow, sparkle overlay for
 *    the top two rarities. PAINT recolors the cutout via a CSS filter
 *    stack (instant, free, no per-colour asset); BODY_KIT swaps to a
 *    second pre-rendered "wide" image where one exists.
 *
 * 2. REALISTIC AUTOMOTIVE PHOTOGRAPHY (CX Vortex — the new flagship
 *    standard every future template should match): a photoreal AI-
 *    generated car cutout composited, at render time, over ONE shared
 *    master environment plate (PHOTOREAL_BACKDROP) — never a baked-
 *    together single image. Keeping the car and the environment as
 *    separate layers is what still lets PAINT recolor the car via the
 *    same CSS filter stack as the stylized style, without dragging the
 *    background's color along with it. Every realistic vehicle reuses
 *    the exact same backdrop plate — regenerating "the same street"
 *    independently per vehicle does not produce a pixel-consistent
 *    result (proven this session across many attempts), so a single
 *    shared plate is the only reliable way the whole fleet reads as one
 *    consistent world rather than disconnected AI generations.
 *
 * Neither style does true per-part layer compositing (a separate
 * transparent PNG per wheel/spoiler/etc.): getting AI-generated layers
 * to align pixel-for-pixel across independent generations isn't
 * reliable. VIEWS (3/4 front, side, 3/4 rear, front, rear, interior) are
 * separate pre-rendered images of the same vehicle; the view switcher
 * hides itself down to whatever subset actually exists for a template
 * rather than pretending extra angles are available. The remaining
 * customization categories (wheels, wheel finish, brakes, exhaust,
 * window tint, interior, lights) are real, persisted, and priced
 * exactly like every other option, but do not yet change the artwork —
 * there is no honest way to depict a wheel swap on a single baked image
 * without a dedicated render per option, which would multiply the asset
 * count combinatorially. Flagged in the UI rather than silently faked.
 */

export type ViewKey = 'front3q' | 'side' | 'rear3q' | 'front' | 'rear' | 'interior';

export const VIEW_LABELS: Record<ViewKey, string> = {
  front3q: '3/4 Front',
  side: 'Side',
  rear3q: '3/4 Rear',
  front: 'Front',
  rear: 'Rear',
  interior: 'Interior',
};

export interface VehicleArtSources {
  views: Partial<Record<ViewKey, string>>;
  /** Body-kit ("wide") variant of the front3q view only, for now. */
  wide?: string;
  /** A shared, reusable photoreal environment plate this vehicle's cutout
   *  composites over at render time (see PHOTOREAL_BACKDROP below) —
   *  present only for vehicles built in the realistic-photography
   *  direction. Every such vehicle uses the SAME plate so the whole
   *  fleet reads as one consistent world, per the explicit "same street"
   *  requirement — never generate a new environment per car. */
  photoBackdrop?: string;
}

/** The one master environment plate every realistic-photography vehicle
 *  composites onto. Regenerating "the same street" independently per
 *  vehicle does not produce a pixel-consistent result (proven this
 *  session) — a single shared plate is the only reliable way to
 *  guarantee every car appears to live in the same place. */
export const PHOTOREAL_BACKDROP = '/vehicle-art/street/master.webp';

/** Keyed by the exact `game_vehicle_templates.name` — every template
 *  gets its own bespoke artwork rather than a shared placeholder. */
export const ARTWORK_SOURCES: Record<string, VehicleArtSources> = {
  'Metro Runabout': { views: { front3q: '/vehicle-art/metro_runabout.webp' } },
  'Highway Cruiser': { views: { front3q: '/vehicle-art/highway_cruiser.webp' } },
  'Trail Blazer': { views: { front3q: '/vehicle-art/trail_blazer.webp' } },
  'Retro Coupe': { views: { front3q: '/vehicle-art/retro_coupe.webp' } },
  'Nightfury X': { views: { front3q: '/vehicle-art/nightfury_x.webp' } },
  'Apex GTR': { views: { front3q: '/vehicle-art/apex_gtr.webp' } },
  'CX Vortex': {
    views: {
      front3q: '/vehicle-art/cx-vortex/front3q.webp',
      side: '/vehicle-art/cx-vortex/side.webp',
      rear3q: '/vehicle-art/cx-vortex/rear3q.webp',
      front: '/vehicle-art/cx-vortex/front.webp',
      rear: '/vehicle-art/cx-vortex/rear.webp',
      interior: '/vehicle-art/cx-vortex/interior.webp',
    },
    photoBackdrop: PHOTOREAL_BACKDROP,
  },
  'Titan 4x4': { views: { front3q: '/vehicle-art/titan_4x4.webp' } },
  'Phantom Reaper': { views: { front3q: '/vehicle-art/phantom_reaper.webp' } },
  'Obsidian Landau': { views: { front3q: '/vehicle-art/obsidian_landau.webp' } },
  'Eclipse Zero': { views: { front3q: '/vehicle-art/eclipse_zero.webp' } },
  'Celestial One': { views: { front3q: '/vehicle-art/celestial_one.webp' } },
};

const FALLBACK_ART: VehicleArtSources = { views: { front3q: '/vehicle-art/metro_runabout.webp' } };

export function artworkFor(name: string): VehicleArtSources {
  return ARTWORK_SOURCES[name] ?? FALLBACK_ART;
}

/** Views actually available for this vehicle, front3q always first. */
export function availableViews(name: string): ViewKey[] {
  const views = artworkFor(name).views;
  const order: ViewKey[] = ['front3q', 'side', 'rear3q', 'front', 'rear', 'interior'];
  return order.filter((v) => views[v]);
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

/** The card/stage backdrop itself — deliberately understated for
 *  Common (a clean minimal dark surface) and progressively richer up
 *  the ladder, so rarity reads from the presentation around the car
 *  rather than from the car's own artwork turning cartoonish. */
export function rarityBackdrop(rarity: Rarity): string {
  const tint = RARITY_GLOW_COLOR[rarity];
  return `radial-gradient(120% 90% at 50% 15%, ${tint}, transparent 55%), linear-gradient(180deg, #16171b 0%, #0b0c0e 100%)`;
}

/** Rarity tiers that earn the sparkle-particle overlay — reserved for
 *  the top of the ladder so it reads as genuinely exclusive rather
 *  than decorating every card. */
export const SPARKLE_RARITIES = new Set<Rarity>(['legendary', 'mythic']);

export interface PaintFilter {
  /** CSS `filter` value applied straight to the artwork. Empty string
   *  leaves the vehicle's own generated colour untouched — used as the
   *  "factory" look before any paint is purchased. */
  css: string;
  /** A representative swatch colour for the option picker — not
   *  necessarily identical to the filter's result, just close enough
   *  to recognise the choice at a glance. */
  swatch: string;
}

const PAINT_FILTERS: Record<string, PaintFilter> = {
  gloss_black: { css: 'grayscale(0.85) brightness(0.55) contrast(1.35)', swatch: '#0a0a0a' },
  pearl_white: { css: 'grayscale(0.92) brightness(1.65) contrast(0.85) saturate(0.4)', swatch: '#f1efe8' },
  satin_carbon: { css: 'grayscale(0.9) brightness(0.7) contrast(1.15)', swatch: '#242527' },
};

export function paintFilterFor(customization: Record<string, string>): string {
  const key = customization.paint;
  if (!key) return '';
  return PAINT_FILTERS[key]?.css ?? '';
}

export function paintSwatch(optionKey: string): string | null {
  return PAINT_FILTERS[optionKey]?.swatch ?? null;
}

export function bodyKitActive(customization: Record<string, string>): boolean {
  const key = customization.body_kit;
  return key === 'aero' || key === 'widebody';
}

/** Representative swatch colours for the non-paint visual categories,
 *  so the configurator can show a colour chip instead of a plain text
 *  button even where there's no dedicated preview photo per option. */
const OPTION_SWATCHES: Record<string, Record<string, string>> = {
  wheels: { forged_alloy: '#d9dbdf', carbon_fiber: '#1c1d20' },
  brakes: { sport: '#c23b2c', carbon_ceramic: '#e0a52a' },
  exhaust: { sport: '#c7c9cc', titanium: '#8d7fae' },
  lights: { led_matrix: '#eaf4ff', laser: '#bfe0ff' },
  windows: { tint: '#0d1a14', smart_glass: '#183038' },
  interior: { leather: '#6b4226', alcantara: '#232323' },
  body_kit: { aero: '#3a3d42', widebody: '#1c1e21' },
};

export function optionSwatch(category: string, key: string): string | null {
  return OPTION_SWATCHES[category]?.[key] ?? null;
}
