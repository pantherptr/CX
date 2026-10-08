import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import {
  fetchMyCollections, fetchCollectionIdsForPost, createCollection, addPostToCollection, removePostFromCollection,
  type PostCollection,
} from '../../lib/data/collections';
import { useApp } from '../../lib/store';

/** "Save to a collection": your own folders for saved posts. Tap a folder to
 *  put the post in it (or take it out); make a new one on the spot. Private
 *  to you. */
export function SignalCollectionsSheet({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { toast } = useApp();
  const [collections, setCollections] = useState<PostCollection[] | null>(null);
  const [inIds, setInIds] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyCollections(), fetchCollectionIdsForPost(postId)]).then(([cols, ids]) => {
      if (cancelled) return;
      setCollections(cols);
      setInIds(new Set(ids));
    });
    return () => { cancelled = true; };
  }, [postId]);

  const toggle = async (c: PostCollection) => {
    const has = inIds.has(c.id);
    setInIds((prev) => {
      const n = new Set(prev);
      if (has) n.delete(c.id); else n.add(c.id);
      return n;
    });
    const { error: err } = has ? await removePostFromCollection(c.id, postId) : await addPostToCollection(c.id, postId);
    if (err) {
      setInIds((prev) => {
        const n = new Set(prev);
        if (has) n.add(c.id); else n.delete(c.id);
        return n;
      });
      toast({ title: 'Could not update the collection', desc: err, icon: 'info' });
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    const { collection, error: err } = await createCollection(trimmed);
    if (err || !collection) {
      setError(err ?? 'Could not create the collection.');
      setCreating(false);
      return;
    }
    await addPostToCollection(collection.id, postId);
    setCollections((prev) => [...(prev ?? []), collection]);
    setInIds((prev) => new Set(prev).add(collection.id));
    setName('');
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 animate-fade-in sm:items-center" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="flex max-h-[80dvh] w-full max-w-md animate-fade-up flex-col overflow-hidden rounded-t-3xl bg-surface sm:rounded-3xl"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="font-display text-lead font-semibold text-ink">Collections</h2>
          <button onClick={onClose} aria-label="Close" className="pressable grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-panel">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {collections === null ? (
            <div className="space-y-2 px-2 py-2">
              <div className="skeleton h-12 w-full rounded-xl" />
              <div className="skeleton h-12 w-full rounded-xl" />
            </div>
          ) : collections.length === 0 ? (
            <p className="px-3 py-6 text-center text-detail text-muted">No collections yet — make your first one below.</p>
          ) : (
            collections.map((c) => {
              const on = inIds.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void toggle(c)}
                  className="pressable flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left active:bg-panel"
                >
                  <span className="truncate text-[15px] font-medium text-ink">{c.name}</span>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors ${on ? 'border-accent-bright bg-accent-bright text-white' : 'border-line-strong text-transparent'}`}>
                    <Icon name="check" size={14} strokeWidth={3} />
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-line px-5 pt-3">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
              placeholder="New collection"
              maxLength={40}
              className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-panel px-4 text-[16px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
            />
            <button
              type="button"
              onClick={() => void create()}
              disabled={!name.trim() || creating}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-ink px-5 text-detail font-semibold text-white disabled:opacity-40"
            >
              Create
            </button>
          </div>
          {error && <p className="mt-2 text-caption font-medium text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}
