import { useId } from 'react';
import { useLocale } from '../lib/i18n';

/** The CX Chrome Mark: a small satin-metal seal with a key-slot notch at the
 *  top, a thin double rim, a very faint highlight at the top-left and an
 *  engraved check. One shape for every tier — only the metal changes.
 *  Pure SVG, no raster. */
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

// Outer seal: a circle (r 10.4) with a 3-wide slot cut into the top edge.
const SEAL = 'M13.5 1.71 L13.5 3.6 L10.5 3.6 L10.5 1.71 A10.4 10.4 0 1 0 13.5 1.71 Z';
const CHECK = 'M8.1 13.1 L10.9 15.9 L16.1 10.3';

interface Metal {
  rim: [string, string];     // outer rim, top-left → bottom-right
  face: [string, string];    // satin face, top → bottom
  hairline: string;          // the thin line between rim and face
  check: string;
  checkShade: string;
  rimWidth: number;          // how much of the radius the rim takes
}

const METAL: Record<CxTier, Metal> = {
  // graphite / satin silver
  verified: { rim: ['#eceef1', '#7a8088'], face: ['#a9aeb6', '#646a72'], hairline: 'rgba(40,44,50,0.45)', check: '#f4f6f9', checkShade: 'rgba(20,22,26,0.45)', rimWidth: 1.5 },
  // satin champagne gold, dark check for contrast
  host: { rim: ['#f6e9c2', '#a78a4e'], face: ['#dcc58c', '#b0914f'], hairline: 'rgba(90,68,24,0.5)', check: '#2a2010', checkShade: 'rgba(255,246,220,0.55)', rimWidth: 1.5 },
  // obsidian chrome with a very thin champagne rim, light-gold check
  team: { rim: ['#dcc890', '#8b7441'], face: ['#2c2c30', '#0b0b0d'], hairline: 'rgba(0,0,0,0.6)', check: '#f1e5be', checkShade: 'rgba(0,0,0,0.7)', rimWidth: 0.85 },
};

export function CxMark({ tier, size = 16, className = '' }: { tier: CxTier; size?: number; className?: string }) {
  const { t } = useLocale();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const label = t(CX_TIER_LABEL[tier]);
  const m = METAL[tier];
  const faceR = 10.4 - m.rimWidth;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label} className={`shrink-0 ${className}`}>
      <title>{label}</title>
      <defs>
        <linearGradient id={`${uid}r`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={m.rim[0]} />
          <stop offset="1" stopColor={m.rim[1]} />
        </linearGradient>
        <linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.face[0]} />
          <stop offset="1" stopColor={m.face[1]} />
        </linearGradient>
      </defs>
      <path d={SEAL} fill={`url(#${uid}r)`} />
      <circle cx="12" cy="12.5" r={faceR} fill={`url(#${uid}f)`} stroke={m.hairline} strokeWidth="0.45" />
      {/* the faintest reflection, top-left */}
      <path d="M6.3 10.2 A6.4 6.4 0 0 1 10.6 6.3" fill="none" stroke="#ffffff" strokeOpacity={tier === 'team' ? 0.28 : 0.42} strokeWidth="1" strokeLinecap="round" />
      {/* engraved check: a soft shade just below, then the check itself */}
      <path d={CHECK} fill="none" stroke={m.checkShade} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 0.55)" />
      <path d={CHECK} fill="none" stroke={m.check} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
