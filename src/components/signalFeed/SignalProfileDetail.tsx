import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { SignalLogo } from '../SignalLogo';
import { CarCard } from '../CarCard';
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
import { FollowButton } from './FollowButton';
import { useAuth } from '../../lib/auth';

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

  return (
    <div className="fixed inset-0 z-[250] overflow-y-auto bg-bg animate-scale-in">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/92 px-4 py-3 backdrop-blur-md pt-safe">
        <button onClick={onClose} aria-label="Back to Signal" className="pressable grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
          <Icon name="chevronLeft" size={20} />
        </button>
        <span className="font-display font-semibold text-ink">Profile</span>
      </div>

      <div className="mx-auto w-full max-w-xl px-3 py-4 sm:px-4 sm:py-6">
        {isOfficialVoice ? (
          <OfficialVoiceHeader
            type={authorId as 'cx' | 'assistant'}
            hasActiveStory={Boolean(myStory)}
            onOpenStory={() => setStoryViewerOpen(true)}
          />
        ) : !loaded ? (
          <div className="card animate-pulse p-5">
            <div className="skeleton mb-3 h-16 w-16 rounded-full" />
            <div className="skeleton mb-2 h-4 w-1/2 rounded-md" />
            <div className="skeleton h-3 w-3/4 rounded-md" />
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
            onOpenStory={() => setStoryViewerOpen(true)}
            onEditProfile={() => setEditProfileOpen(true)}
          />
        )}

        {!isOfficialVoice && profile && profile !== 'error' && cars && cars.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 text-detail font-semibold uppercase tracking-wide text-muted">Vehicles</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {cars.map((car) => (
                <CarCard key={car.id} car={car} />
              ))}
            </div>
          </div>
        )}

        {!isOfficialVoice && posts && posts.length > 0 && (
          <div className="mt-6">
            {/* fetch_empire_posts_by_author already orders pinned_to_
                profile first — at most one, so this is always either
                empty or a single post. Shown once, separately, so it
                never also repeats in the plain list below it. */}
            {posts[0]?.pinnedToProfile && (
              <div className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-muted">
                  <Icon name="pinned" size={12} fill /> Pinned
                </p>
                <SignalPostCard
                  post={posts[0]}
                  canManage={canManage}
                  onChanged={(updated) => setPosts((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)))}
                  onDeleted={(id) => setPosts((prev) => (prev ?? []).filter((p) => p.id !== id))}
                />
              </div>
            )}
            <h2 className="mb-3 text-detail font-semibold uppercase tracking-wide text-muted">Posts</h2>
            {posts.filter((p) => !p.pinnedToProfile).map((post) => (
              <SignalPostCard
                key={post.id}
                post={post}
                canManage={canManage}
                onChanged={(updated) => setPosts((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)))}
                onDeleted={(id) => setPosts((prev) => (prev ?? []).filter((p) => p.id !== id))}
              />
            ))}
          </div>
        )}
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
    </div>
  );
}

