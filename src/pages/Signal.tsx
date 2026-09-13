import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { SignalProfileDetail } from '../components/signalFeed/SignalProfileDetail';
import { SignalPostListOverlay } from '../components/signalFeed/SignalPostListOverlay';
import { SignalQuickControl } from '../components/signalFeed/SignalQuickControl';
import { SignalStoryViewer } from '../components/signalFeed/SignalStoryViewer';
import { useAuth } from '../lib/auth';
import {
  useEmpireFeed, useEmpirePinnedPost, useEmpireFeaturedPosts, markEmpireFeedSeen,
  fetchEmpirePostsByAuthor, fetchEmpireSavedPosts, type EmpireCategory,
} from '../lib/data/empireFeed';
import { useEmpireHighlights, highlightAsStory, deleteEmpireHighlight } from '../lib/data/empireHighlights';

/** SIGNAL (renamed from "Empire" — see empireFeed.ts's header for why the
 *  underlying `empire_*` data layer kept its name) — CX Rent's social/news
 *  platform, split into two spaces sharing one shell:
 *
 *  - **Official** (`/signal`, the default) — "CX Rent speaks": Owner/CX
 *    Assistant/CX only, editorial ordering, Pinned/Featured/Highlights.
 *  - **Community** (`/signal/community`) — "the CX Rent community
 *    speaks": real Hosts/Verified Clients under their own identity, one
 *    plain-recency feed, no filters/tabs — Stories, an eligible-user
 *    composer, then every Community post in order. Pinned/Featured/
 *    Highlights stay Official-only editorial tools; Community
 *    deliberately has no equivalent — it's a feed, not a dashboard.
 *
 *  `publisher_type` already encodes this split (`owner`/`assistant`/`cx`
 *  = Official, `self` = Community) — see
 *  0049_signal_split_official_community.sql — so this page is a routing
 *  + filtering branch on top of the one existing feed/Stories/comments/
 *  profile system, not a second implementation of any of them.
 *
 *  `/signal/post/:postId`, `/signal/profile/:authorId` (and their
 *  `/signal/community/...` twins) render this same page with the item
 *  focused in an overlay on top of the live feed underneath, so closing
 *  it never loses scroll position or re-fetches — `closeOverlay` returns
 *  to whichever space the overlay was opened from. `/signal/highlight/:id`
 *  has no Community twin — Highlights are Official-only. Old `/empire*`
 *  links redirect here — see `EmpireToSignalRedirect` in App.tsx. */
