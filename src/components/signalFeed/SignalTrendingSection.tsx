import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { useEmpireTrendingPosts } from '../../lib/data/empireFeed';
import { compact } from '../../lib/format';

/** A quiet "Trending" strip — real engagement only (see
 *  fetch_empire_trending_posts), never manufactured. Deliberately NOT
 *  another row of full SignalPostCards: a compact horizontal strip keeps
 *  it feeling like a light signal, not a second feed. Collapses to
 *  nothing until at least one post actually clears the engagement bar. */
export function SignalTrendingSection() {
  const { posts } = useEmpireTrendingPosts();

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
            to={`/signal/post/${p.id}`}
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
              <p className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                <span className="inline-flex items-center gap-0.5"><Icon name="heart" size={11} /> {compact(p.likeCount)}</span>
                <span className="inline-flex items-center gap-0.5"><Icon name="message" size={11} /> {compact(p.commentCount)}</span>
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
