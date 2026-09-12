import { Icon } from '../Icon';
import { VerifiedBadge, type VerifiedRole } from '../primitives';
import type { SignalIdentity } from '../../lib/data/signalIdentity';

/** Maps SIGNAL's own identity union onto the one shared badge system
 *  (primitives.tsx) — 'assistant' (the CX Assistant AI voice) reuses the
 *  same gold mark as a human Owner Assistant (both mean "speaking in a
 *  support capacity, not personally"); 'cx' (the official brand account,
 *  not a real person) reuses Admin's black-and-green mark rather than
 *  inventing a sixth tier — both represent CX Rent acting institutionally
 *  rather than as one named individual. */
function officialRole(type: 'cx' | 'assistant'): VerifiedRole {
  return type === 'assistant' ? 'owner_assistant' : 'admin';
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
        <img src={identity.avatarUrl!} alt="" className="object-contain" style={{ height: size * 0.6, width: size * 0.6 }} />
      </span>
    );
  }
  if (identity.avatarUrl) {
    return <img src={identity.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={style} />;
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
    // A real Host/Verified Client's own account tier — the same badges
    // used everywhere else in the app for those tiers, not a separate
    // SIGNAL-only mark, since this IS their real identity, not a voice.
    return <VerifiedBadge role={identity.selfRole === 'host' ? 'host' : 'client'} size={size} />;
  }
  return <VerifiedBadge role={officialRole(identity.type as 'cx' | 'assistant')} size={size} />;
}
