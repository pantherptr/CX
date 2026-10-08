import { useLocale } from '../lib/i18n';

/** The CX Mark: one proprietary seal for every verified tier — a round seal
 *  with a small key-slot notch at the top and a plain check inside. Only the
 *  colours and one fine detail change between the three levels. */
export type CxTier = 'verified' | 'host' | 'team';

/** Highest wins: CX Team > Verified Host > CX Verified. */
const TIER_ORDER: CxTier[] = ['verified', 'host', 'team'];
export const topCxTier = (tiers: (CxTier | null | undefined)[]): CxTier | null =>
  tiers.reduce<CxTier | null>((best, t) => (t && (!best || TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(best)) ? t : best), null);

export const CX_TIER_LABEL: Record<CxTier, string> = {
  verified: 'CX verified profile',
  host: 'CX verified host',
  team: 'Official CX team',
};

// A circle (r 10.4) with a 3-wide, 1.9-deep slot cut into the top edge.
const SEAL = 'M13.5 1.71 L13.5 3.6 L10.5 3.6 L10.5 1.71 A10.4 10.4 0 1 0 13.5 1.71 Z';
const CHECK = 'M7.7 13.3 L10.8 16.3 L16.5 10';

const PALETTE: Record<CxTier, { fill: string; edge: string; edgeWidth: number; check: string; inner?: { color: string; opacity: number } }> = {
  // graphite / soft silver — trust, not status
  verified: { fill: '#8d939b', edge: 'none', edgeWidth: 0, check: '#f6f4ef' },
  // deep teal, ivory check, a hairline inner ring
  host: { fill: '#0f5b57', edge: 'none', edgeWidth: 0, check: '#f7f3e8', inner: { color: '#f7f3e8', opacity: 0.32 } },
  // obsidian with a muted champagne edge
  team: { fill: '#141311', edge: '#c9b27c', edgeWidth: 1.15, check: '#e8dcb9', inner: { color: '#c9b27c', opacity: 0.5 } },
};

export function CxMark({ tier, size = 16, className = '' }: { tier: CxTier; size?: number; className?: string }) {
  const { t } = useLocale();
  const label = t(CX_TIER_LABEL[tier]);
  const p = PALETTE[tier];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label} className={`shrink-0 ${className}`}>
      <title>{label}</title>
      <path d={SEAL} fill={p.fill} stroke={p.edge} strokeWidth={p.edgeWidth} strokeLinejoin="round" />
      {p.inner && <circle cx="12" cy="12.6" r="7.1" fill="none" stroke={p.inner.color} strokeOpacity={p.inner.opacity} strokeWidth="0.7" />}
      <path d={CHECK} fill="none" stroke={p.check} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
