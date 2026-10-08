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

  const [idsByCollection, setIdsByCollection] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    if (!withCollections) return;
    let cancelled = false;
    fetchMyCollections().then(async (rows) => {
      if (cancelled) return;
      setCollections(rows);
      const entries = await Promise.all(rows.map(async (c) => [c.id, new Set(await fetchCollectionPostIds(c.id))] as const));
      if (!cancelled) setIdsByCollection(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [withCollections]);

  const isVideoUrl = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);
  const coverFor = (ids: Set<string> | null) => {
    const pool = (posts ?? []).filter((p) => !ids || ids.has(p.id));
    for (const p of pool) {
      const img = p.mediaUrls.find((u) => !isVideoUrl(u));
      if (img) return img;
    }
    return null;
  };
  const countFor = (ids: Set<string> | null) => (posts ?? []).filter((p) => !ids || ids.has(p.id)).length;

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

      {withCollections && collections.length > 0 && posts && posts.length > 0 && (
        <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-3 px-3 pt-4 sm:px-4">
          {[{ id: null as string | null, name: 'All saved' }, ...collections].map((c) => {
            const ids = c.id ? idsByCollection[c.id] ?? new Set<string>() : null;
            const cover = coverFor(ids);
            const active = activeCollection === c.id;
            return (
              <button
                key={c.id ?? 'all'}
                type="button"
                onClick={() => setActiveCollection(c.id)}
                className={`pressable group relative aspect-[4/3] overflow-hidden rounded-2xl text-left shadow-[0_14px_30px_-18px_rgba(0,0,0,0.45)] transition-all ${
                  active ? 'ring-2 ring-accent-bright ring-offset-2 ring-offset-bg' : 'ring-1 ring-black/[0.06]'
                }`}
              >
                {cover ? (
                  <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-accent-050 to-panel text-accent-700">
                    <Icon name="bookmark" size={30} />
                  </span>
                )}
                <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <span className="absolute inset-x-3 bottom-2.5 text-white">
                  <span className="block truncate text-detail font-semibold leading-tight">{c.name}</span>
                  <span className="block text-caption text-white/75">{countFor(ids)}</span>
                </span>
              </button>
            );
          })}
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
