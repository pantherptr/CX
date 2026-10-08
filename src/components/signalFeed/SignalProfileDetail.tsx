import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { SignalLogo } from '../SignalLogo';
import { VerifiedBadge } from '../primitives';
import { compact } from '../../lib/format';
import { fetchSignalProfile, type SignalProfile } from '../../lib/data/signalProfile';
import { fetchHostCars } from '../../lib/data/cars';
import { findOrCreateConversation } from '../../lib/data/messages';
import { fetchEmpirePostsByAuthor, fetchEmpireSavedPosts, type EmpirePost } from '../../lib/data/empireFeed';
import { fetchSignalDemoProfile, fetchSignalDemoPostsByAuthor, type SignalDemoProfile } from '../../lib/data/signalDemo';
import { useActiveEmpireStories, deleteEmpireStory } from '../../lib/data/empireStories';
import type { Car } from '../../data/types';
import { SignalPostCard } from './SignalPostCard';
import { SignalPostSkeleton } from './SignalPostSkeleton';
import { SignalStoryViewer } from './SignalStoryViewer';
import { SignalEditProfileSheet } from './SignalEditProfileSheet';
import { SignalFollowListSheet } from './SignalFollowListSheet';
import { FollowButton } from './FollowButton';
import { SignalProfileHero } from './SignalProfileHero';
import { Tap, motion } from '../motionKit';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../lib/store';

// How far (px) into the scroll the header compresses — a subtle,
// transform/opacity-only effect (never a sticky mini-header; the whole
// header just eases smaller as it scrolls past, per the brief's own
// "do not create a giant sticky header").
const HEADER_COMPRESS_RANGE = 90;

/** The `/signal/profile/:authorId` deep-link target — same overlay-on-
 *  top-of-the-live-feed pattern as `SignalPostDetail` (fixed inset-0,
 *  sticky back header, cancelled-flag fetch effect, loading/error/not-
 *  found tri-state), reached by tapping any post's identity block.
 *
 *  There is deliberately no second "SIGNAL profile" — this fetches the
 *  SAME `profiles` row every other CX Rent surface uses (via
 *  `fetch_signal_profile`'s safe public projection) and the same real
 *  `cars` a Host already lists (via `fetchHostCars`, unchanged, no new
 *  car projection). Change your name/photo/bio in Settings and this
 *  reflects it immediately — there's nothing here to "re-sync."
 *
 *  `authorId` is either a real profile id, or one of the two synthetic
 *  values for SIGNAL's official-but-not-a-real-account voices
 *  ('cx' / 'assistant') — those render a small static identity block
 *  instead of fetching a profile that doesn't exist. */
