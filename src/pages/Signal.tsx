import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { SignalLogo } from '../components/SignalLogo';
import { SignalFeedHeader } from '../components/signalFeed/SignalFeedHeader';
import { SignalStoriesBar } from '../components/signalFeed/SignalStoriesBar';
import { SignalHighlightsBar } from '../components/signalFeed/SignalHighlightsBar';
import { SignalPostComposer } from '../components/signalFeed/SignalPostComposer';
import { SignalPostCard } from '../components/signalFeed/SignalPostCard';
import { SignalPostSkeleton } from '../components/signalFeed/SignalPostSkeleton';
import { SignalCategoryFilter } from '../components/signalFeed/SignalCategoryFilter';
import { SignalTrendingSection } from '../components/signalFeed/SignalTrendingSection';
import { SignalSearchOverlay } from '../components/signalFeed/SignalSearchOverlay';
import { SignalAnalyticsSheet } from '../components/signalFeed/SignalAnalyticsSheet';
import { SignalPostDetail } from '../components/signalFeed/SignalPostDetail';
import { SignalStoryViewer } from '../components/signalFeed/SignalStoryViewer';
import { useAuth } from '../lib/auth';
import {
  useEmpireFeed, useEmpirePinnedPost, useEmpireFeaturedPosts, markEmpireFeedSeen, type EmpireCategory,
} from '../lib/data/empireFeed';
import { useEmpireHighlights, highlightAsStory, deleteEmpireHighlight } from '../lib/data/empireHighlights';

/** SIGNAL (renamed from "Empire" — see empireFeed.ts's header for why the
 *  underlying `empire_*` data layer kept its name) — the official CX Rent
 *  social/news platform. Owner/Admin publish; every signed-in user views,
 *  likes, comments, saves and shares. A dedicated fullscreen route (a
 *  MarketingLayout sibling in App.tsx, no site Navbar/Footer) with its
 *  own minimal header.
 *
 *  Hierarchy, top to bottom — each optional section collapses to nothing
 *  (not an empty placeholder) when it has no content:
 *  Header -> active Stories -> permanent Highlights -> the one Pinned
 *  announcement -> Featured content -> the category filter -> the
 *  paginated feed -> Trending.
 *
 *  `/signal/post/:postId` and `/signal/highlight/:highlightId` render
 *  this same page with the item focused in an overlay on top of the live
 *  feed underneath, so closing it never loses scroll position or re-fetches.
 *  Old `/empire*` links redirect here — see `EmpireToSignalRedirect` in
 *  App.tsx. */
export default function Signal() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const { postId, highlightId } = useParams<{ postId?: string; highlightId?: string }>();
  const canManage = Boolean(profile?.is_admin || profile?.is_owner);
  const [category, setCategory] = useState<EmpireCategory | null>(null);
  const { posts, loadMore, loadingMore, hasMore, refresh, patchPost, removePost } = useEmpireFeed(category);
  const pinned = useEmpirePinnedPost();
  const featured = useEmpireFeaturedPosts();
  const { highlights } = useEmpireHighlights();
  const [composerOpen, setComposerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  useEffect(() => {
    if (session) markEmpireFeedSeen();
  }, [session]);

  const resyncAfterPin = () => {
    pinned.refresh();
    refresh();
  };
  const resyncAfterFeature = () => {
    featured.refresh();
    refresh();
  };

  const closeOverlay = () => navigate('/signal');

  if (!session) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-noir px-6 text-center">
        <SignalLogo size={88} />
        <div>
          <p className="text-detail font-bold uppercase tracking-[0.2em] text-accent-bright">CX SIGNAL</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-on-noir sm:text-4xl">The official voice of CX Rent.</h1>
          <p className="mt-2 max-w-sm text-copy leading-relaxed text-on-noir-muted">
            News, announcements and new cars, straight from the team.
          </p>
        </div>
        <Link to="/login" state={{ from: { pathname: '/signal' } }} className="btn btn-accent-bright btn-lg">
          Sign In <Icon name="arrowRight" size={17} />
        </Link>
        <Link to="/" className="text-detail font-medium text-on-noir-muted hover:text-on-noir">
          ← Back to CX Rent
        </Link>
      </div>
    );
  }

  const highlightIndex = highlightId && highlights ? highlights.findIndex((h) => h.id === highlightId) : -1;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <SignalFeedHeader
        signedIn
        onSearchClick={() => setSearchOpen(true)}
        canManage={canManage}
        onAnalyticsClick={() => setAnalyticsOpen(true)}
      />

      <main className="mx-auto w-full max-w-xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        <SignalStoriesBar canManage={canManage} />
        <SignalHighlightsBar canManage={canManage} />

        {pinned.post && (
          <SignalPostCard
            post={pinned.post}
            canManage={canManage}
            featured
            onChanged={(updated) => pinned.setPost(updated)}
            onDeleted={() => pinned.setPost(null)}
            onPinToggled={resyncAfterPin}
            onFeaturedToggled={resyncAfterFeature}
          />
        )}

        {featured.posts && featured.posts.length > 0 && (
          <div className="mb-2">
            {featured.posts.map((post) => (
              <SignalPostCard
                key={post.id}
                post={post}
                canManage={canManage}
                featured
                onChanged={featured.refresh}
                onDeleted={featured.refresh}
                onPinToggled={resyncAfterPin}
                onFeaturedToggled={resyncAfterFeature}
              />
            ))}
          </div>
        )}

        {canManage && (
          composerOpen ? (
            <SignalPostComposer
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

        <SignalCategoryFilter value={category} onChange={setCategory} />

        {posts === null ? (
          <>
            <SignalPostSkeleton />
            <SignalPostSkeleton />
            <SignalPostSkeleton />
          </>
        ) : posts.length === 0 ? (
          <div className="py-24 text-center">
            <SignalLogo size={48} className="mx-auto opacity-50" />
            <p className="mt-4 text-body text-muted">Signal is just getting started.</p>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <SignalPostCard
                key={post.id}
                post={post}
                canManage={canManage}
                onChanged={(updated) => patchPost(post.id, updated)}
                onDeleted={removePost}
                onPinToggled={resyncAfterPin}
                onFeaturedToggled={resyncAfterFeature}
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

        {category === null && <SignalTrendingSection />}
      </main>

      {postId && <SignalPostDetail postId={postId} canManage={canManage} onClose={closeOverlay} />}

      {highlightId && highlights && highlightIndex >= 0 && (
        <SignalStoryViewer
          stories={highlights.map(highlightAsStory)}
          startIndex={highlightIndex}
          canManage={canManage}
          onClose={closeOverlay}
          onStoryDeleted={closeOverlay}
          onMarkViewed={() => {}}
          onDeleteStory={deleteEmpireHighlight}
          deleteConfirmMessage="Delete this Highlight? This cannot be undone."
        />
      )}

      {searchOpen && <SignalSearchOverlay onClose={() => setSearchOpen(false)} />}
      {analyticsOpen && <SignalAnalyticsSheet onClose={() => setAnalyticsOpen(false)} />}
    </div>
  );
}
