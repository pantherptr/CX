import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../Icon';
import { useEmpireTrendingPosts, type EmpireFeedScope } from '../../lib/data/empireFeed';

/** A quiet "Trending" strip — real engagement only (see
 *  fetch_empire_trending_posts), never manufactured, and never shown as
 *  a number either — a post lands here because it genuinely cleared the
 *  engagement bar, but per the "no public engagement counters" redesign
 *  this surfaces as inclusion in the strip itself, not a visible
 *  like/view count on the card. Deliberately NOT another row of full
 *  SignalPostCards: a compact horizontal strip keeps it feeling like a
 *  light signal, not a second feed. Collapses to nothing until at least
 *  one post actually clears the engagement bar.
 *
 *  `scope`/`authorKind` scope this to Official or Community (see
 *  0049_signal_split_official_community.sql) — Official's own Trending
 *  never surfaces a stray community post and vice versa; Community
 *  reuses this same component as its "Popular" Discovery chip. */
export function SignalTrendingSection({ scope, authorKind }: EmpireFeedScope = {}) {
  const { posts } = useEmpireTrendingPosts({ scope, authorKind });
  const { pathname } = useLocation();
  const base = pathname.startsWith('/signal/community') ? '/signal/community' : '/signal';

  if (!posts || posts.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-3 flex items-center gap-1.5 text-detail font-semibold uppercase tracking-wide text-muted">
        <Icon name="trending" size={14} /> Trending
      </h2>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {posts.map((p) => (
          <Link
            key={p.id}
            to={`${base}/post/${p.id}`}
            className="pressable flex w-40 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface"
          >
            <div className="relative aspect-[4/3] w-full bg-panel">
              {p.mediaUrls[0] ? (
                <img src={p.mediaUrls[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="grid h-full w-full place-items-center text-muted"><Icon name="image" size={20} /></span>
              )}
            </div>
            <div className="p-2.5">
              <p className="line-clamp-2 text-caption font-semibold text-ink">{p.title || p.body}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