export function SignalProfileDetail({
  authorId,
  canManage,
  onClose,
}: {
  authorId: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const { toast } = useApp();
  const isOfficialVoice = authorId === 'cx' || authorId === 'assistant';
  const [profile, setProfile] = useState<SignalProfile | null | 'error'>(null);
  const [demoProfile, setDemoProfile] = useState<SignalDemoProfile | null>(null);
  const [loaded, setLoaded] = useState(isOfficialVoice);
  const [cars, setCars] = useState<Car[] | null>(null);
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [followListMode, setFollowListMode] = useState<'followers' | 'following' | null>(null);
  const isMe = !isOfficialVoice && session?.user.id === authorId;

  // Reuses the exact same active-Stories fetch SignalStoriesBar already
  // does, just filtered down to this one identity — no separate
  // "this author's story" query. `publisherType` matches the same
  // 'cx'/'assistant'/real-author-id distinction resolveSignalIdentity
  // uses everywhere else.
  const { stories: activeStories, refresh: refreshStories } = useActiveEmpireStories();
  const myStory = useMemo(() => {
    if (!activeStories) return null;
    if (authorId === 'cx') return activeStories.find((s) => s.publisherType === 'cx') ?? null;
    if (authorId === 'assistant') return activeStories.find((s) => s.publisherType === 'assistant') ?? null;
    return activeStories.find((s) => s.authorId === authorId && s.publisherType !== 'cx' && s.publisherType !== 'assistant') ?? null;
  }, [activeStories, authorId]);

  // Subtle scroll-linked header compression — transform/opacity only,
  // scoped to this overlay's own scroll container (not window), so it
  // never touches the shared feed's own scroll-hide behavior underneath.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; setScrollTop(el.scrollTop); });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  const compress = Math.min(1, scrollTop / HEADER_COMPRESS_RANGE);

  useEffect(() => {
    if (isOfficialVoice) return;
    let cancelled = false;
    setLoaded(false);
    setProfile(null);
    setDemoProfile(null);
    setCars(null);
    setPosts(null);
    // A demo profile has no real `profiles` row at all (see
    // signalDemo.ts's own header comment) — tried second, only once the
    // real lookup genuinely comes back empty, same fallback order as
    // SignalPostDetail's post lookup.
    fetchSignalProfile(authorId)
      .then((p) => {
        if (cancelled) return;
        if (p) {
          setProfile(p);
          setLoaded(true);
          fetchEmpirePostsByAuthor(authorId, 6).then((rows) => !cancelled && setPosts(rows)).catch(() => !cancelled && setPosts([]));
          if (p.isHost) fetchHostCars(authorId).then((rows) => !cancelled && setCars(rows)).catch(() => !cancelled && setCars([]));
          return;
        }
        fetchSignalDemoProfile(authorId)
          .then((dp) => {
            if (cancelled) return;
            setProfile(null);
            setDemoProfile(dp);
            setLoaded(true);
            if (dp) {
              fetchSignalDemoPostsByAuthor(dp.id, 6).then((rows) => !cancelled && setPosts(rows)).catch(() => !cancelled && setPosts([]));
            }
          })
          .catch(() => {
            if (!cancelled) {
              setProfile('error');
              setLoaded(true);
            }
          });
      })
      .catch(() => {
        if (!cancelled) {
          setProfile('error');
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authorId, isOfficialVoice]);

  const pinnedPost = posts?.[0]?.pinnedToProfile ? posts[0] : null;
  const restPosts = pinnedPost ? posts!.slice(1) : posts;

  const realProfile = !isOfficialVoice && loaded && profile && profile !== 'error' ? profile : null;
  const demo = !isOfficialVoice && loaded && profile === null ? demoProfile : null;
  const heroMode = Boolean(realProfile || demo);
  const hasVehicles = Boolean(realProfile && cars && cars.length > 0);
  const [tab, setTab] = useState<'posts' | 'vehicles' | 'saved'>('posts');
  const tabs = (['posts', ...(hasVehicles ? ['vehicles'] : []), ...(isMe ? ['saved'] : [])]) as ('posts' | 'vehicles' | 'saved')[];
  const activeTab = tabs.includes(tab) ? tab : 'posts';
  const [savedPosts, setSavedPosts] = useState<EmpirePost[] | null>(null);
  useEffect(() => {
    if (activeTab !== 'saved' || savedPosts) return;
    let cancelled = false;
    fetchEmpireSavedPosts().then((rows) => { if (!cancelled) setSavedPosts(rows); }).catch(() => { if (!cancelled) setSavedPosts([]); });
    return () => { cancelled = true; };
  }, [activeTab, savedPosts]);

  const role: 'owner' | 'admin' | 'host' | 'client' | null = realProfile
    ? realProfile.isOwner ? 'owner' : realProfile.isAdmin ? 'admin' : realProfile.isHost ? 'host' : realProfile.isVerifiedClient ? 'client' : null
    : demo ? (demo.role === 'host' ? 'host' : 'client') : null;
  const [followersCount, setFollowersCount] = useState(0);
  useEffect(() => {
    if (realProfile) setFollowersCount(realProfile.followersCount);
  }, [realProfile?.id, realProfile?.followersCount]); // eslint-disable-line react-hooks/exhaustive-deps
  // Follow only makes sense for the two Community creator roles — see
  // the brief's own "Users can follow: Hosts, Verified Clients."
  const navigate = useNavigate();
  const [openingChat, setOpeningChat] = useState(false);
  // A chat in CX is always about a car, so Message exists for hosts who have one listed.
  const chatCar = realProfile?.isHost && !isMe ? (cars ?? [])[0] : undefined;
  const openChat = async () => {
    if (!session) { navigate('/login'); return; }
    if (!chatCar || !realProfile || openingChat) return;
    setOpeningChat(true);
    try {
      const id = await findOrCreateConversation(chatCar.id, session.user.id, realProfile.id);
      navigate(`/messages?c=${id}`);
    } catch {
      toast({ title: 'Could not open the chat', desc: 'Check your connection and try again.', icon: 'info' });
    } finally {
      setOpeningChat(false);
    }
  };
  const canBeFollowed = Boolean(realProfile && !isMe && (realProfile.isHost || realProfile.isVerifiedClient));
  const showFollowCounts = Boolean(realProfile && (realProfile.isHost || realProfile.isVerifiedClient));

  const share = async () => {
    const url = window.location.href;
    const title = realProfile?.fullName ?? demo?.fullName ?? 'CX Rent — Signal';
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* closed without sharing */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied to clipboard', icon: 'check' });
    } catch {
      toast({ title: 'Could not copy link', icon: 'info' });
    }
  };

  const [view, setView] = useState<'list' | 'grid'>('list');
  const allPosts = [...(pinnedPost ? [pinnedPost] : []), ...(restPosts ?? [])];
  const isVideoUrl = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);
  const gridView = (
    <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
      {allPosts.map((post) => {
        const img = post.mediaUrls.find((u) => !isVideoUrl(u));
        const vid = post.mediaUrls.find(isVideoUrl);
        return (
          <button
            key={post.id}
            type="button"
            onClick={() => navigate(`/signal/post/${post.id}`)}
            className="pressable group relative aspect-square overflow-hidden bg-panel"
          >
            {img ? (
              <Img src={img} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" fallback={<span className="grid h-full w-full place-items-center text-muted"><Icon name="image" size={20} /></span>} />
            ) : vid ? (
              <video src={vid} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center p-2.5 text-left text-caption font-medium leading-snug text-ink-soft line-clamp-5">{post.title || post.body}</span>
            )}
            {vid && !img && (
              <span className="pointer-events-none absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white"><Icon name="play" size={11} fill /></span>
            )}
            {post.mediaUrls.length > 1 && (
              <span className="pointer-events-none absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white"><Icon name="grid" size={11} /></span>
            )}
          </button>
        );
      })}
    </div>
  );

  const postsSection = (
    <div>
      {allPosts.length > 0 && (
        <div className="mb-3 flex justify-end">
          <div className="inline-flex gap-0.5 rounded-full bg-panel p-1" role="group" aria-label="View">
            {(['list', 'grid'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                aria-label={v === 'list' ? 'List' : 'Grid'}
                className={`grid h-8 w-10 place-items-center rounded-full transition-colors ${view === v ? 'bg-surface text-ink shadow-hair' : 'text-muted hover:text-ink'}`}
              >
                <Icon name={v === 'list' ? 'menu' : 'grid'} size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
      {view === 'grid' && allPosts.length > 0 ? gridView : (
        <>
      {pinnedPost && (
        <div className="mb-3">
          <p className="mb-2 flex items-center gap-1.5 px-0.5 text-caption font-medium text-faint">
            <Icon name="pinned" size={11} fill /> Pinned
          </p>
          <SignalPostCard
            post={pinnedPost}
            canManage={canManage}
            onChanged={(updated) => setPosts((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)))}
            onDeleted={(id) => setPosts((prev) => (prev ?? []).filter((p) => p.id !== id))}
          />
        </div>
      )}

      {restPosts && restPosts.length === 0 && !pinnedPost && (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="h-7 w-[3px] rounded-full bg-accent-bright/50" aria-hidden="true" />
          <p className="text-body text-muted">{isMe ? 'Share your first post.' : 'No posts yet.'}</p>
          {isMe && (
            <Link to="/signal/community" className="btn btn-primary btn-sm mt-1">
              Create Post
            </Link>
          )}
        </div>
      )}

      {restPosts?.map((post) => (
        <SignalPostCard
          key={post.id}
          post={post}
          canManage={canManage}
          onChanged={(updated) => setPosts((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)))}
          onDeleted={(id) => setPosts((prev) => (prev ?? []).filter((p) => p.id !== id))}
        />
      ))}
        </>
      )}
    </div>
  );

  const vehiclesSection = (
    <div className="grid grid-cols-2 gap-3">
      {(cars ?? []).map((car) => (
        <Link
          key={car.id}
          to={`/cars/${car.slug}`}
          className="group pressable flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-hair transition-colors hover:border-line-strong"
        >
          <span className="relative block aspect-[4/3] w-full overflow-hidden bg-panel">
            {car.images[0] && (
              <Img
                src={car.images[0]}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                fallback={<span className="grid h-full w-full place-items-center text-muted"><Icon name="car" size={22} /></span>}
              />
            )}
          </span>
          <span className="flex flex-col gap-0.5 p-3">
            <span className="truncate text-detail font-semibold text-ink">{car.make} {car.model}</span>
            <span className="flex items-center justify-between text-caption text-muted">
              €{compact(car.pricePerDay)}/day
              <Icon name="arrowUpRight" size={13} className="text-accent-700" />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );

  const savedSection = (
    <div>
      {savedPosts === null && (
        <>
          <SignalPostSkeleton />
          <SignalPostSkeleton />
        </>
      )}
      {savedPosts && savedPosts.length === 0 && <p className="py-14 text-center text-body text-muted">Nothing saved yet.</p>}
      {savedPosts?.map((post) => (
        <SignalPostCard
          key={post.id}
          post={post}
          canManage={canManage}
          onChanged={(updated) => setSavedPosts((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)))}
          onDeleted={(id) => setSavedPosts((prev) => (prev ?? []).filter((p) => p.id !== id))}
        />
      ))}
    </div>
  );

  const below = (
    <>
      {tabs.length > 1 && (
        <div className="mb-4 flex border-b border-line" role="tablist">
          {tabs.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setTab(id)}
              className={`relative flex-1 py-3 text-detail font-semibold transition-colors ${activeTab === id ? 'text-ink' : 'text-muted hover:text-ink'}`}
            >
              {id === 'posts' ? 'Posts' : id === 'vehicles' ? 'Vehicles' : 'Saved'}
              {activeTab === id && (
                <motion.span layoutId="profile-tab-underline" className="absolute inset-x-6 -bottom-px h-[3px] rounded-full bg-accent-bright" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />
              )}
            </button>
          ))}
        </div>
      )}
      {activeTab === 'posts' ? postsSection : activeTab === 'vehicles' ? vehiclesSection : savedSection}
    </>
  );

  return (
    <div ref={scrollRef} className="fixed inset-0 z-[250] overflow-y-auto bg-bg animate-scale-in">
      {heroMode ? (
        <div className="mx-auto w-full max-w-2xl pb-10">
          <SignalProfileHero
            name={realProfile?.fullName ?? demo!.fullName}
            role={role}
            username={realProfile?.username ?? demo?.username}
            bio={realProfile?.bio ?? demo?.bio}
            coverUrl={realProfile?.coverUrl ?? null}
            avatarUrl={realProfile?.avatarUrl ?? demo?.avatarUrl ?? null}
            hostStats={realProfile?.isHost ? { rating: realProfile.rating, trips: realProfile.trips } : null}
            followers={showFollowCounts && realProfile ? { count: followersCount, onOpen: () => setFollowListMode('followers') } : undefined}
            following={showFollowCounts && realProfile ? { count: realProfile.followingCount, onOpen: () => setFollowListMode('following') } : undefined}
            postsCount={posts ? posts.length : undefined}
            hasActiveStory={Boolean(myStory)}
            onOpenStory={() => setStoryViewerOpen(true)}
            onClose={onClose}
            onShare={share}
            scrollTop={scrollTop}
            action={
              realProfile && isMe ? (
                <Tap onClick={() => setEditProfileOpen(true)} scale={0.97} className="w-full rounded-2xl bg-ink py-3.5 text-body font-semibold text-white transition-colors hover:bg-ink/90">
                  Edit profile
                </Tap>
              ) : realProfile && canBeFollowed ? (
                <div className="flex items-stretch gap-2.5">
                  <div className="min-w-0 flex-1">
                    <FollowButton
                      userId={realProfile.id}
                      initialFollowing={realProfile.followedByMe}
                      variant="wide"
                      onChange={(following) => setFollowersCount((c) => c + (following ? 1 : -1))}
                    />
                  </div>
                  {chatCar && (
                    <Tap
                      onClick={() => void openChat()}
                      scale={0.96}
                      aria-label="Message"
                      className="inline-flex min-w-[7.5rem] items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-5 text-body font-semibold text-ink shadow-hair transition-colors hover:border-line-strong"
                    >
                      <Icon name="message" size={18} />
                      Message
                    </Tap>
                  )}
                </div>
              ) : undefined
            }
          >
            {below}
          </SignalProfileHero>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/92 px-4 py-3 backdrop-blur-md pt-safe">
            <button onClick={onClose} aria-label="Back to Signal" className="pressable grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
              <Icon name="chevronLeft" size={20} />
            </button>
            <span className="font-display font-semibold text-ink">Profile</span>
          </div>

          <div className="mx-auto w-full max-w-xl px-4 pb-10 sm:px-6">
            {isOfficialVoice ? (
              <OfficialVoiceHeader
                type={authorId as 'cx' | 'assistant'}
                hasActiveStory={Boolean(myStory)}
                onOpenStory={() => setStoryViewerOpen(true)}
                compress={compress}
              />
            ) : !loaded ? (
              <div className="flex flex-col items-center gap-3 pb-6 pt-8 text-center">
                <div className="skeleton h-20 w-20 rounded-full" />
                <div className="skeleton h-4 w-32 rounded-md" />
                <div className="skeleton h-3 w-48 rounded-md" />
              </div>
            ) : profile === 'error' ? (
              <div className="py-24 text-center">
                <SignalLogo size={48} className="mx-auto opacity-50" />
                <p className="mt-4 text-body text-muted">Couldn't load this profile. Check your connection and try again.</p>
              </div>
            ) : (
              <div className="py-24 text-center">
                <SignalLogo size={48} className="mx-auto opacity-50" />
                <p className="mt-4 text-body text-muted">This profile no longer exists.</p>
              </div>
            )}
          </div>
        </>
      )}

      {storyViewerOpen && myStory && (
        <SignalStoryViewer
          stories={[myStory]}
          startIndex={0}
          canManage={canManage || isMe}
          onClose={() => setStoryViewerOpen(false)}
          onStoryDeleted={() => { setStoryViewerOpen(false); refreshStories(); }}
          onDeleteStory={deleteEmpireStory}
        />
      )}

      {editProfileOpen && (
        <SignalEditProfileSheet
          initialCoverUrl={profile && profile !== 'error' ? profile.coverUrl : null}
          onClose={() => setEditProfileOpen(false)}
          onSaved={(updates) =>
            setProfile((prev) => (prev && prev !== 'error' ? { ...prev, ...updates } : prev))
          }
        />
      )}

      {followListMode && profile && profile !== 'error' && (
        <SignalFollowListSheet userId={profile.id} mode={followListMode} onClose={() => setFollowListMode(null)} />
      )}
    </div>
  );
}

function OfficialVoiceHeader({
  type,
  hasActiveStory,
  onOpenStory,
  compress,
}: {
  type: 'cx' | 'assistant';
  hasActiveStory: boolean;
  onOpenStory: () => void;
  compress: number;
}) {
  const isCx = type === 'cx';
  const avatar = (
    <Img
      src={isCx ? '/brand/avatar-cx.webp' : '/brand/avatar-assistant.webp'}
      alt=""
      className="h-24 w-24 rounded-full object-cover shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)] ring-1 ring-line"
      fallback={
        <span className="grid h-24 w-24 place-items-center rounded-full bg-noir text-accent-bright">
          <Icon name="headset" size={32} />
        </span>
      }
    />
  );
  return (
    <div className="flex flex-col items-center gap-2.5 pb-6 pt-7 text-center" style={{ transform: `scale(${1 - compress * 0.12})`, transformOrigin: 'top center' }}>
      {hasActiveStory ? (
        <button onClick={onOpenStory} aria-label="View Story" className="pressable inline-grid place-items-center rounded-full bg-gradient-to-tr from-accent-bright via-accent to-accent-700 p-[3px]">
          <span className="inline-grid place-items-center rounded-full border-2 border-surface">{avatar}</span>
        </button>
      ) : (
        avatar
      )}
      <div>
        <div className="flex items-center justify-center gap-1.5">
          <span className="font-display text-feature font-semibold text-ink">{isCx ? 'CX' : 'Assistant'}</span>
          {isCx ? (
            <span className="inline-grid h-4 w-4 place-items-center rounded-full bg-accent-bright text-noir">
              <Icon name="check" size={11} strokeWidth={3.2} />
            </span>
          ) : (
            <VerifiedBadge role="assistant" size={16} />
          )}
        </div>
        <p style={{ opacity: 1 - compress }} className="mt-2 max-w-xs text-detail text-muted">
          {isCx ? 'The official CX Rent brand account.' : 'CX Rent’s official AI assistant.'}
        </p>
      </div>
    </div>
  );
}
