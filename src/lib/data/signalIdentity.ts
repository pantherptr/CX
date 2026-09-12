/**
 * SIGNAL's three publishing voices — chosen by the Owner/Admin at publish
 * time (see supabase/migrations/0044_signal_publisher_identity.sql) and
 * recorded permanently on the post/Story row, independent of whoever's
 * real account actually clicked publish. `'owner'` reflects the live
 * Owner profile (name/photo can drift if that profile changes — that's
 * the point, it's genuinely them); `'assistant'`/`'cx'` are fixed
 * constants that never drift, so a CX-voiced post stays a CX post even
 * if the Owner's own name or photo changes later.
 *
 * Deliberately not folded into `ParticipantRole`/`VerifiedRole`
 * (messages.ts / primitives.tsx) — those describe a conversation
 * participant's account tier (Owner/Admin/Host/Client), a completely
 * different axis from "which of SIGNAL's three broadcast voices is this
 * content speaking as." Owner's own badge does reuse the real
 * `<VerifiedBadge role="owner">` below, since that IS the same Owner tier.
 */
export type SignalPublisherType = 'owner' | 'assistant' | 'cx';

export const SIGNAL_PUBLISHER_TYPES: SignalPublisherType[] = ['owner', 'assistant', 'cx'];

export interface SignalIdentity {
  type: SignalPublisherType;
  name: string;
  subtitle: string;
  /** Real photo for 'owner', the site's one official mark for 'cx', and
   *  `null` for 'assistant' — rendered as an icon glyph instead of an
   *  image (see SignalIdentityAvatar), matching Concierge.tsx's own
   *  headset-icon treatment for the same AI so it reads as one voice. */
  avatarUrl: string | null;
}

export function resolveSignalIdentity(
  publisherType: SignalPublisherType,
  ownerName: string,
  ownerAvatarUrl: string | null,
): SignalIdentity {
  switch (publisherType) {
    case 'assistant':
      return { type: 'assistant', name: 'CX Assistant', subtitle: 'Official CX Rent Assistant', avatarUrl: null };
    case 'cx':
      return { type: 'cx', name: 'CX', subtitle: 'Official CX Rent', avatarUrl: '/cx-logo-symbol.png' };
    case 'owner':
    default:
      return { type: 'owner', name: ownerName, subtitle: 'Owner', avatarUrl: ownerAvatarUrl };
  }
}
