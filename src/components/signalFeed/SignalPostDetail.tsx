import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { SignalLogo } from '../SignalLogo';
import { fetchEmpirePostById, fetchEmpireFeed, type EmpirePost } from '../../lib/data/empireFeed';
import { fetchSignalDemoPostById } from '../../lib/data/signalDemo';
import { SignalPostCard } from './SignalPostCard';
import { shareLink } from '../../lib/native';
import { useApp } from '../../lib/store';

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
  const { toast } = useApp();
  const { pathname } = useLocation();
  const base = pathname.startsWith('/signal/community') ? '/signal/community' : '/signal';
  const scope = base === '/signal/community' ? 'community' : 'official';

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setPost(null);
    // A demo post lives in a fully separate table (see signalDemo.ts) —
    // tried second, only when the real lookup genuinely comes back empty,
    // so a real deleted/bad id still reads as "removed" rather than a
    // demo post masking that distinction.
    fetchEmpirePostById(postId)
      .then((p) => (p ? p : fetchSignalDemoPostById(postId)))
      .then((p) => {
        if (cancelled) return;
        setPost(p);
        setLoaded(true);
        if (p && !p.isDemo) {
          fetchEmpireFeed(5, undefined, undefined, { scope })
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
  }, [postId, scope]);

  return (
    <div className="fixed inset-0 z-[250] overflow-y-auto bg-bg animate-scale-in">
      <div
        className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/92 px-3 pb-2 backdrop-blur-md"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}
      >
        <button onClick={onClose} aria-label="Back to Signal" className="pressable grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-panel">
          <Icon name="chevronLeft" size={22} />
        </button>
        <span className="flex-1 font-display text-lead font-semibold text-ink">Post details</span>
        {post && post !== 'error' && (
          <button
            onClick={async () => {
              const url = `${window.location.origin}${base}/post/${postId}`;
              const r = await shareLink({ title: post.title || 'CX Rent — Signal', text: post.body.slice(0, 140), url });
              if (r === 'copied') toast({ title: 'Link copied to clipboard', icon: 'check' });
            }}
            aria-label="Share post"
            className="pressable grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-panel"
          >
            <Icon name="share" size={19} />
          </button>
        )}
      </div>

      <div className="mx-auto w-full max-w-xl px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-4 sm:pt-6">
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
              <div className="mt-8">
                <h2 className="mb-3 px-1 font-display text-lead font-semibold text-ink">More from Signal</h2>
                <div className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:-mx-4 sm:px-4">
                  {related.map((r) => {
                    const media = r.mediaUrls.find((u) => !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(u));
                    const isVideo = !media && r.mediaUrls.length > 0;
                    return (
                      <Link
                        key={r.id}
                        to={`${base}/post/${r.id}`}
                        className="pressable group relative aspect-[4/5] w-44 shrink-0 snap-start overflow-hidden rounded-3xl bg-noir shadow-[0_18px_36px_-22px_rgba(0,0,0,0.55)] ring-1 ring-black/[0.06]"
                      >
                        {media ? (
                          <Img
                            src={media}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            fallback={<span className="absolute inset-0 grid place-items-center bg-panel text-muted"><Icon name="image" size={22} /></span>}
                          />
                        ) : (
                          <span className="absolute inset-0 bg-gradient-to-br from-noir-2 via-noir to-accent-700/40" />
                        )}
                        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
                        {isVideo && (
                          <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white"><Icon name="play" size={12} fill /></span>
                        )}
                        <span className="absolute inset-x-3.5 bottom-3.5 text-white">
                          <span className="line-clamp-3 block text-[14px] font-semibold leading-snug">{r.title || r.body || 'Photo / Video'}</span>
                          <span className="mt-1.5 flex items-center gap-1.5 text-caption text-white/75">
                            {r.authorAvatarUrl ? (
                              <img src={r.authorAvatarUrl} alt="" className="h-4 w-4 rounded-full object-cover ring-1 ring-white/40" />
                            ) : (
                              <Icon name="user" size={12} />
                            )}
                            <span className="truncate">{r.authorName}</span>
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
