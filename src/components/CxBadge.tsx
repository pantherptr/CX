import { useId } from 'react';
import { useLocale } from '../lib/i18n';

/** The CX bat — the one from the logo — as the verification mark, on its own
 *  with no seal around it, a check set in its centre. Grey for members, green
 *  for hosts, gold for the CX team. Pure SVG, no raster. */
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

// The top contour only, for a thin highlight along the upper edge.
const TOP_EDGE = 'M18 288 L232 33 L338 80 L435 18 L472 70 Q500 52 528 70 L565 18 L662 80 L768 33 L982 288';
// The check, set over the bat's body and a little onto the inner wings.
const CHECK = 'M398 168 L471 252 L606 86';

const METAL: Record<CxTier, { top: string; bottom: string; edge: string; check: string; checkEdge: string }> = {
  // satin graphite / silver, white check
  verified: { top: '#c9ced6', bottom: '#69707a', edge: 'rgba(44,48,54,0.6)', check: '#ffffff', checkEdge: 'rgba(38,42,48,0.85)' },
  // emerald, white check
  host: { top: '#66c788', bottom: '#1b6638', edge: 'rgba(6,44,22,0.6)', check: '#ffffff', checkEdge: 'rgba(8,52,26,0.85)' },
  // gold, cream check
  team: { top: '#f5dc88', bottom: '#a5802a', edge: 'rgba(86,62,8,0.65)', check: '#fff8e0', checkEdge: 'rgba(92,66,8,0.9)' },
};

export function CxMark({ tier, size = 16, className = '' }: { tier: CxTier; size?: number; className?: string }) {
  const { t } = useLocale();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const label = t(CX_TIER_LABEL[tier]);
  const m = METAL[tier];
  const width = Math.round(size * 2 * 10) / 10;
  const height = Math.round(size * 2 * 0.357 * 10) / 10;
  return (
    <svg width={width} height={height} viewBox="0 0 1000 357" role="img" aria-label={label} className={`shrink-0 overflow-visible ${className}`}>
      <title>{label}</title>
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.top} />
          <stop offset="1" stopColor={m.bottom} />
        </linearGradient>
      </defs>
      <path d={BAT} fill={`url(#${uid}g)`} stroke={m.edge} strokeWidth="14" strokeLinejoin="round" />
      <path d={FACETS} fill="#ffffff" fillOpacity="0.2" />
      <path d={TOP_EDGE} fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      {/* the check: a dark edge first, so it stays legible on any metal, then the check itself */}
      <path d={CHECK} fill="none" stroke={m.checkEdge} strokeWidth="78" strokeLinecap="round" strokeLinejoin="round" />
      <path d={CHECK} fill="none" stroke={m.check} strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
