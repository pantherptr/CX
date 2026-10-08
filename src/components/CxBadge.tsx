import { useId } from 'react';
import { useLocale } from '../lib/i18n';

/** The CX verification mark: the bat from the logo, drawn compact and faceted
 *  in satin metal, with a small engraved plate on its chest holding the check.
 *  Grey for members, green for hosts, gold for the CX team. Pure SVG. */
export type CxTier = 'verified' | 'host' | 'team';

const TIER_ORDER: CxTier[] = ['verified', 'host', 'team'];
/** Highest wins: CX Team > Verified Host > CX Verified. */
export const topCxTier = (tiers: (CxTier | null | undefined)[]): CxTier | null =>
  tiers.reduce<CxTier | null>((best, t) => (t && (!best || TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(best)) ? t : best), null);

export const CX_TIER_LABEL: Record<CxTier, string> = {
  verified: 'CX verified profile',
  host: 'CX verified host',
  team: 'Official CX team',
};

// A 100 × 64 canvas, symmetric about x = 50: two ear points beside a small
// head, angular wings with two scallops each side, a point at the bottom.
const BAT =
  'M50 12 L56.5 2 L60 13 L67 10 L77 3 L99 41 L89 36 L80 44 L70 36 L62 47 L50 62 L38 47 L30 36 L20 44 L11 36 L1 41 L23 3 L33 10 L40 13 L43.5 2 Z';
// Lighter upper wing planes and a darker underside, for the faceted look.
const PLANES_LIGHT = 'M1 41 L23 3 L33 10 L40 13 L38 30 Z M99 41 L77 3 L67 10 L60 13 L62 30 Z';
const PLANES_DARK = 'M1 41 L11 36 L20 44 L30 36 L38 47 L40 30 L38 30 Z M99 41 L89 36 L80 44 L70 36 L62 47 L60 30 L62 30 Z';
const TOP_EDGE = 'M1 41 L23 3 L33 10 L40 13 L43.5 2 L50 12 L56.5 2 L60 13 L67 10 L77 3 L99 41';
const CHECK = 'M41.4 31.4 L47.6 37.6 L59 24';

interface Metal { top: string; bottom: string; edge: string; plate: string; plateRing: string; check: string }

const METAL: Record<CxTier, Metal> = {
  // satin graphite / silver
  verified: { top: '#d7dbe1', bottom: '#79808a', edge: 'rgba(40,44,52,0.55)', plate: 'rgba(22,26,34,0.62)', plateRing: 'rgba(255,255,255,0.45)', check: '#ffffff' },
  // emerald
  host: { top: '#6cc88c', bottom: '#1f6b40', edge: 'rgba(6,42,22,0.55)', plate: 'rgba(4,36,18,0.62)', plateRing: 'rgba(255,255,255,0.4)', check: '#ffffff' },
  // gold
  team: { top: '#f3dd92', bottom: '#ae8830', edge: 'rgba(84,60,8,0.55)', plate: 'rgba(60,40,4,0.62)', plateRing: 'rgba(255,248,224,0.55)', check: '#fff9e6' },
};

export function CxMark({ tier, size = 16, className = '' }: { tier: CxTier; size?: number; className?: string }) {
  const { t } = useLocale();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const label = t(CX_TIER_LABEL[tier]);
  const m = METAL[tier];
  // Compact next to a name; on a phone a touch smaller still.
  const w = Math.round(size * 1.45 * 10) / 10;
  const h = Math.round(w * 0.64 * 10) / 10;
  const vars = { '--cx-w': `${w}px`, '--cx-h': `${h}px`, '--cx-wm': `${Math.round(w * 0.92 * 10) / 10}px`, '--cx-hm': `${Math.round(h * 0.92 * 10) / 10}px` } as React.CSSProperties;
  return (
    <svg
      viewBox="0 0 100 64"
      role="img"
      aria-label={label}
      style={vars}
      className={`h-(--cx-h) w-(--cx-w) max-sm:h-(--cx-hm) max-sm:w-(--cx-wm) shrink-0 overflow-visible ${className}`}
    >
      <title>{label}</title>
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.top} />
          <stop offset="1" stopColor={m.bottom} />
        </linearGradient>
      </defs>
      <path d={BAT} fill={`url(#${uid}g)`} stroke={m.edge} strokeWidth="1.1" strokeLinejoin="round" />
      <path d={PLANES_LIGHT} fill="#ffffff" fillOpacity="0.16" />
      <path d={PLANES_DARK} fill="#000000" fillOpacity="0.1" />
      <path d={TOP_EDGE} fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="0.7" strokeLinejoin="round" strokeLinecap="round" />
      {/* the chest plate and its engraved check */}
      <circle cx="50" cy="31" r="14.5" fill={m.plate} stroke={m.plateRing} strokeWidth="0.9" />
      <path d={CHECK} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 0.8)" />
      <path d={CHECK} fill="none" stroke={m.check} strokeWidth="5.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
