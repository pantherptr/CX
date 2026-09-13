import { useState } from 'react';
import { toggleProfileFollow } from '../../lib/data/signalProfile';

/** Follow/Following toggle for a Community profile (Host or Verified
 *  Client) — the one new piece of social graph this brief asks for, on
 *  top of the existing real CX Rent profile (no second identity, see
 *  0052_signal_follow_and_vehicle_posts.sql for the plain
 *  follower/followee edge table this calls into). Optimistic with a
 *  revert on failure, same pattern as SignalPostCard's Respect/Save. */
export function FollowButton({
  userId,
  initialFollowing,
  size = 'md',
  onChange,
}: {
  userId: string;
  initialFollowing: boolean;
  size?: 'sm' | 'md';
  onChange?: (following: boolean) => void;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    const next = !following;
    setFollowing(next);
    setBusy(true);
    const { following: confirmed, error } = await toggleProfileFollow(userId);
    setBusy(false);
    if (error || confirmed === null) {
      setFollowing(!next);
      return;
    }
    setFollowing(confirmed);
    onChange?.(confirmed);
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      aria-pressed={following}
      className={`pressable group rounded-full font-semibold transition-colors duration-200 disabled:opacity-60 ${
        size === 'sm' ? 'px-3 py-1.5 text-caption' : 'px-4 py-2 text-detail'
      } ${
        following
          ? 'border border-line text-ink-soft hover:border-danger/40 hover:bg-danger/5 hover:text-danger'
          : 'bg-ink text-white hover:bg-ink/90'
      }`}
    >
      {following ? (
        <>
          <span className="group-hover:hidden">Following</span>
          <span className="hidden group-hover:inline">Unfollow</span>
        </>
      ) : (
        'Follow'
      )}
    </button>
  );
}