export default function Signal() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { postId, highlightId, authorId } = useParams<{ postId?: string; highlightId?: string; authorId?: string }>();
  const space: 'official' | 'community' = pathname.startsWith('/signal/community') ? 'community' : 'official';
  const base = space === 'community' ? '/signal/community' : '/signal';

  const canManage = Boolean(profile?.is_admin || profile?.is_owner);
  // A Host or Verified Client publishes under their own real identity
  // ('self', never one of the three official voices — see
  // signalIdentity.ts). Distinct from canManage, which is about
  // moderating everyone's content, not just being allowed to post at all.
  const canPublishSelf = Boolean(profile?.is_host || profile?.is_verified_client);
  const canPostHere = space === 'official' ? canManage : canPublishSelf;

  const [category, setCategory] = useState<EmpireCategory | null>(null);

  const officialFeed = useEmpireFeed(category, { scope: 'official' });
  const communityFeed = useEmpireFeed(null, { scope: 'community' });
  const { posts, loadMore, loadingMore, hasMore, refresh, patchPost, removePost } =
    space === 'official' ? officialFeed : communityFeed;

  const pinned = useEmpirePinnedPost();
  const featured = useEmpireFeaturedPosts();
  const { highlights } = useEmpireHighlights();
  const [composerOpen, setComposerOpen] = useState(false);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [myPostsOpen, setMyPostsOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

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

  const closeOverlay = () => navigate(base);

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

      <main className="mx-auto w-full max-w-xl flex-1 px-2.5 py-2.5 sm:px-4 sm:py-4">
        {space === 'community' && (
          <p className="mb-2.5 flex items-center gap-1.5 text-caption font-bold uppercase tracking-[0.14em] text-accent-700">
            <Icon name="users" size={13} /> Community
          </p>
        )}

        <SignalStoriesBar
          scope={space}
          canCreate={canPostHere}
          canManage={canManage}
          composerOpen={storyComposerOpen}
          onOpenComposer={() => setStoryComposerOpen(true)}
          onCloseComposer={() => setStoryComposerOpen(false)}
        />
        {/* Keyed by `space` alone (not the fuller `pathname`, which also
            changes for every post/profile overlay) — Signal.tsx itself
            no longer remounts on any internal navigation (see App.tsx's
            `pageKey`), so switching Official<->Community now needs its
            own small, scoped animation to still read as a deliberate
            transition rather than an abrupt content swap. Reuses the
            same fade+rise every post card already animates in with —
            one motion vocabulary, not a second one invented for this. */}
        <div key={space} className="animate-fade-up">
        {space === 'official' && <SignalHighlightsBar canManage={canManage} />}

        {space === 'official' && pinned.post && (
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

        {space === 'official' && featured.posts && featured.posts.length > 0 && (
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

        {canPostHere && (
          composerOpen ? (
            <SignalPostComposer
              mode={space === 'official' ? 'official' : 'self'}
              onDone={() => { setComposerOpen(false); refresh(); }}
              onCancel={() => setComposerOpen(false)}
            />
          ) : (
            <button
              onClick={() => setComposerOpen(true)}
              className="card mb-3 flex w-full items-center gap-3 p-3.5 text-left text-ink-soft transition-colors hover:border-line-strong"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel text-ink">
                <Icon name="plus" size={18} />
              </span>
              {space === 'official' ? 'Share news, an announcement, a new car…' : 'Share a photo, video, or update…'}
            </button>
          )
        )}

        {space === 'official' && <SignalCategoryFilter value={category} onChange={setCategory} />}

        {posts === null ? (
          <>
            <SignalPostSkeleton />
            <SignalPostSkeleton />
            <SignalPostSkeleton />
          </>
        ) : posts.length === 0 ? (
          <div className="py-24 text-center">
            <SignalLogo size={48} className="mx-auto opacity-50" />
            <p className="mt-4 text-body text-muted">
              {space === 'official' ? 'Signal is just getting started.' : 'Nothing here yet — check back soon.'}
            </p>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <SignalPostCard
                key={post.id}
                post={post}
                canManage={canManage}
                onChanged={(updated) => patchPost(post.id, updated)}
                onDeleted={(id) => removePost(id)}
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

        {space === 'official' && category === null && <SignalTrendingSection scope="official" />}
        </div>
      </main>

      {postId && <SignalPostDetail postId={postId} canManage={canManage} onClose={closeOverlay} />}

      {authorId && <SignalProfileDetail authorId={authorId} canManage={canManage} onClose={closeOverlay} />}

      {myPostsOpen && session && (
        <SignalPostListOverlay
          title="My Posts"
          emptyMessage="You haven't posted to Signal yet."
          canManage={canManage}
          fetcher={() => fetchEmpirePostsByAuthor(session.user.id)}
          onClose={() => setMyPostsOpen(false)}
        />
      )}

      {savedOpen && (
        <SignalPostListOverlay
          title="Saved"
          emptyMessage="Posts you save will show up here."
          canManage={canManage}
          fetcher={() => fetchEmpireSavedPosts()}
          onClose={() => setSavedOpen(false)}
        />
      )}

      <SignalQuickControl
        items={[
          { label: 'Official', icon: 'shield', active: space === 'official', onSelect: () => navigate('/signal') },
          { label: 'Community', icon: 'users', active: space === 'community', groupEnd: true, onSelect: () => navigate('/signal/community') },
          // A Host/Verified Client gets one-tap Create Post/Add Story from
          // anywhere in Signal — both jump to Community first (Community
          // is the only space they can publish into) then open the same
          // composer the feed's own inline trigger uses, never a second
          // creation flow. Owner/Admin keep their existing Official
          // composer entry point inline in the feed, unchanged — this menu
          // isn't where they publish today, so it isn't where this adds
          // shortcuts either. A plain Client (can't publish anywhere) gets
          // neither row, and no "My Posts" (nothing to list).
          ...(canPublishSelf
            ? [
                {
                  label: 'Create Post', icon: 'plus' as const,
                  onSelect: () => { if (space !== 'community') navigate('/signal/community'); setComposerOpen(true); },
                },
                {
                  label: 'Add Story', icon: 'camera' as const, groupEnd: true,
                  onSelect: () => { if (space !== 'community') navigate('/signal/community'); setStoryComposerOpen(true); },
                },
              ]
            : []),
          ...(canManage || canPublishSelf
            ? [{ label: 'My Posts', icon: 'image' as const, onSelect: () => setMyPostsOpen(true) }]
            : []),
          { label: 'My Profile', icon: 'user', onSelect: () => navigate(`/signal/profile/${session.user.id}`) },
          { label: 'Saved', icon: 'bookmark', onSelect: () => setSavedOpen(true) },
        ]}
      />

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
