import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmpireLogo } from '../components/EmpireLogo';
import { EmpireFeedHeader } from '../components/empireFeed/EmpireFeedHeader';
import { EmpireStoriesBar } from '../components/empireFeed/EmpireStoriesBar';
import { EmpirePostComposer } from '../components/empireFeed/EmpirePostComposer';
import { EmpirePostCard } from '../components/empireFeed/EmpirePostCard';
import { EmpirePostSkeleton } from '../components/empireFeed/EmpirePostSkeleton';
import { EmpireCategoryFilter } from '../components/empireFeed/EmpireCategoryFilter';
import { useAuth } from '../lib/auth';
import { useEmpireFeed, useEmpirePinnedPost, markEmpireFeedSeen, type EmpireCategory } from '../lib/data/empireFeed';

/** EMPIRE — the official CX Rent social/news feed. Owner/Admin publish;
 *  every signed-in user views, likes, comments, saves and shares. A
 *  dedicated fullscreen route (a MarketingLayout sibling in App.tsx, no
 *  site Navbar/Footer) with its own minimal header. Structure, top to
 *  bottom: EmpireFeedHeader -> Stories (collapses to nothing when there
 *  are none) -> the one Featured/pinned post (collapses to nothing when
 *  none is pinned) -> a category filter -> the paginated feed. */
export default function Empire() {
  const { session, profile } = useAuth();
  const canManage = Boolean(profile?.is_admin || profile?.is_owner);
  const [category, setCategory] = useState<EmpireCategory | null>(null);
  const { posts, loadMore, loadingMore, hasMore, refresh, patchPost, removePost } = useEmpireFeed(category);
  const pinned = useEmpirePinnedPost();
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (session) markEmpireFeedSeen();
  }, [session]);

  const resyncAfterPin = () => {
    pinned.refresh();
    refresh();
  };

  if (!session) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-noir px-6 text-center">
        <EmpireLogo size={88} />
        <div>
          <h1 className="font-display text-3xl font-semibold text-on-noir sm:text-4xl">EMPIRE</h1>
          <p className="mt-2 max-w-sm text-copy leading-relaxed text-on-noir-muted">
            The official voice of CX Rent — news, announcements and new cars, straight from the team.
          </p>
        </div>
        <Link to="/login" state={{ from: { pathname: '/empire' } }} className="btn btn-accent-bright btn-lg">
          Sign In <Icon name="arrowRight" size={17} />
        </Link>
        <Link to="/" className="text-detail font-medium text-on-noir-muted hover:text-on-noir">
          ← Back to CX Rent
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <EmpireFeedHeader signedIn />

      <main className="mx-auto w-full max-w-xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        <EmpireStoriesBar canManage={canManage} />

        {pinned.post && (
          <EmpirePostCard
            post={pinned.post}
            canManage={canManage}
            featured
            onChanged={(updated) => pinned.setPost(updated)}
            onDeleted={() => pinned.setPost(null)}
            onPinToggled={resyncAfterPin}
          />
        )}

        {canManage && (
          composerOpen ? (
            <EmpirePostComposer
              onDone={() => { setComposerOpen(false); refresh(); }}
              onCancel={() => setComposerOpen(false)}
            />
          ) : (
            <button
              onClick={() => setComposerOpen(true)}
              className="card mb-5 flex w-full items-center gap-3 p-4 text-left text-ink-soft transition-colors hover:border-line-strong"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel text-ink">
                <Icon name="plus" size={18} />
              </span>
              Share news, an announcement, a new car…
            </button>
          )
        )}

        <EmpireCategoryFilter value={category} onChange={setCategory} />

        {posts === null ? (
          <>
            <EmpirePostSkeleton />
            <EmpirePostSkeleton />
            <EmpirePostSkeleton />
          </>
        ) : posts.length === 0 ? (
          <div className="py-24 text-center">
            <EmpireLogo size={48} className="mx-auto opacity-50" />
            <p className="mt-4 text-body text-muted">Empire is just getting started.</p>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <EmpirePostCard
                key={post.id}
                post={post}
                canManage={canManage}
                onChanged={(updated) => patchPost(post.id, updated)}
                onDeleted={removePost}
                onPinToggled={resyncAfterPin}
              />
            ))}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn btn-secondary btn-block disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
