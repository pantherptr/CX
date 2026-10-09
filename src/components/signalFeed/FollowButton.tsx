import { useState } from 'react';
import { toggleFollow } from '../../lib/data/signalProfile';
import { vibrateTap } from '../motion';
import { Icon } from '../Icon';
import { Tap, SPRING_SNAPPY, useReducedMotion } from '../motionKit';

/** Follow/Following toggle for a Community profile (Host or Verified
 *  Client) — the one new piece of social graph this brief asks for, on
 *  top of the existing real CX Rent profile (no second identity, see
 *  0052_signal_follow_and_vehicle_posts.sql for the plain
 *  follower/followee edge table this calls into). Optimistic with a
 *  revert on failure, same pattern as SignalPostCard's Respect/Save. */
export function FollowButton({
  userId,
  initialFollowing,
  initialRequested = false,
  size = 'md',
  variant = 'default',
  onChange,
}: {
  userId: string;
  initialFollowing: boolean;
  /** A request to a private profile is waiting for an answer. */
  initialRequested?: boolean;
  size?: 'sm' | 'md';
  /** `card`: the full-width button on the dark profile card. */
  variant?: 'default' | 'card' | 'wide';
  onChange?: (following: boolean) => void;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [requested, setRequested] = useState(initialRequested);
  const on = following || requested;
  const [busy, setBusy] = useState(false);
  const [justFollowed, setJustFollowed] = useState(false);
  const reduceMotion = useReducedMotion();

  const handleClick = async () => {
    if (busy) return;
    const was = { following, requested };
    // Optimistic guess: a tap on an "on" button turns it off; otherwise follow (the server may turn it into a request).
    const goOn = !on;
    setFollowing(goOn);
    setRequested(false);
    if (goOn) {
      vibrateTap();
      setJustFollowed(true);
      window.setTimeout(() => setJustFollowed(false), 200);
    }
    setBusy(true);
    const { status, error } = await toggleFollow(userId);
    setBusy(false);
    if (error || status === null) {
      setFollowing(was.following);
      setRequested(was.requested);
      return;
    }
    setFollowing(status === 'following');
    setRequested(status === 'requested');
    onChange?.(status === 'following');
  };

  return (
    <Tap
      onClick={handleClick}
      disabled={busy}
      aria-pressed={on}
      scale={0.93}
      // The "just followed" confirmation bump is its own `animate` target
      // (a real Motion-driven transform), not a Tailwind `scale-*` class —
      // once this element is a motion component, Motion owns `transform`
      // continuously, so a CSS class fighting over the same property
      // would just be silently overridden the whole time.
      animate={{ scale: justFollowed ? 1.08 : 1 }}
      transition={{ scale: reduceMotion ? { duration: 0 } : SPRING_SNAPPY }}
      className={`group font-semibold disabled:opacity-60 ${
        variant === 'wide'
          ? `flex w-full items-center justify-center gap-1.5 rounded-2xl py-3.5 text-body ${
              on
                ? 'border border-line-strong bg-surface text-ink-soft hover:border-danger/40 hover:text-danger'
                : 'bg-ink text-white hover:bg-ink/90'
            }`
          : variant === 'card'
          ? `flex w-full items-center justify-center gap-1.5 rounded-xl py-3.5 text-body ${
              on
                ? 'border border-white/25 bg-white/10 text-on-noir hover:border-white/50'
                : 'bg-white text-noir hover:bg-white/90'
            }`
          : `rounded-full ${size === 'sm' ? 'px-3 py-1.5 text-caption' : 'px-4 py-2 text-detail'} ${
              on
                ? 'border border-line text-ink-soft hover:border-danger/40 hover:bg-danger/5 hover:text-danger'
                : 'bg-ink text-white hover:bg-ink/90'
            }`
      }`}
      style={{ transition: 'background-color 200ms, color 200ms, border-color 200ms' }}
    >
      {on ? (
        <>
          <span className="group-hover:hidden">{requested ? 'Requested' : 'Following'}</span>
          <span className="hidden group-hover:inline">{requested ? 'Cancel request' : 'Unfollow'}</span>
        </>
      ) : variant === 'card' || variant === 'wide' ? (
        <>
          Follow <Icon name="plus" size={16} strokeWidth={2.5} />
        </>
      ) : (
        'Follow'
      )}
    </Tap>
  );
}
