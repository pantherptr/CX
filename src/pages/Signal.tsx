import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { useMediaQuery } from '../components/motion';
import { Tap, AnimatePresence } from '../components/motionKit';
import { SignalLogo, SignalSHero } from '../components/SignalLogo';
import { SignalFeedHeader } from '../components/signalFeed/SignalFeedHeader';
import { SignalStoriesBar } from '../components/signalFeed/SignalStoriesBar';
import { SignalHighlightsBar } from '../components/signalFeed/SignalHighlightsBar';
import { SignalPostComposer } from '../components/signalFeed/SignalPostComposer';
import { SignalCommunityComposer } from '../components/signalFeed/SignalCommunityComposer';
import { SignalPostCard } from '../components/signalFeed/SignalPostCard';
import { SignalPostSkeleton } from '../components/signalFeed/SignalPostSkeleton';
import { SignalSearchOverlay } from '../components/signalFeed/SignalSearchOverlay';
import { SignalAnalyticsSheet } from '../components/signalFeed/SignalAnalyticsSheet';
import { SignalPostDetail } from '../components/signalFeed/SignalPostDetail';
import { SignalProfileDetail } from '../components/signalFeed/SignalProfileDetail';
import { SignalPostListOverlay } from '../components/signalFeed/SignalPostListOverlay';
import { SignalNotificationsSheet } from '../components/signalFeed/SignalNotificationsSheet';
import { SignalQuickControl } from '../components/signalFeed/SignalQuickControl';
import { SignalStoryViewer } from '../components/signalFeed/SignalStoryViewer';
import { SignalPullToRefresh } from '../components/signalFeed/SignalPullToRefresh';
import { useAuth } from '../lib/auth';
import {
  useEmpireFeed, useEmpirePinnedPost, useEmpireFeaturedPosts, markEmpireFeedSeen,
  fetchEmpirePostsByAuthor, fetchEmpireSavedPosts, type EmpireCategory,
} from '../lib/data/empireFeed';
import { useEmpireHighlights, highlightAsStory, deleteEmpireHighlight } from '../lib/data/empireHighlights';
import { maybeSignalDemoGenerate } from '../lib/data/signalDemo';

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
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { pathname } = useLocation();
  const { postId, highlightId, authorId } = useParams<{ postId?: string; highlightId?: string; authorId?: string }>();
  const space: 'official' | 'community' = pathname.startsWith('/signal/community') ? 'community' : 'official';
  const base = space === 'community' ? '/signal/community' : '/signal';

  const canManage = Boolean(profile?.is_admin || profile?.is_owner);
  // Any signed-in user can publish in Community under their own real
  // identity ('self', never one of the three official voices — see
  // signalIdentity.ts) — a deliberate policy choice (Host/Verified
  // Client/plain Client all get the same right to post; the badge next
  // to their name is what actually distinguishes them, resolved live by
  // resolveSignalIdentity's own 'self' case). Server-side enforcement
  // lives in can_publish_signal_content() (0053_signal_open_community_
  // publishing.sql), not here — this only gates the UI. Distinct from
  // canManage, which is about moderating everyone's content, not being
  // allowed to post at all.
  const canPublishSelf = Boolean(session);
  const canPostHere = space === 'official' ? canManage : canPublishSelf;

  // Official has no category filter any more — the feed is always "all".
  const [category] = useState<EmpireCategory | null>(null);

  const officialFeed = useEmpireFeed(category, { scope: 'official' });
  const communityFeed = useEmpireFeed(null, { scope: 'community' });
  const { posts, loadMore, loadingMore, hasMore, refresh, patchPost, removePost, prependPost, newPostsAvailable, loadNewPosts } =
    space === 'official' ? officialFeed : communityFeed;

  // Warm the browser cache for the photos just below the fold, so scrolling
  // reveals finished images instead of skeletons. Capped, and only the
  // first image of each post.
  useEffect(() => {
    if (!posts) return;
    posts.slice(0, 10).forEach((p) => {
      const url = p.mediaUrls?.[0];
      if (url) {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
      }
    });
  }, [posts]);

  // "New posts" never yanks the feed out from under someone mid-scroll —
  // it only ever flips a quiet banner (see useEmpireFeed's own poll); this
  // is the one thing that actually merges them in, and only from a real
  // tap. Scrolling to the top afterward is what makes the newly-prepended
  // posts actually visible — without it they'd land above the viewport
  // with no visible change at all.
  const handleLoadNewPosts = async () => {
    await loadNewPosts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pinned = useEmpirePinnedPost();
  const featured = useEmpireFeaturedPosts();
  // One pull-to-refresh for both spaces — `refresh` above already
  // resolves to whichever feed (official/community) is current; Pinned/
  // Featured are Official-only and refreshed alongside it there. Not
  // awaited (both fire-and-forget internally) since the feed's own
  // refresh is the one the indicator actually waits on.
  const handleRefresh = async () => {
    if (space === 'official') {
      pinned.refresh();
      featured.refresh();
    }
    await refresh();
  };

  // Infinite scroll — a sentinel just past the last post triggers
  // loadMore itself once it's within 600px of the viewport, well before
  // the user actually reaches the bottom, so the next page is already
  // in by the time they'd notice a gap. Replaces the old manual "Load
  // more" tap entirely; `hasMore`/`loadingMore` still guard it exactly
  // as the button did. `loadMore`'s own identity changes on nearly every
  // render (it's memoized on `posts`) — reading it through a ref instead
  // of a direct dependency keeps the observer from tearing down and
  // reconnecting on every single post that loads.
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadMoreFnRef = useRef(loadMore);
  loadMoreFnRef.current = loadMore;
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) loadMoreFnRef.current();
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, space, category]);
  const { highlights } = useEmpireHighlights();
  const [composerOpen, setComposerOpen] = useState(false);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [myPostsOpen, setMyPostsOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

  useEffect(() => {
    if (session) markEmpireFeedSeen();
  }, [session]);

  // The demo content engine's lazy trigger — cheap, self-throttling, and
  // safe to fire on every Community visit (see signal_demo_maybe_generate's
  // own header comment). Scoped to Community specifically since that's
  // the only space demo content ever supplements.
  useEffect(() => {
    if (session && space === 'community') void maybeSignalDemoGenerate();
  }, [session, space]);

  const resyncAfterPin = () => {
    pinned.refresh();
    refresh();
  };
  const resyncAfterFeature = () => {
    featured.refresh();
    refresh();
  };

  // Closing a post/profile/Story overlay reveals the feed that was already
  // sitting, unanimated, underneath it (Signal.tsx never remounts on this
  // navigation — see App.tsx's `pageKey`) — today that's an instant cut,
  // the one real gap in this page's motion since every *entrance* already
  // has `animate-scale-in`. `viewTransition` asks the browser to crossfade
  // the outgoing detail view into that already-there feed for free (a
  // no-op, not a double-animation, on browsers without the API — React
  // Router falls back to a plain navigate). Deliberately not used on the
  // *opening* Links (Trending, notifications, avatars) — those already get
  // `animate-scale-in`'s entrance, and layering a second whole-page
  // crossfade under it would be exactly the "double animation" the motion
  // brief calls out to avoid.
  const closeOverlay = () => navigate(base, { viewTransition: true });

  if (!session) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-noir px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(60% 42% at 50% 36%, rgba(0,212,71,0.20), transparent 70%), radial-gradient(50% 30% at 50% 100%, rgba(0,212,71,0.08), transparent 70%)' }}
        />
        <Link
          to="/"
          aria-label="Close SIGNAL"
          className="pressable absolute right-8 top-8 hidden h-10 w-10 place-items-center rounded-full border border-white/15 text-on-noir transition-colors hover:bg-white/10 lg:grid"
        >
          <Icon name="x" size={18} />
        </Link>
        <div className="relative flex w-full max-w-sm flex-col items-center">
          <div className="animate-scale-in">
            <SignalSHero height={112} />
          </div>
          <p className="mt-9 text-detail font-bold uppercase tracking-[0.28em] text-accent-bright">CX SIGNAL</p>
          <h1 className="mt-3 font-display text-[2rem] font-semibold leading-[1.08] text-on-noir text-balance sm:text-4xl">The official voice of CX Rent.</h1>
          <p className="mt-3 max-w-xs text-copy leading-relaxed text-on-noir-muted">
            News, announcements and new cars, straight from the team.
          </p>
          <Link to="/login" state={{ from: { pathname: '/signal' } }} className="btn btn-accent-bright btn-lg mt-9 w-full">
            Sign In <Icon name="arrowRight" size={17} />
          </Link>
          <Link to="/" className="mt-2 inline-flex min-h-11 items-center text-detail font-medium text-on-noir-muted hover:text-on-noir">
            ← Back to CX Rent
          </Link>
        </div>
      </div>
    );
  }

  const navItems: { label: string; icon: IconName; active?: boolean; groupEnd?: boolean; onSelect: () => void }[] = [
          { label: 'Official', icon: 'shield', active: space === 'official', onSelect: () => navigate('/signal') },
          { label: 'Community', icon: 'users', active: space === 'community', groupEnd: true, onSelect: () => navigate('/signal/community') },
          // My Profile leads the personal-shortcuts section — the one row
          // every signed-in visitor has, regardless of publishing rights,
          // so it's the first thing under the Official/Community divider
          // rather than sitting below the publish-only rows.
          { label: 'My Profile', icon: 'user', onSelect: () => navigate(`/signal/profile/${session.user.id}`) },
          ...(canManage || canPublishSelf
            ? [{ label: 'My Posts', icon: 'image' as const, onSelect: () => setMyPostsOpen(true) }]
            : []),
          // A Host/Verified Client gets one-tap Create Post/Add Story from
          // anywhere in Signal — both jump to Community first (Community
          // is the only space they can publish into) then open the same
          // composer the feed's own inline trigger uses, never a second
          // creation flow. Owner/Admin keep their existing Official
          // composer entry point inline in the feed, unchanged — this menu
          // isn't where they publish today, so it isn't where this adds
          // shortcuts either. A plain Client (can't publish anywhere) gets
          // neither row.
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
          { label: 'Saved', icon: 'bookmark', onSelect: () => setSavedOpen(true) },
          ];

  const highlightIndex = highlightId && highlights ? highlights.findIndex((h) => h.id === highlightId) : -1;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <SignalFeedHeader
        signedIn
        onSearchClick={() => { setSearchQuery(''); setSearchOpen(true); }}
        searchOpen={searchOpen}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onSearchClose={() => setSearchOpen(false)}
        canManage={canManage}
        onAnalyticsClick={() => setAnalyticsOpen(true)}
        onNotificationsClick={() => setNotificationsOpen(true)}
      />

      <div className="mx-auto flex w-full max-w-[1180px] flex-1 items-start gap-8 lg:px-8 lg:py-6">
      {isDesktop && (
        <aside className="sticky top-20 w-56 shrink-0">
          <nav aria-label="SIGNAL" className="flex flex-col gap-0.5">
            {navItems.map((it) => (
              <div key={it.label}>
                <button
                  type="button"
                  onClick={it.onSelect}
                  aria-current={it.active ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-body transition-colors hover:bg-panel ${
                    it.active ? 'bg-panel font-semibold text-ink' : 'font-medium text-ink-soft'
                  }`}
                >
                  <Icon name={it.icon} size={18} />
                  {it.label}
                </button>
                {it.groupEnd && <div className="mx-3 my-2 border-t border-line" />}
              </div>
            ))}
          </nav>
        </aside>
      )}
      <main className="w-full min-w-0 max-w-xl flex-1 px-2.5 py-2.5 sm:px-4 sm:py-4 lg:max-w-2xl lg:flex-none lg:px-0 lg:py-0">
      <SignalPullToRefresh onRefresh={handleRefresh}>
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

        {/* Official keeps its own existing collapsed-trigger ↔ full-form
            swap — that composer (picker/categories/title) genuinely needs
            the room a persistent inline bar doesn't have. Community's own
            composer owns its collapsed/expanded states internally (see
            SignalCommunityComposer's own header comment), so it's just
            rendered directly — `composerOpen` still exists purely as the
            one external trigger (the Quick Control's "Create Post"
            shortcut), not as a presence toggle. */}
        {canPostHere && space === 'official' && (
          composerOpen ? (
            <SignalPostComposer
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
              Share news, an announcement, a new car…
            </button>
          )
        )}

        {canPostHere && space === 'community' && (
          <SignalCommunityComposer
            expanded={composerOpen}
            onExpand={() => setComposerOpen(true)}
            onCollapse={() => setComposerOpen(false)}
            onDone={(post) => { setComposerOpen(false); prependPost(post); }}
          />
        )}

        {/* Real new content, quietly detected in the background — never
            auto-prepended (that would move the feed underneath whatever
            the user is currently reading), just a tap-to-load pill that
            stays out of the way until they actually want it. Sticky so
            it's reachable from wherever they've scrolled to, not just the
            very top. */}
        {newPostsAvailable && posts && posts.length > 0 && (
          <div className="sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-30 flex animate-fade-up justify-center py-1.5">
            <Tap
              onClick={handleLoadNewPosts}
              className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-detail font-semibold text-white shadow-pop"
            >
              <Icon name="chevronUp" size={15} />
              New posts
            </Tap>
          </div>
        )}

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
              <div ref={loadMoreRef} className="flex justify-center py-4">
                {loadingMore && <SignalPostSkeleton />}
              </div>
            )}
          </>
        )}

        </div>
      </SignalPullToRefresh>
      </main>
      </div>

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
          withCollections
          fetcher={() => fetchEmpireSavedPosts()}
          onClose={() => setSavedOpen(false)}
        />
      )}

      {!isDesktop && <SignalQuickControl items={navItems} />}


      {highlightId && highlights && highlightIndex >= 0 && (
        <SignalStoryViewer
          stories={highlights.map(highlightAsStory)}
          startIndex={highlightIndex}
          canManage={canManage}
          onClose={closeOverlay}
          onStoryDeleted={closeOverlay}
          onMarkViewed={() => Promise.resolve(true)}
          onDeleteStory={deleteEmpireHighlight}
          deleteConfirmMessage="Delete this Highlight? This cannot be undone."
        />
      )}

      <AnimatePresence>{searchOpen && <SignalSearchOverlay query={searchQuery} />}</AnimatePresence>
      {analyticsOpen && <SignalAnalyticsSheet onClose={() => setAnalyticsOpen(false)} />}
      {notificationsOpen && <SignalNotificationsSheet base={base} onClose={() => setNotificationsOpen(false)} />}
    </div>
  );
}
