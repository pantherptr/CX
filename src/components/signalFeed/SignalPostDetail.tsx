import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../Icon';
import { SignalLogo } from '../SignalLogo';
import { fetchEmpirePostById, fetchEmpireFeed, withoutSpotlightPosts, SPOTLIGHT_POST_MARKER, type EmpirePost } from '../../lib/data/empireFeed';
import { fetchSpotlightFeed, type SpotlightCardData } from '../../lib/data/spotlight';
import { fetchSignalDemoPostById, fetchSignalDemoPosts } from '../../lib/data/signalDemo';
import { useLocale } from '../../lib/i18n';
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
  // A Signal Spotlight's team post: its card is drawn from the Spotlight entry.
  const [spotlight, setSpotlight] = useState<SpotlightCardData | null>(null);
  useEffect(() => {
    if (!post || post === 'error' || post.body !== SPOTLIGHT_POST_MARKER) { setSpotlight(null); return; }
    let cancelled = false;
    fetchSpotlightFeed(20).then((rows) => { if (!cancelled) setSpotlight(rows.find((r) => r.postId === post.id) ?? null); });
    return () => { cancelled = true; };
  }, [post]);
  const { toast } = useApp();
  const { t } = useLocale();
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
        if (p) {
          const rows = p.isDemo ? fetchSignalDemoPosts(7) : fetchEmpireFeed(7, undefined, undefined, { scope });
          rows
            .then((list) => !cancelled && setRelated(withoutSpotlightPosts(list).filter((r) => r.id !== p.id).slice(0, 5)))
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
              detail
              post={post}
              canManage={canManage}
              spotlight={spotlight ?? undefined}
              spotlightAll={spotlight ? [spotlight] : undefined}
              onChanged={(updated) => setPost(updated)}
              onDeleted={onClose}
            />

            {related && related.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 px-1 font-display text-lead font-semibold text-ink">{t('Keep discovering')}</h2>
                {related.map((r) => (
                  <SignalPostCard
                    key={r.id}
                    post={r}
                    canManage={canManage}
                    onChanged={(updated) => setRelated((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)))}
                    onDeleted={(id) => setRelated((prev) => (prev ?? []).filter((x) => x.id !== id))}
                  />
                ))}
                <Link to={base} className="pressable mx-auto mt-1 flex w-fit items-center gap-1.5 rounded-full bg-panel px-5 py-2.5 text-detail font-semibold text-ink">
                  {t('Back to the feed')} <Icon name="arrowRight" size={15} />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
