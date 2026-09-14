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
  if (identity.type === 'cx') {
    // cx-logo-symbol.png is a tall lockup with a lot of transparent
    // margin around the actual mark (~37% pixel coverage of its own
    // bounding box) — object-cover on a circle scales it up to fill the
    // box and crops most of that margin away, cutting the mark itself
    // off at odd points. Showing it via object-contain, shrunk with real
    // padding inside its own backing circle, keeps the whole logo intact
    // and legible instead.
    return (
      <span className="grid shrink-0 place-items-center rounded-full bg-white ring-1 ring-line" style={style}>
        <Img
          src={identity.avatarUrl!}
          alt=""
          className="object-contain"
          style={{ height: size * 0.6, width: size * 0.6 }}
          fallback={<span className="font-semibold text-ink" style={{ fontSize: size * 0.4 }}>CX</span>}
        />
      </span>
    );
  }
  if (identity.avatarUrl) {
    return (
      <Img
        src={identity.avatarUrl}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={style}
        fallback={
          <span className="grid shrink-0 place-items-center rounded-full bg-panel text-ink-soft" style={style}>
            <Icon name="user" size={Math.round(size * 0.5)} />
          </span>
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
export function SignalIdentityBadge({ identity, size = 14 }: { identity: SignalIdentity; size?: number }) {
  if (identity.type === 'owner') {
    return <VerifiedBadge role="owner" size={size} />;
  }
  if (identity.type === 'self') {
    // A real account's own tier — the same badges used everywhere else
    // in the app, not a separate SIGNAL-only mark, since this IS their
    // real identity, not a voice. Owner/Admin posting under their own
    // real identity (not the fixed 'owner' voice) still get their real
    // mark, not a downgrade to 'client'. A plain client (none of the
    // above, `selfRole` falls through to the literal string 'client' —
    // see resolveSignalIdentity) gets NO badge at all: 'client' here
    // means "an ordinary signed-in account," not "Verified Client," and
    // the two must never render the same green checkmark — that would
    // misrepresent a real, un-verified account as CX Rent-verified,
    // exactly what `ProfileHeader` (SignalProfileDetail.tsx) already gets
    // right by only badging owner/admin/host/verified_client.
    if (identity.selfRole === 'owner') return <VerifiedBadge role="owner" size={size} />;
    if (identity.selfRole === 'admin') return <VerifiedBadge role="admin" size={size} />;
    if (identity.selfRole === 'host') return <VerifiedBadge role="host" size={size} />;
    if (identity.selfRole === 'verified_client') return <VerifiedBadge role="client" size={size} />;
    return null;
  }
  return <VerifiedBadge role={officialRole(identity.type as 'cx' | 'assistant')} size={size} />;
}
