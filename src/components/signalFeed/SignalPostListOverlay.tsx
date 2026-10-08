import { SignalPostSkeleton } from './SignalPostSkeleton';
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { SignalLogo } from '../SignalLogo';
import { SignalPostCard } from './SignalPostCard';
import type { EmpirePost } from '../../lib/data/empireFeed';
import { fetchMyCollections, fetchCollectionPostIds, type PostCollection } from '../../lib/data/collections';

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
  withCollections = false,
}: {
  title: string;
  emptyMessage: string;
  canManage: boolean;
  fetcher: () => Promise<EmpirePost[]>;
  onClose: () => void;
  /** Show the viewer's collections as filter chips (the Saved list). */
  withCollections?: boolean;
}) {
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);
  const [collections, setCollections] = useState<PostCollection[]>([]);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [collectionPostIds, setCollectionPostIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!withCollections) return;
    fetchMyCollections().then(setCollections);
  }, [withCollections]);

  useEffect(() => {
    if (!activeCollection) {
      setCollectionPostIds(null);
      return;
    }
    let cancelled = false;
    fetchCollectionPostIds(activeCollection).then((ids) => { if (!cancelled) setCollectionPostIds(new Set(ids)); });
    return () => { cancelled = true; };
  }, [activeCollection]);

  const shown = posts && collectionPostIds ? posts.filter((p) => collectionPostIds.has(p.id)) : posts;

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
    <div className="fixed inset-0 z-[250] overflow-y-auto bg-bg animate-scale-in">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/92 px-4 py-3 backdrop-blur-md pt-safe">
        <button onClick={onClose} aria-label="Back to Signal" className="pressable grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-lead font-semibold text-ink">{title}</p>
          {shown && shown.length > 0 && <p className="text-caption text-faint">{shown.length}</p>}
        </div>
      </div>

      {withCollections && collections.length > 0 && (
        <div className="no-scrollbar mx-auto flex w-full max-w-xl gap-1.5 overflow-x-auto px-3 pt-3 sm:px-4">
          {[{ id: null as string | null, name: 'All' }, ...collections].map((c) => (
            <button
              key={c.id ?? 'all'}
              type="button"
              onClick={() => setActiveCollection(c.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-detail font-semibold transition-all ${
                activeCollection === c.id ? 'bg-ink text-white shadow-[0_8px_18px_-8px_rgba(0,0,0,0.5)]' : 'bg-panel text-ink-soft hover:bg-panel-2'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto w-full max-w-xl px-3 py-4 sm:px-4 sm:py-6">
        {posts === null ? (
          <>
            <SignalPostSkeleton />
            <SignalPostSkeleton />
          </>
        ) : (shown ?? []).length === 0 ? (
          <div className="flex flex-col items-center px-6 py-20 text-center">
            <span className="grid h-24 w-24 place-items-center rounded-full bg-accent-050 shadow-[0_18px_40px_-18px_rgba(0,212,71,0.55)] ring-1 ring-accent-bright/20">
              <SignalLogo size={52} />
            </span>
            <p className="mt-5 max-w-[18rem] text-body text-muted">{emptyMessage}</p>
          </div>
        ) : (
          (shown ?? []).map((post) => (
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
