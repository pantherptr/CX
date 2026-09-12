import { useEffect } from 'react';
import { SIGNAL_PUBLISHER_TYPES, resolveSignalIdentity, type SignalPublisherType } from '../../lib/data/signalIdentity';
import { SignalIdentityAvatar, SignalIdentityBadge } from './SignalIdentityBadge';

const LAST_PUBLISHER_KEY = 'signal:lastPublisherType';

/** Reads the Owner's last-chosen voice for this browser session — a
 *  convenience only ("always make the current selection clearly
 *  visible" per the brief, not a substitute for showing it), so a typo'd
 *  or missing value just falls back to 'owner' rather than throwing. */
export function lastSignalPublisherType(): SignalPublisherType {
  const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(LAST_PUBLISHER_KEY) : null;
  return stored && (SIGNAL_PUBLISHER_TYPES as string[]).includes(stored) ? (stored as SignalPublisherType) : 'owner';
}

/** The "Publish as" row — three identity cards (Owner / CX Assistant /
 *  CX), used identically by both SignalPostComposer and
 *  SignalStoryComposer. Purely a UX convenience: every RPC this feeds
 *  into re-validates the chosen value server-side regardless of what
 *  this component sends. Remembers the choice for the rest of the
 *  browser session so reopening the composer doesn't reset to Owner. */
export function SignalPublisherPicker({
  value,
  onChange,
  ownerName,
  ownerAvatarUrl,
}: {
  value: SignalPublisherType;
  onChange: (type: SignalPublisherType) => void;
  ownerName: string;
  ownerAvatarUrl: string | null;
}) {
  useEffect(() => {
    window.sessionStorage.setItem(LAST_PUBLISHER_KEY, value);
  }, [value]);

  return (
    <div>
      <p className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-faint">Publish as</p>
      <div className="grid grid-cols-3 gap-2">
        {SIGNAL_PUBLISHER_TYPES.map((type) => {
          const identity = resolveSignalIdentity(type, ownerName, ownerAvatarUrl);
          const active = value === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors ${
                active ? 'border-accent-bright bg-accent-bright/10' : 'border-line hover:border-line-strong hover:bg-panel/50'
              }`}
            >
              <span className="relative">
                <SignalIdentityAvatar identity={identity} size={40} />
                <span className="absolute -bottom-0.5 -right-0.5"><SignalIdentityBadge identity={identity} size={15} /></span>
              </span>
              <span className={`truncate text-caption font-semibold ${active ? 'text-ink' : 'text-ink-soft'}`}>{identity.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
