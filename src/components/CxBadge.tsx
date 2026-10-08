import { useId } from 'react';
import { useLocale } from '../lib/i18n';

/** The CX Chrome Mark: a small satin-metal seal with a key-slot notch at the
 *  top, a thin double rim, a very faint highlight at the top-left and the CX
 *  bat engraved at its centre. One shape for every tier — only the metal
 *  changes: grey for members, green for hosts, gold for the CX team.
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
// The bat: two ears, a scalloped wingspan, a small tail. Centred on (12, 12).
const BAT =
  'M12 8.4 L13.3 6.9 L13.5 8.6 C15.3 8.3 18.2 8.8 19.9 10.7 L17.2 12.4 L16 11.4 L14.4 13.6 L13.2 12.7 L12.7 15.4 L12 16.5 L11.3 15.4 L10.8 12.7 L9.6 13.6 L8 11.4 L6.8 12.4 L4.1 10.7 C5.8 8.8 8.7 8.3 10.5 8.6 L10.7 6.9 Z';

interface Metal {
  rim: [string, string];     // outer rim, top-left → bottom-right
  face: [string, string];    // satin face, top → bottom
  hairline: string;          // the thin line between rim and face
  mark: string;              // the engraved bat
  markShade: string;
  rimWidth: number;          // how much of the radius the rim takes
}

const METAL: Record<CxTier, Metal> = {
  // members: graphite / satin silver
  verified: { rim: ['#eceef1', '#7a8088'], face: ['#a9aeb6', '#646a72'], hairline: 'rgba(40,44,50,0.45)', mark: '#f4f6f9', markShade: 'rgba(20,22,26,0.45)', rimWidth: 1.5 },
  // hosts: satin emerald, ivory bat
  host: { rim: ['#cfe6d4', '#2f7048'], face: ['#4aa467', '#1d5f39'], hairline: 'rgba(8,48,24,0.5)', mark: '#f5faf5', markShade: 'rgba(5,35,16,0.5)', rimWidth: 1.5 },
  // CX team: satin gold, dark bat for contrast
  team: { rim: ['#f4e3a6', '#9c7a28'], face: ['#dcb95c', '#a8842c'], hairline: 'rgba(80,58,10,0.55)', mark: '#1c1608', markShade: 'rgba(255,240,190,0.55)', rimWidth: 1.5 },
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
      <path d="M6.3 10.2 A6.4 6.4 0 0 1 10.6 6.3" fill="none" stroke="#ffffff" strokeOpacity={0.42} strokeWidth="1" strokeLinecap="round" />
      {/* the bat, engraved: a soft shade just below, then the bat itself */}
      <path d={BAT} fill={m.markShade} transform="translate(0 0.5)" />
      <path d={BAT} fill={m.mark} stroke={m.mark} strokeWidth="0.4" strokeLinejoin="round" />
    </svg>
  );
}
