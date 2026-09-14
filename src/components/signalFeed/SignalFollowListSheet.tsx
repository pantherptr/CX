import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../Icon';
import { useSheetDrag } from '../motion';
import { VerifiedBadge } from '../primitives';
import { fetchProfileFollowers, fetchProfileFollowing, type FollowListUser } from '../../lib/data/signalProfile';

/** Followers/Following — real rows off `profile_follows`, no fabricated
 *  counts or names. Tapping a row jumps straight to that person's real
 *  profile (space-aware, same pattern every other Signal link uses) and
 *  closes this sheet, rather than stacking a second profile overlay on
 *  top of it. */
export function SignalFollowListSheet({
  userId,
  mode,
  onClose,
}: {
  userId: string;
  mode: 'followers' | 'following';
  onClose: () => void;
}) {
  const { pathname } = useLocation();
  const base = pathname.startsWith('/signal/community') ? '/signal/community' : '/signal';
  const { handlers, style, closing, requestClose } = useSheetDrag(onClose);
  const [users, setUsers] = useState<FollowListUser[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUsers(null);
    const fetcher = mode === 'followers' ? fetchProfileFollowers : fetchProfileFollowing;
    fetcher(userId)
      .then((rows) => { if (!cancelled) setUsers(rows); })
      .catch(() => { if (!cancelled) setUsers([]); });
    return () => { cancelled = true; };
  }, [userId, mode]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 animate-fade-in sm:items-center"
      style={{ opacity: closing ? 0 : undefined, transition: 'opacity 220ms var(--ease-out-expo)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[75vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface animate-sheet-in sm:h-auto sm:max-h-[70vh] sm:max-w-sm sm:rounded-2xl"
        style={style}
      >
        <div {...handlers} className="flex flex-col items-center pt-2 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-line" aria-hidden="true" />
        </div>
        <div {...handlers} className="flex items-center gap-2 border-b border-line px-5 py-4">
          <span className="font-display font-semibold capitalize text-ink">{mode}</span>
          <button onClick={requestClose} aria-label="Close" className="pressable ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
            <Icon name="x" size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {users === null ? (
            <div className="space-y-1 p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 p-2">
                  <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
                  <div className="skeleton h-3.5 w-32 rounded-md" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="py-10 text-center text-detail text-muted">
              {mode === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </p>
          ) : (
            users.map((u) => {
              const role: 'host' | 'client' | null = u.isHost ? 'host' : u.isVerifiedClient ? 'client' : null;
              return (
                <Link
                  key={u.id}
                  to={`${base}/profile/${u.id}`}
                  viewTransition
                  onClick={requestClose}
                  className="pressable flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-panel"
                >
                  {u.avatarUrl ? (
                    <img src={u.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft">
                      <Icon name="user" size={18} />
                    </span>
                  )}
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-detail font-semibold text-ink">{u.fullName}</span>
                    {role && <VerifiedBadge role={role} size={13} />}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
