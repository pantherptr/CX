import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmpireLogo } from '../components/EmpireLogo';
import { PremiumPageLoader } from '../components/PremiumLoader';
import { EmpireFeedHeader } from '../components/empireFeed/EmpireFeedHeader';
import { EmpirePostComposer } from '../components/empireFeed/EmpirePostComposer';
import { EmpirePostCard } from '../components/empireFeed/EmpirePostCard';
import { useAuth } from '../lib/auth';
import { useEmpireFeed, markEmpireFeedSeen } from '../lib/data/empireFeed';

/** EMPIRE — the official CX Rent social/news feed. Owner/Admin publish;
 *  every signed-in user views, likes, comments, saves and shares. A
 *  dedicated fullscreen route (a MarketingLayout sibling in App.tsx, no
 *  site Navbar/Footer) with its own minimal header — see
 *  EmpireFeedHeader — rather than the elaborate multi-tab shell the old
 *  City Empire game used, since a single feed has nothing to tab
 *  between. */
export default function Empire() {
  const { session, profile } = useAuth();
  const canManage = Boolean(profile?.is_admin || profile?.is_owner);
  const { posts, loadMore, loadingMore, hasMore, refresh, patchPost, removePost } = useEmpireFeed();
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (session) markEmpireFeedSeen();
  }, [session]);

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

        {posts === null ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <PremiumPageLoader size={70} />
          </div>
        ) : posts.length === 0 ? (
          <div className="py-24 text-center">
            <EmpireLogo size={48} className="mx-auto opacity-50" />
            <p className="mt-4 text-body text-muted">Nothing published yet — check back soon.</p>
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
