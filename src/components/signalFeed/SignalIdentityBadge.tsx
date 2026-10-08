import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { VerifiedBadge, type VerifiedRole } from '../primitives';
import type { SignalIdentity } from '../../lib/data/signalIdentity';

/** A real profile photo — built on the shared `Img` primitive (motion.tsx)
 *  for its retry-then-fallback resilience, rather than a second, parallel
 *  onError implementation. If `src` fails to load even after `Img`'s own
 *  retry (a dead storage URL, not just a passing network blip), this
 *  falls back to the exact same plain person-glyph circle every
 *  avatar-less profile already shows, instead of the browser's native
 *  broken-image icon. Used specifically for a REAL account's own photo
 *  (profile headers, the edit sheet's preview) — `SignalIdentityAvatar`
 *  above stays the one used for SIGNAL's broader 4-way identity (self/
 *  owner/cx/assistant) rendering. */
export function ProfileAvatar({
  src,
  size = 40,
  ring = false,
  className = '',
}: {
  src: string | null;
  size?: number;
  /** The same hairline verified-identity ring `ProfileHeader` already
   *  applies — passed through here rather than duplicated per caller. */
  ring?: boolean;
  className?: string;
}) {
  const style = { height: size, width: size };
  const ringClass = ring ? 'ring-1 ring-accent-bright/30' : '';
  const fallback = (
    <span className={`grid shrink-0 place-items-center rounded-full bg-panel text-ink-soft ${ringClass} ${className}`} style={style}>
      <Icon name="user" size={Math.round(size * 0.4)} />
    </span>
  );
  if (!src) return fallback;
  return (
    <Img
      src={src}
      alt=""
      fallback={fallback}
      className={`shrink-0 rounded-full object-cover ${ringClass} ${className}`}
      style={style}
    />
  );
}

/** Maps SIGNAL's own identity union onto the one shared badge system
 *  (primitives.tsx) — 'assistant' (the AI voice) gets its own solid
 *  green mark ('assistant' role, distinct from the human 'owner_assistant'
 *  tier which stays gold); 'cx' (the official brand account, not a real
 *  person) reuses Admin's black-and-green mark rather than inventing a
 *  sixth tier for it too, since it represents CX Rent acting
 *  institutionally rather than as one named individual. */
function officialRole(type: 'cx' | 'assistant'): VerifiedRole {
  return type === 'assistant' ? 'assistant' : 'admin';
}

/** The avatar half of a resolved SIGNAL identity — a real photo for
 *  Owner, the site's one official mark for CX, and a headset-icon circle
 *  for CX Assistant (no avatar image exists for it, and one wasn't
 *  needed: Concierge.tsx already uses this exact icon for the same AI). */
export function SignalIdentityAvatar({ identity, size = 40 }: { identity: SignalIdentity; size?: number }) {
  const style = { height: size, width: size };
  if (identity.avatarUrl) {
    return (
      <Img
        src={identity.avatarUrl}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={style}
        fallback={
          identity.type === 'cx' || identity.type === 'assistant' ? (
            <span className="grid shrink-0 place-items-center rounded-full bg-noir text-accent-bright" style={style}>
              <Icon name="headset" size={Math.round(size * 0.45)} />
            </span>
          ) : (
            <span className="grid shrink-0 place-items-center rounded-full bg-panel text-ink-soft" style={style}>
              <Icon name="user" size={Math.round(size * 0.5)} />
            </span>
          )
        }
      />
    );
  }
  if (identity.type === 'self') {
    // A real Host/Verified Client with no profile photo set — a plain
    // person glyph, not the Assistant's headset icon (that one specific
    // icon means "this is the AI", which would misrepresent a real user).
    return (
      <span className="grid shrink-0 place-items-center rounded-full bg-panel text-ink-soft" style={style}>
        <Icon name="user" size={Math.round(size * 0.5)} />
      </span>
    );
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-noir text-accent-bright" style={style}>
      <Icon name="headset" size={Math.round(size * 0.45)} />
    </span>
  );
}

/** The badge half — Owner reuses the exact sitewide red Owner mark
 *  (`VerifiedBadge`, primitives.tsx), since that IS the same Owner tier
 *  used everywhere else. Assistant/CX get their own solid mark in
 *  Signal's own accent-bright green — same solid-circle-plus-check
 *  construction as `BadgeMark`, just not folded into the global
 *  `VerifiedRole` union, which is specifically about conversation-
 *  participant tiers, not SIGNAL's broadcast voices. */
/** Which badge role an identity wears, or null for no badge at all. */
export function identityBadgeRole(identity: SignalIdentity): VerifiedRole | null {
  if (identity.type === 'owner') return 'owner';
  if (identity.type === 'self') {
    if (identity.selfRole === 'owner') return 'owner';
    if (identity.selfRole === 'admin') return 'admin';
    if (identity.selfRole === 'host') return 'host';
    if (identity.selfRole === 'verified_client') return 'client';
    return null;
  }
  return officialRole(identity.type as 'cx' | 'assistant');
}

export function SignalIdentityBadge({ identity, size = 14 }: { identity: SignalIdentity; size?: number }) {
  const role = identityBadgeRole(identity);
  return role ? <VerifiedBadge role={role} size={size} /> : null;
}

/** An avatar with its badge pinned discreetly to the bottom-right corner,
 *  sized to the avatar (about 14px on small ones, up to 26px on a profile
 *  photo). No badge, no overlay — never a placeholder. */
export function AvatarWithBadge({
  role,
  avatarSize,
  ringClass = 'bg-surface ring-surface',
  children,
}: {
  role: VerifiedRole | null;
  avatarSize: number;
  ringClass?: string;
  children: ReactNode;
}) {
  if (!role) return <>{children}</>;
  const size = Math.min(26, Math.max(14, Math.round(avatarSize * 0.38)));
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <span className={`absolute -bottom-[3px] -right-[3px] grid place-items-center rounded-full p-[1.5px] ring-2 ${ringClass}`}>
        <VerifiedBadge role={role} size={size} />
      </span>
    </span>
  );
}
