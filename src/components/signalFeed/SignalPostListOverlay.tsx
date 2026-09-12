import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { SignalLogo } from '../SignalLogo';
import { SignalPostCard } from './SignalPostCard';
import type { EmpirePost } from '../../lib/data/empireFeed';

/** A small, generic "list of Signal posts" overlay — powers both "My
 *  Posts" and "Saved" from the Quick Control. Same fixed-overlay/sticky-
 *  header shape as `SignalPostDetail`/`SignalProfileDetail`, kept generic
 *  rather than forked twice since the only real difference between the
 *  two is which fetcher/empty-state copy is passed in. */
export function SignalPostListOverlay({
  title,
  emptyMessage,
  canManage,
  fetcher,
  onClose,
}: {
  title: string;
  emptyMessage: string;
  canManage: boolean;
  fetcher: () => Promise<EmpirePost[]>;
  onClose: () => void;
}) {
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    fetcher()
      .then((rows) => !cancelled && setPosts(rows))
      .catch(() => !cancelled && setPosts([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[250] overflow-y-auto bg-bg">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/92 px-4 py-3 backdrop-blur-md pt-safe">
        <button onClick={onClose} aria-label="Back to Signal" className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
          <Icon name="chevronLeft" size={20} />
        </button>
        <span className="font-display font-semibold text-ink">{title}</span>
      </div>

      <div className="mx-auto w-full max-w-xl px-3 py-4 sm:px-4 sm:py-6">
        {posts === null ? (
          <div className="card animate-pulse p-4">
            <div className="skeleton mb-3 h-10 w-10 rounded-full" />
            <div className="skeleton h-24 w-full rounded-lg" />
          </div>
        ) : posts.length === 0 ? (
          <div className="py-24 text-center">
            <SignalLogo size={48} className="mx-auto opacity-50" />
            <p className="mt-4 text-body text-muted">{emptyMessage}</p>
          </div>
        ) : (
          posts.map((post) => (
            <SignalPostCard
              key={post.id}
              post={post}
              canManage={canManage}
              onChanged={(updated) => setPosts((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)))}
              onDeleted={(id) => setPosts((prev) => (prev ?? []).filter((p) => p.id !== id))}
            />
          ))
        )}
      </div>
    </div>
  );
}
