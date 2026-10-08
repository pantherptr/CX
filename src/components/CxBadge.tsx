import { useId } from 'react';
import { useLocale } from '../lib/i18n';

/** The CX bat — the one from the logo — as the verification mark, on its own
 *  with no seal around it. Members get half a bat, hosts the whole bat in
 *  green, the CX team the whole bat in gold. Pure SVG, no raster. */
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

// The logo bat, traced on a 1000 × 357 canvas: wide angular wings, two ear
// peaks beside a small head, a point at the bottom centre.
const BAT =
  'M18 288 L232 33 L338 80 L435 18 L472 70 Q500 52 528 70 L565 18 L662 80 L768 33 L982 288 L850 250 L730 282 L595 236 L500 340 L405 236 L270 282 L150 250 Z';
// The upper wing facets, lightened a little, as in the logo's faceted look.
const FACETS = 'M18 288 L232 33 L338 80 L435 18 L405 236 Z M982 288 L768 33 L662 80 L565 18 L595 236 Z';

const METAL: Record<CxTier, { top: string; bottom: string; edge: string }> = {
  verified: { top: '#c3c8d0', bottom: '#6d737b', edge: 'rgba(44,48,54,0.55)' },   // satin graphite / silver
  host: { top: '#62c283', bottom: '#1d6a3c', edge: 'rgba(6,44,22,0.55)' },         // emerald
  team: { top: '#f3d982', bottom: '#a8832b', edge: 'rgba(86,62,8,0.6)' },          // gold
};

export function CxMark({ tier, size = 16, className = '' }: { tier: CxTier; size?: number; className?: string }) {
  const { t } = useLocale();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const label = t(CX_TIER_LABEL[tier]);
  const m = METAL[tier];
  const half = tier === 'verified';
  const viewW = half ? 500 : 1000;
  const width = Math.round(size * 1.7 * (viewW / 1000) * 10) / 10;
  const height = Math.round(size * 1.7 * 0.357 * 10) / 10;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${viewW} 357`} role="img" aria-label={label} className={`shrink-0 overflow-visible ${className}`}>
      <title>{label}</title>
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.top} />
          <stop offset="1" stopColor={m.bottom} />
        </linearGradient>
        {half && (
          <clipPath id={`${uid}c`}>
            <rect x="0" y="0" width="500" height="357" />
          </clipPath>
        )}
      </defs>
      <g clipPath={half ? `url(#${uid}c)` : undefined}>
        <path d={BAT} fill={`url(#${uid}g)`} stroke={m.edge} strokeWidth="14" strokeLinejoin="round" />
        <path d={FACETS} fill="#ffffff" fillOpacity="0.2" />
      </g>
    </svg>
  );
}
