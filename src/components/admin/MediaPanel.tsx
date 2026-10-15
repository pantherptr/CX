import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { Modal } from '../primitives';
import { useApp } from '../../lib/store';
import { uiLocale } from '../../lib/i18n/uiLocale';
import { variantUrl } from '../../lib/imageVariants';
import { deleteEmpirePost } from '../../lib/data/empireFeed';
import { fetchMediaOverview, fetchRecentMediaPosts, type MediaOverview, type MediaPost } from '../../lib/data/mediaAdmin';

const fmtBytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
const fmtWhen = (iso: string) => new Date(iso).toLocaleString(uiLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Owner / Admin: what is being uploaded, and a quick queue to look at the newest photos and videos and remove
 *  what should not be there. */
export function MediaPanel() {
  const { toast } = useApp();
  const [overview, setOverview] = useState<MediaOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [posts, setPosts] = useState<MediaPost[] | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [removing, setRemoving] = useState<MediaPost | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchMediaOverview().then((r) => { setOverview(r.data); setOverviewError(r.error); });
    void fetchRecentMediaPosts(24).then((r) => { setPosts(r.data); setPostsError(r.error); setMore(r.data.length === 24); });
  }, []);

  const loadMore = async () => {
    if (!posts?.length) return;
    setLoadingMore(true);
    const r = await fetchRecentMediaPosts(24, posts[posts.length - 1].createdAt);
    setLoadingMore(false);
    if (r.error) { toast({ title: 'Could not load more', desc: r.error, icon: 'info' }); return; }
    setPosts((cur) => [...(cur ?? []), ...r.data.filter((p) => !(cur ?? []).some((c) => c.id === p.id))]);
    setMore(r.data.length === 24);
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    const { error } = await deleteEmpirePost(removing.id);
    setBusy(false);
    if (error) { toast({ title: 'Could not remove', desc: error, icon: 'info' }); return; }
    setPosts((cur) => cur?.filter((p) => p.id !== removing.id) ?? cur);
    setRemoving(null);
    toast({ title: 'Post removed', icon: 'checkCircle' });
  };

  const total = overview?.buckets.reduce((s, b) => s + b.bytes, 0) ?? 0;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-lead font-semibold text-ink">Uploads</h2>
        <p className="mt-1 text-detail text-muted">What is stored and what came in over the last 24 hours.</p>
        {overviewError ? (
          <p className="mt-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">{overviewError} — run migration 0136 in Supabase if you have not yet.</p>
        ) : !overview ? (
          <p className="py-6 text-center text-detail text-muted">Loading…</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['Stored', fmtBytes(total)],
                ['Files', overview.buckets.reduce((s, b) => s + b.files, 0).toLocaleString(uiLocale())],
                ['Last 24 h', `${overview.last24h.files.toLocaleString(uiLocale())} files`],
                ['Last 24 h size', fmtBytes(overview.last24h.bytes)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="text-caption font-semibold uppercase tracking-wide text-muted">{k}</p>
                  <p className="mt-1 font-display text-lead font-bold text-ink">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surface p-4">
                <p className="mb-2 text-detail font-semibold text-ink">By bucket</p>
                <ul className="divide-y divide-line">
                  {overview.buckets.map((b) => (
                    <li key={b.bucket} className="flex items-center justify-between gap-3 py-2 text-detail">
                      <span className="min-w-0 truncate text-ink-soft">{b.bucket}</span>
                      <span className="shrink-0 text-muted">{b.files} · {fmtBytes(b.bytes)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-line bg-surface p-4">
                <p className="mb-2 text-detail font-semibold text-ink">Most uploads, last 24 h</p>
                {overview.topUploaders.length === 0 ? (
                  <p className="py-2 text-detail text-muted">Nobody yet.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {overview.topUploaders.map((u) => (
                      <li key={u.userId} className="flex items-center justify-between gap-3 py-2 text-detail">
                        <Link to={`/signal/profile/${u.userId}`} className="min-w-0 truncate font-medium text-ink hover:underline">{u.name}</Link>
                        <span className="shrink-0 text-muted">{u.files} · {fmtBytes(u.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="font-display text-lead font-semibold text-ink">Newest photos and videos</h2>
        <p className="mt-1 text-detail text-muted">A quick look at what was just published. Remove what should not be there.</p>
        {postsError ? (
          <p className="mt-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">{postsError}</p>
        ) : posts === null ? (
          <p className="py-8 text-center text-detail text-muted">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-line bg-surface px-4 py-10 text-center text-detail text-muted">No posts with media yet.</p>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
                  <div className={`grid gap-px bg-line ${p.items.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {p.items.slice(0, 4).map((m, i) => (
                      <div key={i} className="relative aspect-[4/3] bg-panel">
                        {m.kind === 'image' ? (
                          <img src={variantUrl(m.url, 480)} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-muted"><Icon name="play" size={26} fill /></span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="p-3.5">
                    <p className="truncate text-detail font-semibold text-ink">{p.authorName}</p>
                    {p.text && <p className="mt-0.5 line-clamp-2 text-caption text-muted">{p.text}</p>}
                    <p className="mt-1 text-caption text-faint">{fmtWhen(p.createdAt)} · {p.items.length} {p.items.length === 1 ? 'file' : 'files'}</p>
                    <div className="mt-3 flex gap-2">
                      <Link to={`/signal/post/${p.id}`} className="rounded-full bg-panel px-3 py-1.5 text-caption font-semibold text-ink">Open</Link>
                      <button type="button" onClick={() => setRemoving(p)} className="rounded-full px-3 py-1.5 text-caption font-semibold text-danger hover:bg-danger/10">Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {more && (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn btn-sm border border-line-strong bg-surface text-ink">
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <Modal open={removing !== null} onClose={() => !busy && setRemoving(null)} labelledBy="media-remove-title" className="p-5 sm:p-6">
        <h3 id="media-remove-title" className="font-display text-lead font-semibold text-ink">Remove this post?</h3>
        <p className="mt-1 text-detail text-ink-soft">
          The post by <span className="font-semibold text-ink">{removing?.authorName}</span> and its files are deleted for good.
        </p>
        <div className="mt-5 flex gap-2.5">
          <button type="button" onClick={() => setRemoving(null)} disabled={busy} className="btn btn-block border border-line-strong bg-surface text-ink">Cancel</button>
          <button type="button" onClick={() => void remove()} disabled={busy} className="btn btn-primary btn-block">{busy ? 'Removing…' : 'Remove'}</button>
        </div>
      </Modal>
    </div>
  );
}