function OfficialVoiceHeader({
  type,
  hasActiveStory,
  onOpenStory,
}: {
  type: 'cx' | 'assistant';
  hasActiveStory: boolean;
  onOpenStory: () => void;
}) {
  const isCx = type === 'cx';
  const avatar = isCx ? (
    <span className="grid h-16 w-16 place-items-center rounded-full bg-white ring-1 ring-line">
      <img src="/cx-logo-symbol.png" alt="" className="h-10 w-10 object-contain" />
    </span>
  ) : (
    <span className="grid h-16 w-16 place-items-center rounded-full bg-noir text-accent-bright">
      <Icon name="headset" size={28} />
    </span>
  );
  return (
    <div className="card flex flex-col items-center gap-3 p-6 text-center">
      {/* Same ring-around-the-avatar treatment SignalStoriesBar already
          uses for an unviewed Story — reused, not reinvented, for the
          one case here (Owner-published-as-CX/Assistant Story). */}
      {hasActiveStory ? (
        <button onClick={onOpenStory} aria-label="View Story" className="pressable inline-grid place-items-center rounded-full bg-gradient-to-tr from-accent-bright via-accent to-accent-700 p-[3px]">
          <span className="inline-grid place-items-center rounded-full border-2 border-surface">{avatar}</span>
        </button>
      ) : (
        avatar
      )}
      <div>
        <div className="flex items-center justify-center gap-1.5">
          <span className="font-display text-lead font-semibold text-ink">{isCx ? 'CX' : 'Assistant'}</span>
          {isCx ? (
            <span className="inline-grid h-4 w-4 place-items-center rounded-full bg-accent-bright text-noir">
              <Icon name="check" size={11} strokeWidth={3.2} />
            </span>
          ) : (
            <VerifiedBadge role="assistant" size={16} />
          )}
        </div>
        <p className="mt-1 text-detail text-muted">
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
  onOpenStory,
  onEditProfile,
}: {
  profile: SignalProfile;
  isMe: boolean;
  hasActiveStory: boolean;
  onOpenStory: () => void;
  onEditProfile: () => void;
}) {
  const role: 'owner' | 'admin' | 'host' | 'client' | null =
    profile.isOwner ? 'owner' : profile.isAdmin ? 'admin' : profile.isHost ? 'host' : profile.isVerifiedClient ? 'client' : null;
  // Follow only makes sense for the two Community creator roles — see
  // the brief's own "Users can follow: Hosts, Verified Clients."
  // Following Owner/Admin's real account isn't a Community concept.
  const canBeFollowed = !isMe && (profile.isHost || profile.isVerifiedClient);
  const [followersCount, setFollowersCount] = useState(profile.followersCount);

  const avatar = profile.avatarUrl ? (
    <img src={profile.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-panel text-ink-soft">
      <Icon name="user" size={28} />
    </span>
  );

  return (
    <div className="card p-5">
      <div className="flex items-start gap-4">
        {/* Same ring-around-the-avatar treatment SignalStoriesBar already
            uses — a solid accent ring for your own active Story, the
            gradient "unviewed" ring for someone else's, reused as-is
            rather than a new visual invented for this one spot. */}
        {hasActiveStory ? (
          <button
            onClick={onOpenStory}
            aria-label="View Story"
            className={`pressable inline-grid shrink-0 place-items-center rounded-full p-[3px] ${
              isMe ? 'bg-accent-700' : 'bg-gradient-to-tr from-accent-bright via-accent to-accent-700'
            }`}
          >
            <span className="inline-grid place-items-center rounded-full border-2 border-surface">{avatar}</span>
          </button>
        ) : (
          avatar
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-display text-lead font-semibold text-ink">{profile.fullName}</span>
                {role && <VerifiedBadge role={role} size={16} />}
              </div>
              {profile.isHost && (
                <p className="text-caption text-muted">
                  {compact(profile.rating)} ★ · {compact(profile.trips)} trips
                </p>
              )}
            </div>
            {isMe ? (
              <button onClick={onEditProfile} className="pressable rounded-full border border-line px-3.5 py-1.5 text-caption font-semibold text-ink transition-colors hover:border-line-strong">
                Edit Profile
              </button>
            ) : canBeFollowed && (
              <FollowButton
                userId={profile.id}
                initialFollowing={profile.followedByMe}
                size="sm"
                onChange={(following) => setFollowersCount((c) => c + (following ? 1 : -1))}
              />
            )}
          </div>
          {(profile.isHost || profile.isVerifiedClient) && (
            <p className="mt-1.5 flex items-center gap-3 text-caption text-ink-soft">
              <span><span className="font-semibold text-ink">{compact(followersCount)}</span> Followers</span>
              <span><span className="font-semibold text-ink">{compact(profile.followingCount)}</span> Following</span>
            </p>
          )}
        </div>
      </div>
      {profile.bio && <p className="mt-3 whitespace-pre-wrap break-words text-body text-ink-soft">{profile.bio}</p>}
    </div>
  );
}
