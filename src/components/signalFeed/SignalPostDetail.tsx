import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { SignalLogo } from '../SignalLogo';
import { fetchEmpirePostById, fetchEmpireFeed, type EmpirePost } from '../../lib/data/empireFeed';
import { SignalPostCard } from './SignalPostCard';

/** The /signal/post/:id deep-link target — a focused overlay on top of the
 *  live feed (never a standalone page), so closing it always returns to
 *  the feed exactly where it was scrolled, no re-fetch or lost position.
 *  Reuses `SignalPostCard` verbatim for the post itself (full body, full
 *  like/comment/save/share/admin-menu — nothing here reimplements that),
 *  and adds a small "More from Signal" strip pulled from the same
 *  category. Handles the loading / not-found (deleted, bad id) / error
 *  states explicitly rather than ever rendering a blank or broken shell. */
export function SignalPostDetail({
  postId,
  canManage,
  onClose,
}: {
  postId: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const [post, setPost] = useState<EmpirePost | null | 'error'>(null);
  const [loaded, setLoaded] = useState(false);
  const [related, setRelated] = useState<EmpirePost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setPost(null);
    fetchEmpirePostById(postId)
      .then((p) => {
        if (cancelled) return;
        setPost(p);
        setLoaded(true);
        if (p) {
          fetchEmpireFeed(5, undefined, p.category)
            .then((rows) => !cancelled && setRelated(rows.filter((r) => r.id !== p.id).slice(0, 4)))
            .catch(() => !cancelled && setRelated([]));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPost('error');
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  return (
    <div className="fixed inset-0 z-[250] overflow-y-auto bg-bg">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/92 px-4 py-3 backdrop-blur-md pt-safe">
        <button onClick={onClose} aria-label="Back to Signal" className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
          <Icon name="chevronLeft" size={20} />
        </button>
        <span className="font-display font-semibold text-ink">Post</span>
      </div>

      <div className="mx-auto w-full max-w-xl px-3 py-4 sm:px-4 sm:py-6">
        {!loaded ? (
          <div className="card mb-4 animate-pulse p-4">
            <div className="skeleton mb-3 h-10 w-10 rounded-full" />
            <div className="skeleton mb-2 h-4 w-3/4 rounded-md" />
            <div className="skeleton h-40 w-full rounded-lg" />
          </div>
        ) : post === 'error' ? (
          <div className="py-24 text-center">
            <SignalLogo size={48} className="mx-auto opacity-50" />
            <p className="mt-4 text-body text-muted">Couldn't load this post. Check your connection and try again.</p>
          </div>
        ) : post === null ? (
          <div className="py-24 text-center">
            <SignalLogo size={48} className="mx-auto opacity-50" />
            <p className="mt-4 text-body text-muted">This post has been removed or no longer exists.</p>
          </div>
        ) : (
          <>
            <SignalPostCard
              post={post}
              canManage={canManage}
              onChanged={(updated) => setPost(updated)}
              onDeleted={onClose}
            />

            {related && related.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-3 text-detail font-semibold uppercase tracking-wide text-muted">More from Signal</h2>
                <div className="flex flex-col gap-2">
                  {related.map((r) => (
                    <Link key={r.id} to={`/signal/post/${r.id}`} className="pressable flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 hover:border-line-strong">
                      {r.mediaUrls[0] ? (
                        <img src={r.mediaUrls[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-panel text-muted"><Icon name="image" size={16} /></span>
                      )}
                      <p className="min-w-0 truncate text-detail font-medium text-ink">{r.title || r.body}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
