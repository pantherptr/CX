import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { SignalLogo } from '../SignalLogo';
import { VerifiedBadge } from '../primitives';
import { compact } from '../../lib/format';
import { fetchSignalProfile, type SignalProfile } from '../../lib/data/signalProfile';
import { fetchHostCars } from '../../lib/data/cars';
import { fetchEmpirePostsByAuthor, type EmpirePost } from '../../lib/data/empireFeed';
import { useActiveEmpireStories, deleteEmpireStory } from '../../lib/data/empireStories';
import type { Car } from '../../data/types';
import { SignalPostCard } from './SignalPostCard';
import { SignalStoryViewer } from './SignalStoryViewer';
import { SignalEditProfileSheet } from './SignalEditProfileSheet';
import { SignalFollowListSheet } from './SignalFollowListSheet';
import { FollowButton } from './FollowButton';
import { ProfileAvatar } from './SignalIdentityBadge';
import { Tap, SharedAvatar } from '../motionKit';
import { useAuth } from '../../lib/auth';

const ROLE_LABEL: Record<'owner' | 'admin' | 'host' | 'client', string> = {
  owner: 'Owner', admin: 'Admin', host: 'Host', client: 'Verified Client',
};

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
  const isOfficialVoice = authorId === 'cx' || authorId === 'assistant';
  const [profile, setProfile] = useState<SignalProfile | null | 'error'>(null);
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
    setCars(null);
    setPosts(null);
    fetchSignalProfile(authorId)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setLoaded(true);
        if (p) {
          fetchEmpirePostsByAuthor(authorId, 6).then((rows) => !cancelled && setPosts(rows)).catch(() => !cancelled && setPosts([]));
          if (p.isHost) fetchHostCars(authorId).then((rows) => !cancelled && setCars(rows)).catch(() => !cancelled && setCars([]));
        }
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

  return (
    <div ref={scrollRef} className="fixed inset-0 z-[250] overflow-y-auto bg-bg animate-scale-in">
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
        ) : profile === null ? (
          <div className="py-24 text-center">
            <SignalLogo size={48} className="mx-auto opacity-50" />
            <p className="mt-4 text-body text-muted">This profile no longer exists.</p>
          </div>
        ) : (
          <ProfileHeader
            profile={profile}
            isMe={isMe}
            hasActiveStory={Boolean(myStory)}
            compress={compress}
            editProfileOpen={editProfileOpen}
            onOpenStory={() => setStoryViewerOpen(true)}
            onEditProfile={() => setEditProfileOpen(true)}
            onOpenFollowers={() => setFollowListMode('followers')}
            onOpenFollowing={() => setFollowListMode('following')}
          />
        )}

        {!isOfficialVoice && profile && profile !== 'error' && cars && cars.length > 0 && (
          <div className="border-t border-line py-4">
            <p className="mb-2.5 px-0.5 text-caption font-semibold uppercase tracking-[0.12em] text-faint">Vehicles</p>
            <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
              {cars.map((car) => (
                <Link
                  key={car.id}
                  to={`/cars/${car.slug}`}
                  className="pressable flex w-[168px] shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-line-strong"
                >
                  <span className="block h-24 w-full bg-panel">
                    {car.images[0] && (
                      <Img
                        src={car.images[0]}
                        alt=""
                        className="h-full w-full object-cover"
                        fallback={<span className="grid h-full w-full place-items-center text-muted"><Icon name="car" size={20} /></span>}
                      />
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5 p-2.5">
                    <span className="truncate text-detail font-semibold text-ink">{car.make} {car.model}</span>
                    <span className="flex items-center justify-between text-caption text-muted">
                      €{compact(car.pricePerDay)}/day
                      <Icon name="arrowUpRight" size={12} className="text-accent-700" />
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-line pt-4">
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

          {!isOfficialVoice && restPosts && restPosts.length === 0 && !pinnedPost && (
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

          {!isOfficialVoice && restPosts?.map((post) => (
            <SignalPostCard
              key={post.id}
              post={post}
              canManage={canManage}
              onChanged={(updated) => setPosts((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)))}
              onDeleted={(id) => setPosts((prev) => (prev ?? []).filter((p) => p.id !== id))}
            />
          ))}
        </div>
      </div>

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
  const avatar = isCx ? (
    <span className="grid h-20 w-20 place-items-center rounded-full bg-white ring-1 ring-line">
      <Img
        src="/cx-logo-symbol.png"
        alt=""
        className="h-12 w-12 object-contain"
        fallback={<span className="text-lg font-semibold text-ink">CX</span>}
      />
    </span>
  ) : (
    <span className="grid h-20 w-20 place-items-center rounded-full bg-noir text-accent-bright">
      <Icon name="headset" size={32} />
    </span>
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

function ProfileHeader({
  profile,
  isMe,
  hasActiveStory,
  compress,
  editProfileOpen,
  onOpenStory,
  onEditProfile,
  onOpenFollowers,
  onOpenFollowing,
}: {
  profile: SignalProfile;
  isMe: boolean;
  hasActiveStory: boolean;
  compress: number;
  /** Whether the Edit Profile sheet is currently open — hands the shared
   *  avatar id over to the sheet's own copy (see `SharedAvatar`'s own
   *  contract) so opening it reads as "this exact photo moved down into
   *  the sheet," not a fresh fade-in of a second one. */
  editProfileOpen: boolean;
  onOpenStory: () => void;
  onEditProfile: () => void;
  onOpenFollowers: () => void;
  onOpenFollowing: () => void;
}) {
  const role: 'owner' | 'admin' | 'host' | 'client' | null =
    profile.isOwner ? 'owner' : profile.isAdmin ? 'admin' : profile.isHost ? 'host' : profile.isVerifiedClient ? 'client' : null;
  // Follow only makes sense for the two Community creator roles — see
  // the brief's own "Users can follow: Hosts, Verified Clients."
  // Following Owner/Admin's real account isn't a Community concept.
  const canBeFollowed = !isMe && (profile.isHost || profile.isVerifiedClient);
  const showFollowCounts = profile.isHost || profile.isVerifiedClient;
  const [followersCount, setFollowersCount] = useState(profile.followersCount);
  // A verified account (Host/Verified Client/Owner) gets a hairline
  // accent ring on its own photo — deliberately not the Story gradient,
  // which is reserved for "there's something new to watch," not a
  // permanent verification cue. Never both at once: the Story ring
  // below already implies verification just by who can publish one.
  const isVerifiedIdentity = Boolean(role);

  const avatar = (
    <SharedAvatar id="profile-avatar" active={isMe && !editProfileOpen}>
      <ProfileAvatar src={profile.avatarUrl} size={80} ring={isVerifiedIdentity} />
    </SharedAvatar>
  );

  return (
    <div className="flex flex-col items-center gap-2.5 pb-6 pt-7 text-center" style={{ transform: `scale(${1 - compress * 0.12})`, transformOrigin: 'top center' }}>
      {/* Same ring-around-the-avatar treatment SignalStoriesBar already
          uses — a solid accent ring for your own active Story, the
          gradient "unviewed" ring for someone else's, reused as-is
          rather than a new visual invented for this one spot. */}
      {hasActiveStory ? (
        <button
          onClick={onOpenStory}
          aria-label="View Story"
          className={`pressable inline-grid place-items-center rounded-full p-[3px] ${
            isMe ? 'bg-accent-700' : 'bg-gradient-to-tr from-accent-bright via-accent to-accent-700'
          }`}
        >
          <span className="inline-grid place-items-center rounded-full border-2 border-surface">{avatar}</span>
        </button>
      ) : (
        avatar
      )}

      <div>
        <div className="flex items-center justify-center gap-1.5">
          <span className="font-display text-feature font-semibold text-ink">{profile.fullName}</span>
          {role && <VerifiedBadge role={role} size={15} />}
        </div>
        {profile.username && <p className="mt-0.5 text-caption text-faint">@{profile.username}</p>}
        {role && <p className="mt-0.5 text-caption text-muted">{ROLE_LABEL[role]}</p>}
      </div>

      {profile.bio && (
        <p style={{ opacity: 1 - compress }} className="max-w-xs whitespace-pre-wrap break-words text-detail leading-relaxed text-ink-soft">
          {profile.bio}
        </p>
      )}

      {profile.isHost && (
        <p className="-mt-1 text-caption text-faint">{compact(profile.rating)} ★ · {compact(profile.trips)} trips</p>
      )}

      {showFollowCounts && (
        <div className="flex items-center gap-5 text-detail">
          <button onClick={onOpenFollowers} className="pressable flex items-baseline gap-1 text-ink-soft transition-colors hover:text-ink">
            <span className="font-semibold text-ink">{compact(followersCount)}</span> Followers
          </button>
          <button onClick={onOpenFollowing} className="pressable flex items-baseline gap-1 text-ink-soft transition-colors hover:text-ink">
            <span className="font-semibold text-ink">{compact(profile.followingCount)}</span> Following
          </button>
        </div>
      )}

      {isMe ? (
        <Tap onClick={onEditProfile} scale={0.96} className="rounded-full border border-line px-5 py-1.5 text-detail font-semibold text-ink transition-colors hover:border-line-strong">
          Edit Profile
        </Tap>
      ) : (
        canBeFollowed && (
          <FollowButton
            userId={profile.id}
            initialFollowing={profile.followedByMe}
            onChange={(following) => setFollowersCount((c) => c + (following ? 1 : -1))}
          />
        )
      )}
    </div>
  );
}
