/**
 * SIGNAL's publishing voices — chosen at publish time and recorded
 * permanently on the post/Story row (see
 * supabase/migrations/0044_signal_publisher_identity.sql,
 * 0048_signal_community.sql), independent of whoever's real account
 * actually clicked publish. `'owner'` reflects the live Owner profile
 * (name/photo can drift if that profile changes — that's the point,
 * it's genuinely them); `'assistant'`/`'cx'` are fixed constants that
 * never drift, so a CX-voiced post stays a CX post even if the Owner's
 * own name or photo changes later.
 *
 * `'self'` is different from the other three: it's not a fixed voice at
 * all, it means "show whoever the real author is, right now" — a Host or
 * Verified Client publishing under their own real CX Rent identity. Its
 * displayed badge (Host / Verified Client / plain Client) is resolved
 * live from the author's own profile flags on every read, never stored
 * as a separate string — so a profile change (or a Verified Client grant
 * being revoked) is reflected on every past post automatically, with
 * nothing to re-sync.
 *
 * Deliberately not folded into `ParticipantRole`/`VerifiedRole`
 * (messages.ts / primitives.tsx) — those describe a conversation
 * participant's account tier (Owner/Admin/Host/Client), a completely
 * different axis from "which of SIGNAL's voices is this content speaking
 * as." Owner's own badge does reuse the real `<VerifiedBadge role="owner">`
 * below, since that IS the same Owner tier, and 'self' reuses
 * `role="host"`/`role="client"` for the same reason.
 */
export type SignalPublisherType = 'owner' | 'assistant' | 'cx' | 'self';

export const SIGNAL_PUBLISHER_TYPES: SignalPublisherType[] = ['owner', 'assistant', 'cx'];

export interface SignalIdentity {
  type: SignalPublisherType;
  name: string;
  subtitle: string;
  /** Real photo for 'owner' and 'self', the site's one official mark for
   *  'cx', and `null` for 'assistant' — rendered as an icon glyph instead
   *  of an image (see SignalIdentityAvatar), matching Concierge.tsx's own
   *  headset-icon treatment for the same AI so it reads as one voice. */
  avatarUrl: string | null;
  /** Only meaningful when `type === 'self'` — which real-identity badge
   *  to show. Absent for the three fixed official voices (their badge is
   *  derived from `type` directly). */
  selfRole?: 'host' | 'verified_client' | 'client';
}

export function resolveSignalIdentity(
  publisherType: SignalPublisherType,
  authorName: string,
  authorAvatarUrl: string | null,
  authorIsHost?: boolean,
  authorIsVerifiedClient?: boolean,
): SignalIdentity {
  switch (publisherType) {
    case 'assistant':
      return { type: 'assistant', name: 'CX Assistant', subtitle: 'Official CX Rent Assistant', avatarUrl: null };
    case 'cx':
      return { type: 'cx', name: 'CX', subtitle: 'Official CX Rent', avatarUrl: '/cx-logo-symbol.png' };
    case 'self': {
      const selfRole: 'host' | 'verified_client' | 'client' = authorIsHost ? 'host' : authorIsVerifiedClient ? 'verified_client' : 'client';
      const subtitle = selfRole === 'host' ? 'Host' : selfRole === 'verified_client' ? 'Verified Client' : 'Client';
      return { type: 'self', name: authorName, subtitle, avatarUrl: authorAvatarUrl, selfRole };
    }
    case 'owner':
    default:
      return { type: 'owner', name: authorName, subtitle: 'Owner', avatarUrl: authorAvatarUrl };
  }
}
