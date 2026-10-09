import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { useApp } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { compact } from '../../lib/format';
import {
  toggleEmpirePostLike, toggleEmpirePostSave, addEmpirePostRespect, fetchMyRespectCount, clearMyRespects,
  addEmpirePostSave, fetchMySaveCount, clearMySaves, addEmpirePostView, fetchMyViewCount, clearMyExtraViews, deleteEmpirePost, setEmpirePostPinned,
  setEmpirePostFeatured, setEmpirePostProfilePin, setEmpirePostArchived, markEmpirePostViewed,
  incrementEmpirePostImpression, incrementEmpirePostShare, reportEmpireContent, mediaKindFromPath, type EmpirePost,
} from '../../lib/data/empireFeed';
import { resolveSignalIdentity } from '../../lib/data/signalIdentity';
import { toggleSignalDemoPostLike, toggleSignalDemoPostSave } from '../../lib/data/signalDemo';
import { RespectIcon } from '../RespectIcon';
import { SignalPollView } from './SignalPollView';
import { SignalCollectionsSheet } from './SignalCollectionsSheet';
import { tapAmount } from '../../lib/teamTapMode';
import { PostText } from './PostText';
import { fetchTripBadge, formatTripPeriod, type TripBadge } from '../../lib/data/tripMemories';
import { VerifiedTripBadge } from './SignalKeychainTab';
import { SignalVehicleCard } from './SignalVehicleCard';
import { BookmarkIcon, ShareIcon, EyeIcon } from '../ActionIcons';
import { SignalIdentityAvatar, SignalIdentityBadge } from './SignalIdentityBadge';
import { SignalMediaViewer } from './SignalMediaViewer';
import { PostActionMenu, type PostMenuItem } from './PostActionMenu';
import { SignalSpotlightCard } from './SignalSpotlightCard';
import type { SpotlightCardData } from '../../lib/data/spotlight';
import { SPOTLIGHT_POST_MARKER } from '../../lib/data/empireFeed';
import { SignalSharePostSheet } from './SignalSharePostSheet';
import { SignalCommentsSheet } from './SignalCommentsSheet';
import { SignalComments } from './SignalComments';
import { SignalPostComposer } from './SignalPostComposer';
import { BorderBeam } from '../BorderBeam';
import { SignalCommunityComposer } from './SignalCommunityComposer';
import { Img, vibrateTap } from '../motion';
import { Tap, SharedAvatar } from '../motionKit';
import { useManualTranslate } from '../../lib/i18n/ugc';
import { useLocale } from '../../lib/i18n';

/** Where tapping a post's identity block should go — the two official-
 *  but-not-a-real-profile-row voices get a synthetic route (SignalProfileDetail
 *  renders a static info block for them instead of fetching a profile),
 *  everyone else (Owner's real row, or a Host/Verified Client's 'self'
 *  post) opens their real account by id. */
function signalProfileHref(post: EmpirePost, base: string): string {
  if (post.publisherType === 'cx') return `${base}/profile/cx`;
  if (post.publisherType === 'assistant') return `${base}/profile/assistant`;
  return `${base}/profile/${post.authorId}`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// A single video/image in the feed (not the fixed-crop hero or multi-media
// grid) shows its OWN aspect ratio rather than a hardcoded 16:9 — but never
// narrower than 4:5, so a 9:16 vertical clip is cropped down to a normal
// portrait-post height instead of stretching to nearly the full viewport
// (the "video takes over the screen" complaint this whole pass fixes). A
// max-height is a second, independent safety net for wide desktop cards.
// The action row: plain icon + number, evenly spread, only the colour changes
// when an action is active — like the reference tweet card, just in CX green.
const BAR_ICON = 'inline-grid place-items-center';
const BAR_ACTION = 'group flex min-h-9 select-none items-center gap-1.5 text-faint transition-colors';

const MIN_MEDIA_ASPECT = 4 / 5;
const MEDIA_MAX_HEIGHT_CLASS = 'max-h-[420px] sm:max-h-[520px]';

/** Two taps inside this window read as a double-tap. Short enough that a
 *  single tap still opens the photo almost immediately. */
const DOUBLE_TAP_MS = 260;

/** Single tap vs double tap on the same target — the single action waits
 *  out the double-tap window before firing, so a double-tap never also
 *  opens the viewer underneath it. With no `onDouble`, single taps fire
 *  instantly (no delay is added anywhere double-tap isn't offered). */
function useTapGesture(onSingle?: () => void, onDouble?: () => void) {
  const lastTapRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  return () => {
    if (!onDouble) {
      onSingle?.();
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      window.clearTimeout(timerRef.current);
      lastTapRef.current = 0;
      onDouble();
      return;
    }
    lastTapRef.current = now;
    timerRef.current = window.setTimeout(() => {
      lastTapRef.current = 0;
      onSingle?.();
    }, DOUBLE_TAP_MS);
  };
}

function PostImage({
  src,
  className,
  onClick,
  onDoubleTap,
  dynamicAspect = false,
  full = false,
  sharedId,
  sharedActive = true,
}: {
  src: string;
  className: string;
  onClick?: () => void;
  /** Double-tap the photo to Respect the post — the feed's signature
   *  gesture. Plays the burst here, over the photo itself. */
  onDoubleTap?: () => void;
  /** True only for a single, standalone image post — reads the image's
   *  own natural size instead of using `className`'s fixed aspect
   *  utility. Multi-image grids and the Featured/Pinned hero keep their
   *  fixed crop, unchanged. */
  dynamicAspect?: boolean;
  /** The single-post page: the photo at its own full size, never cropped. */
  full?: boolean;
  /** Opts this exact box into the shared-element morph with
   *  SignalMediaViewer's fullscreen image (see the viewer's own matching
   *  comment) — omit entirely for media that shouldn't participate
   *  (videos, carousel tiles beyond the first). `sharedActive` mirrors
   *  SharedAvatar's own contract: false while the viewer showing this
   *  exact image is open, so the two instances never both claim the id. */
  sharedId?: string;
  sharedActive?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const handleTap = useTapGesture(
    onClick,
    onDoubleTap
      ? () => {
          setBurstKey((k) => k + 1);
          onDoubleTap();
        }
      : undefined,
  );
  const fallback = (
    <div className="grid h-full w-full place-items-center bg-panel text-ink-soft">
      <Icon name="image" size={28} />
    </div>
  );
  const content = (
    <>
      {!loaded && <div className="skeleton absolute inset-0" />}
      <Img
        src={src}
        alt=""
        loading="lazy"
        fallback={fallback}
        onLoad={(e) => {
          setLoaded(true);
          if (dynamicAspect) {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setAspect(full ? img.naturalWidth / img.naturalHeight : Math.max(img.naturalWidth / img.naturalHeight, MIN_MEDIA_ASPECT));
            }
          }
        }}
        // One combined transition list — two separate `transition-*`
        // utilities each set `transition-property`, so only one of them
        // ever applied and the load fade-in silently didn't animate.
        className={`h-full w-full object-cover transition-[opacity,transform] duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${onClick ? 'hover:scale-[1.03]' : ''}`}
      />
      {burstKey > 0 && (
        <span
          key={burstKey}
          aria-hidden="true"
          onAnimationEnd={() => setBurstKey(0)}
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <Icon name="like" size={88} fill className="text-white animate-respect-burst" />
        </span>
      )}
    </>
  );
  const dynamicClass = dynamicAspect ? `w-full ${full ? '' : MEDIA_MAX_HEIGHT_CLASS}` : className;
  const style = dynamicAspect ? { aspectRatio: aspect ? `${aspect}` : '4/5' } : undefined;
  const box = onClick ? (
    <button onClick={handleTap} style={style} aria-label="Open photo or video" className={`relative overflow-hidden bg-panel ${dynamicClass}`}>{content}</button>
  ) : (
    <div style={style} className={`relative overflow-hidden bg-panel ${dynamicClass}`}>{content}</div>
  );
  // The shared-element morph only ever wraps the tappable box (never the
  // plain, non-interactive `div` branch — there's nothing to open from a
  // media grid tile with no `onClick`), and only when the caller actually
  // opts this image in via `sharedId`.
  return sharedId && onClick ? (
    <SharedAvatar as="div" id={sharedId} active={sharedActive} className={dynamicAspect ? 'w-full' : undefined}>
      {box}
    </SharedAvatar>
  ) : box;
}

/** A post's inline video — autoplays muted only while genuinely visible
 *  (a real IntersectionObserver, not a "did it mount" guess), preserves
 *  its own aspect ratio instead of the fixed crop PostImage's siblings
 *  use, and never forces a full-resolution fetch just to sit in a feed:
 *  `preload="metadata"` only ever pulls enough to know its dimensions
 *  and show a first frame — the actual video data streams in once
 *  playback starts. A manual tap always wins over the observer (a
 *  `userPaused` ref, not state, since it must never itself trigger a
 *  re-render/re-observe). */
function PostVideo({
  src,
  className,
  onClick,
  fixedAspect = false,
  full = false,
}: {
  src: string;
  className: string;
  onClick?: () => void;
  /** The single-post page: the video at its own full size, never cropped. */
  full?: boolean;
  /** The Featured/Pinned hero treatment deliberately crops to a fixed
   *  16:10 box like its image counterpart does — only the regular feed
   *  grid preserves each video's own intrinsic composition. */
  fixedAspect?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [muted, setMuted] = useState(true);
  const [aspect, setAspect] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const userPausedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (userPausedRef.current) return;
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      video.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      video.pause();
    }
  };

  if (errored) {
    return (
      <div className={`grid place-items-center bg-panel text-muted ${className}`}>
        <div className="flex flex-col items-center gap-1.5 py-6">
          <Icon name="image" size={22} />
          <span className="text-caption">Video unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-panel ${fixedAspect ? className : `w-full ${full ? '' : MEDIA_MAX_HEIGHT_CLASS}`}`}
      style={!fixedAspect ? { aspectRatio: aspect ? `${aspect}` : '4/5', height: 'auto' } : undefined}
    >
      {!loaded && <div className="skeleton absolute inset-0" />}
      <video
        ref={videoRef}
        src={src}
        muted={muted}
        playsInline
        loop
        preload="metadata"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setLoaded(true);
          // Clamped to never go narrower than 4:5 — see MIN_MEDIA_ASPECT
          // above; a 9:16 clip is cropped to a contained portrait height
          // instead of stretching to nearly the full viewport.
          if (!fixedAspect && v.videoWidth && v.videoHeight) setAspect(full ? v.videoWidth / v.videoHeight : Math.max(v.videoWidth / v.videoHeight, MIN_MEDIA_ASPECT));
        }}
        onError={() => setErrored(true)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (!v.duration || !Number.isFinite(v.duration)) return;
          setProgress(v.currentTime / v.duration);
          setRemaining(Math.max(0, Math.ceil(v.duration - v.currentTime)));
        }}
        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
        className={`h-full w-full cursor-pointer object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
      {loaded && !playing && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <Icon name="play" size={22} fill />
          </span>
        </span>
      )}
      {remaining !== null && (
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </span>
      )}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
        <span className="block h-full bg-white transition-[width] duration-200 ease-linear" style={{ width: `${progress * 100}%` }} />
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
        aria-label={muted ? 'Unmute' : 'Mute'}
        className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
      >
        <Icon name={muted ? 'volumeOff' : 'volume'} size={15} />
      </button>
      {onClick && (
        <button
          onClick={onClick}
          aria-label="Open fullscreen"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
        >
          <Icon name="arrowUpRight" size={15} />
        </button>
      )}
    </div>
  );
}

/** A multi-image/video post — a native horizontal scroll-snap carousel
 *  (one real swipe per finger movement, no custom gesture code) instead
 *  of the old static 2-column grid, with small pagination dots so it
 *  reads as one swipeable gallery the way a single-image post already
 *  reads as one photo. `active` is derived from the scroller's own
 *  scroll position (rAF-throttled), not tracked separately, so it can
 *  never drift out of sync with what's actually on screen. */
function MediaCarousel({
  urls,
  onOpenViewer,
  onDoubleTap,
}: {
  urls: string[];
  onOpenViewer: (index: number) => void;
  onDoubleTap?: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const rafRef = useRef(0);

  const handleScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollerRef.current;
      if (!el || el.clientWidth === 0) return;
      setActive(Math.round(el.scrollLeft / el.clientWidth));
    });
  };

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
      >
        {urls.map((url, i) => (
          <div key={url} className="w-full shrink-0 snap-center">
            {mediaKindFromPath(url) === 'video' ? (
              <PostVideo src={url} onClick={() => onOpenViewer(i)} className="aspect-square" fixedAspect />
            ) : (
              <PostImage src={url} onClick={() => onOpenViewer(i)} onDoubleTap={onDoubleTap} className="aspect-square" />
            )}
          </div>
        ))}
      </div>
      {/* A dark drop-shadow (not a backing pill) keeps the dots legible
          against light AND dark media alike without adding a visible
          chrome element over the image itself. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
        {urls.map((_, i) => (
          <span
            key={i}
            className="h-1.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-all duration-200"
            style={{ width: i === active ? 14 : 6, opacity: i === active ? 1 : 0.6 }}
          />
        ))}
      </div>
    </div>
  );
}

/** One post in the feed. Author badge, category chip, body, media grid,
 *  a clean Respect/Save/Share action row with NO public numbers at all
 *  ("Respect" is SIGNAL's own branded label for what's still, underneath,
 *  the same real like — see handleRespect), and
 *  — only when the viewer is Owner/Admin — an overflow menu for
 *  edit/delete/pin plus a quiet "Performance" line with the real
 *  Views/Likes/Saves/Shares counts. Comments were removed from Signal
 *  entirely (no button, no panel, no per-post toggle). Every count is
 *  still tracked for real server-side (empire_post_views/likes/saves,
 *  plus the non-deduped impressions/shares columns) — this component
 *  just stops rendering any of them to a regular signed-in user, per the
 *  "no noisy statistics" redesign; Owner/Admin still sees the real
 *  numbers, never a fabricated one. The admin controls are a client-side
 *  convenience only; every action they trigger is re-checked server-side
 *  by the RPC it calls.
 *  `featured` swaps in the Featured Announcement treatment (bigger
 *  media, more concise text) — used for the one pinned post, rendered
 *  through this same component rather than a forked duplicate so there
 *  is exactly one place owning the like/save/comment/admin-menu logic.
 *  `onPinToggled`/`onFeaturedToggled` let the page resync every list a
 *  post could live in after a pin/feature change, since a post's home
 *  (regular feed vs Pinned vs Featured) changes the moment either flag
 *  does — same reasoning for both, since the feed excludes both rows. */
export function SignalPostCard({
  post,
  canManage,
  featured = false,
  detail = false,
  onChanged,
  onDeleted,
  onPinToggled,
  onFeaturedToggled,
  spotlight,
  spotlightAll,
}: {
  post: EmpirePost;
  canManage: boolean;
  featured?: boolean;
  /** The single-post page: full text, full-size media, exact date and time; the card itself no longer opens anything. */
  detail?: boolean;
  onChanged: (post: EmpirePost) => void;
  onDeleted: (postId: string) => void;
  onPinToggled?: () => void;
  onFeaturedToggled?: () => void;
  /** This is a Signal Spotlight's team post: draw the Vision card where the media goes
   *  (the post itself is only a marker); Respect, comments, saves and sharing are the post's own. */
  spotlight?: SpotlightCardData;
  spotlightAll?: SpotlightCardData[];
}) {
  // The team post behind a Spotlight carries only a marker — never show it as text.
  const isSpotlightPost = post.body === SPOTLIGHT_POST_MARKER;
  const { toast } = useApp();
  const { session, profile: viewerProfile } = useAuth();
  // Comment CREATION is Owner-only (see 0057_signal_owner_only_comments.sql)
  // — the "Comment" action itself is only shown to the Owner; everyone
  // else still reads existing comments via the lightweight count link
  // below the row, never a write-oriented button that would just get
  // rejected server-side anyway.
  const isOwnerViewer = Boolean(viewerProfile?.is_owner);
  const { pathname } = useLocation();
  const profileBase = pathname.startsWith('/signal/community') ? '/signal/community' : '/signal';
  const navigate = useNavigate();
  const [tripBadge, setTripBadge] = useState<TripBadge | null>(null);
  useEffect(() => {
    if (post.isDemo || !post.vehicle) return;
    let cancelled = false;
    fetchTripBadge(post.id).then((b) => { if (!cancelled) setTripBadge(b); });
    return () => { cancelled = true; };
  }, [post.id, post.isDemo, post.vehicle]);
  const [textExpanded, setTextExpanded] = useState(false);
  const [textClamped, setTextClamped] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [commentsSheetOpen, setCommentsSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { t, lang } = useLocale();
  const tr = useManualTranslate([post.title, post.body]);

  // Long text is cut in the feed ("Show more"); the single-post page shows it all.
  const clampText = !detail && !featured;
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !clampText || textExpanded) return;
    setTextClamped(el.scrollHeight > el.clientHeight + 2);
  }, [tr.texts[1], clampText, textExpanded]);

  // Like X: a tap on the card opens the post. If the text is cut off, the
  // first tap shows all of it and the next one opens the post.
  const handleCardClick = (e: React.MouseEvent) => {
    if (detail || featured) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, textarea, select, label, video, [role="button"], [data-no-open]')) return;
    if (window.getSelection()?.toString()) return;
    if (textClamped && !textExpanded) {
      setTextExpanded(true);
      return;
    }
    navigate(`${profileBase}/post/${post.id}`);
  };
  const postedAt = new Date(post.createdAt).toLocaleString(lang === 'en' ? 'en-GB' : lang, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long', year: 'numeric' });

  const isExclusive = post.category === 'exclusive';
  const identity = resolveSignalIdentity(post.publisherType, post.authorName, post.authorAvatarUrl, post.authorIsHost, post.authorIsVerifiedClient, post.authorIsOwner, post.authorIsAdmin, post.authorUsername);
  // Real ownership (not just admin moderation) — a Host/Verified Client
  // can edit/delete their own post even without canManage's broader
  // pin/feature/Performance-line privileges. Admin keeps everything.
  const isOwnPost = Boolean(session?.user.id) && post.authorId === session?.user.id;
  const canModerate = canManage || isOwnPost;

  // Fire-and-forget — markEmpirePostViewed is dedup'd server-side
  // (empire_post_views is keyed on post_id + user_id), so a re-render or
  // refresh never inflates the "Views" count. incrementEmpirePostImpression
  // is deliberately NOT deduped — impressions count every real render,
  // same distinction a real platform's Insights view draws between
  // unique reach and total impressions.
  // View/impression tracking has no demo equivalent (empire_post_views
  // has a hard FK to empire_posts — a demo post's id would fail it, not
  // silently no-op) — matches viewCount always reading 0 for a demo
  // post rather than pretending to track something that isn't real.
  useEffect(() => {
    if (post.isDemo) return;
    markEmpirePostViewed(post.id);
    incrementEmpirePostImpression(post.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, post.isDemo]);

  // Internally still "like" — toggle_empire_post_like/empire_post_likes/
  // likedByMe/likeCount are unchanged on purpose (the real engagement
  // architecture this sits on, preserved exactly as the brief asks); only
  // the visible label/icon-treatment below present it as "Respect". A
  // demo post routes to its own real (not fabricated) engagement tables
  // instead — see signalDemo.ts's own header comment for why those are
  // separate from empire_post_likes/saves rather than reusing them.
  const handleRespect = async () => {
    onChanged({ ...post, likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) });
    if (!post.likedByMe) {
      fireStamp();
      vibrateTap();
    }
    const { error } = post.isDemo ? await toggleSignalDemoPostLike(post.id) : await toggleEmpirePostLike(post.id);
    if (error) onChanged(post);
  };

  // Owner and Admin can Respect a post as many times as they like (0074):
  // every tap is +1 and the button shows how many they've given. Holding the
  // button takes them all back. Everyone else keeps the one-tap toggle above.
  const isTeamViewer = Boolean(viewerProfile?.is_owner || viewerProfile?.is_admin) && !post.isDemo;
  const [myRespects, setMyRespects] = useState(0);
  const respected = isTeamViewer ? myRespects > 0 : post.likedByMe;
  // The "RESPECTED" rubber stamp: it slams down when a Respect is given and then
  // stays above the thumb for as long as the Respect stands.
  const [stampKey, setStampKey] = useState(0);
  const [respectPlay, setRespectPlay] = useState(0);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [savePlay, setSavePlay] = useState(0);
  const [viewsInfo, setViewsInfo] = useState(false);
  useEffect(() => {
    if (!viewsInfo) return;
    const id = window.setTimeout(() => setViewsInfo(false), 4000);
    return () => window.clearTimeout(id);
  }, [viewsInfo]);
  // Tap = save quietly; hold Save to file the post in a collection.
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [sharePlay, setSharePlay] = useState(0);
  const [viewPlay, setViewPlay] = useState(0);
  const fireStamp = () => {
    setStampKey((k) => k + 1);
    setRespectPlay(Date.now());
  };
  const holdTimerRef = useRef<number | undefined>(undefined);
  const heldRespectRef = useRef(false);
  useEffect(() => {
    if (!isTeamViewer) return;
    let cancelled = false;
    fetchMyRespectCount(post.id).then((n) => { if (!cancelled) setMyRespects(n); });
    return () => { cancelled = true; };
  }, [isTeamViewer, post.id]);
  useEffect(() => () => window.clearTimeout(holdTimerRef.current), []);

  const handleTeamRespect = async () => {
    const before = myRespects;
    const amt = tapAmount(before);
    setMyRespects(before + amt);
    onChanged({ ...post, likedByMe: true, likeCount: post.likeCount + amt });
    fireStamp();
    vibrateTap();
    const { count, error } = await addEmpirePostRespect(post.id, amt);
    if (error) {
      setMyRespects(before);
      onChanged(post);
      toast({ title: 'Could not add a Respect', desc: error, icon: 'info' });
      return;
    }
    setMyRespects(count);
  };

  const handleClearRespects = async () => {
    const before = myRespects;
    if (before === 0) return;
    setMyRespects(0);
    onChanged({ ...post, likedByMe: false, likeCount: Math.max(0, post.likeCount - before) });
    vibrateTap();
    const { error } = await clearMyRespects(post.id);
    if (error) {
      setMyRespects(before);
      onChanged(post);
      toast({ title: 'Could not remove your Respects', desc: error, icon: 'info' });
      return;
    }
    toast({ title: 'Your Respects were removed', icon: 'check' });
  };

  const respectPressStart = () => {
    heldRespectRef.current = false;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      heldRespectRef.current = true;
      void handleClearRespects();
    }, 650);
  };
  const respectPressEnd = () => window.clearTimeout(holdTimerRef.current);
  const respectClick = () => {
    if (heldRespectRef.current) {
      heldRespectRef.current = false;
      return;
    }
    void handleTeamRespect();
  };

  // Saves work the same way for the team (0075): tap = +1, hold = remove all.
  const [mySaves, setMySaves] = useState(0);
  const saveHoldRef = useRef<number | undefined>(undefined);
  const saveHeldRef = useRef(false);
  useEffect(() => {
    if (!isTeamViewer) return;
    let cancelled = false;
    fetchMySaveCount(post.id).then((n) => { if (!cancelled) setMySaves(n); });
    return () => { cancelled = true; };
  }, [isTeamViewer, post.id]);
  useEffect(() => () => window.clearTimeout(saveHoldRef.current), []);

  const handleTeamSave = async () => {
    const before = mySaves;
    const amt = tapAmount(before);
    setMySaves(before + amt);
    onChanged({ ...post, savedByMe: true, saveCount: post.saveCount + amt });
    setSavePlay(Date.now());
    
    vibrateTap();
    const { count, error } = await addEmpirePostSave(post.id, amt);
    if (error) {
      setMySaves(before);
      onChanged(post);
      toast({ title: 'Could not add a Save', desc: error, icon: 'info' });
      return;
    }
    setMySaves(count);
  };
  const handleClearSaves = async () => {
    const before = mySaves;
    if (before === 0) return;
    setMySaves(0);
    onChanged({ ...post, savedByMe: false, saveCount: Math.max(0, post.saveCount - before) });
    vibrateTap();
    const { error } = await clearMySaves(post.id);
    if (error) {
      setMySaves(before);
      onChanged(post);
      toast({ title: 'Could not remove your Saves', desc: error, icon: 'info' });
      return;
    }
    toast({ title: 'Your Saves were removed', icon: 'check' });
  };
  const savePressStart = () => {
    saveHeldRef.current = false;
    window.clearTimeout(saveHoldRef.current);
    saveHoldRef.current = window.setTimeout(() => {
      saveHeldRef.current = true;
      vibrateTap();
      if (post.isDemo) {
        toast({ title: 'Sample posts can’t be added to collections', icon: 'info' });
        return;
      }
      setCollectionsOpen(true);
      if (mySaves === 0 && !post.isDemo) void handleTeamSave();
    }, 450);
  };
  const savePressEnd = () => window.clearTimeout(saveHoldRef.current);
  const saveClick = () => {
    if (saveHeldRef.current) {
      saveHeldRef.current = false;
      return;
    }
    void handleTeamSave();
  };

  // ...and Views, from the Performance line only the team sees.
  const [myViews, setMyViews] = useState(0);
  const viewHoldRef = useRef<number | undefined>(undefined);
  const viewHeldRef = useRef(false);
  useEffect(() => {
    if (!isTeamViewer) return;
    let cancelled = false;
    fetchMyViewCount(post.id).then((n) => { if (!cancelled) setMyViews(n); });
    return () => { cancelled = true; };
  }, [isTeamViewer, post.id]);
  useEffect(() => () => window.clearTimeout(viewHoldRef.current), []);

  const handleTeamView = async () => {
    const before = myViews;
    const amt = tapAmount(before);
    setMyViews(before + amt);
    setViewPlay(Date.now());
    onChanged({ ...post, viewCount: post.viewCount + amt });
    vibrateTap();
    const { count, error } = await addEmpirePostView(post.id, amt);
    if (error) {
      setMyViews(before);
      onChanged(post);
      toast({ title: 'Could not add a View', desc: error, icon: 'info' });
      return;
    }
    setMyViews(count);
  };
  const handleClearViews = async () => {
    const extra = Math.max(0, myViews - 1);
    if (extra === 0) return;
    setMyViews(1);
    onChanged({ ...post, viewCount: Math.max(0, post.viewCount - extra) });
    vibrateTap();
    const { error } = await clearMyExtraViews(post.id);
    if (error) {
      setMyViews(myViews);
      onChanged(post);
      toast({ title: 'Could not remove your Views', desc: error, icon: 'info' });
      return;
    }
    toast({ title: 'Your extra Views were removed', icon: 'check' });
  };
  const viewPressStart = () => {
    viewHeldRef.current = false;
    window.clearTimeout(viewHoldRef.current);
    viewHoldRef.current = window.setTimeout(() => {
      viewHeldRef.current = true;
      void handleClearViews();
    }, 650);
  };
  const viewPressEnd = () => window.clearTimeout(viewHoldRef.current);
  const viewClick = () => {
    if (viewHeldRef.current) {
      viewHeldRef.current = false;
      return;
    }
    void handleTeamView();
  };

  // Double-tap only ever *gives* Respect, never takes it back — a second
  // double-tap on an already-respected photo just replays the burst, the
  // same one-way behavior people already expect from this gesture.
  // Signed-in only: there's no anonymous Respect to record.
  const handleDoubleTapRespect = session
    ? () => {
        if (isTeamViewer) {
          void handleTeamRespect();
          return;
        }
        if (post.likedByMe) {
          vibrateTap();
          return;
        }
        void handleRespect();
      }
    : undefined;

  // Press and hold Save → straight to "which collection?" (saving first if
  // it isn't saved yet); a plain tap still just toggles Save.
  const collectHoldRef = useRef<number | undefined>(undefined);
  const collectHeldRef = useRef(false);
  useEffect(() => () => window.clearTimeout(collectHoldRef.current), []);
  const collectPressStart = () => {
    collectHeldRef.current = false;
    window.clearTimeout(collectHoldRef.current);
    collectHoldRef.current = window.setTimeout(() => {
      collectHeldRef.current = true;
      vibrateTap();
      if (post.isDemo) {
        toast({ title: 'Sample posts can’t be added to collections', icon: 'info' });
        return;
      }
      setCollectionsOpen(true);
      if (!post.savedByMe) {
        onChanged({ ...post, savedByMe: true, saveCount: post.saveCount + 1 });
        setSavePlay(Date.now());
        void toggleEmpirePostSave(post.id).then(({ error }) => { if (error) onChanged(post); });
      }
    }, 450);
  };
  const collectPressEnd = () => window.clearTimeout(collectHoldRef.current);
  const saveTap = () => {
    if (collectHeldRef.current) {
      collectHeldRef.current = false;
      return;
    }
    void handleSave();
  };

  const handleSave = async () => {
    onChanged({ ...post, savedByMe: !post.savedByMe, saveCount: post.saveCount + (post.savedByMe ? -1 : 1) });
    if (!post.savedByMe) {
      setSavePlay(Date.now());
      vibrateTap();
    }
    const { error } = post.isDemo ? await toggleSignalDemoPostSave(post.id) : await toggleEmpirePostSave(post.id);
    if (error) onChanged(post);
  };

  const handleShare = async () => {
    setSharePlay((k) => k + 1);
    const url = `${window.location.origin}/signal/post/${post.id}`;
    const shareData = { title: post.title || 'CX Rent — Signal', text: post.body.slice(0, 140), url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        // Only a completed share is real activity — a cancelled system
        // sheet throws and falls into the catch below, uncounted. No
        // share counter exists for demo posts (shareCount always reads
        // 0 for one — never tracked, never faked).
        if (!post.isDemo) void incrementEmpirePostShare(post.id);
      } catch {
        // user cancelled — no error toast, no share event recorded
      }
    } else {
      // The Clipboard API can genuinely reject even in a browser that
      // exposes it — permission denied, an insecure/non-focused context,
      // a strict privacy setting — and this was previously unguarded: a
      // rejection here silently killed the whole share (no toast, no
      // recorded event, nothing the user could see happened at all).
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copied to clipboard', icon: 'check' });
        if (!post.isDemo) void incrementEmpirePostShare(post.id);
      } catch {
        toast({ title: 'Could not copy link', desc: url, icon: 'info' });
      }
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    setBusy(true);
    const { error } = await deleteEmpirePost(post.id);
    setBusy(false);
    if (error) toast({ title: 'Could not delete post', desc: error, icon: 'info' });
    else onDeleted(post.id);
  };

  const handleReport = async () => {
    setMenuOpen(false);
    const { error } = await reportEmpireContent({ postId: post.id }, 'Reported from Signal');
    toast(error ? { title: 'Could not send report', desc: error, icon: 'info' } : { title: 'Post reported', icon: 'check' });
  };

  const handlePinToggle = async () => {
    setMenuOpen(false);
    setBusy(true);
    const { error } = await setEmpirePostPinned(post.id, !post.isPinned);
    setBusy(false);
    if (error) {
      toast({ title: 'Could not update pin', desc: error, icon: 'info' });
      return;
    }
    // Pinning moves a post OUT of the regular feed into the Featured
    // slot (and vice versa for unpinning) — it can never just be patched
    // in place, it has to leave whichever list currently renders it, and
    // the page needs to resync both the regular feed and the Featured
    // slot to pick it up in its new home.
    onDeleted(post.id);
    onPinToggled?.();
  };

  const handleProfilePinToggle = async () => {
    setMenuOpen(false);
    setBusy(true);
    const { error } = await setEmpirePostProfilePin(post.id, !post.pinnedToProfile);
    setBusy(false);
    if (error) {
      toast({ title: 'Could not update pin', desc: error, icon: 'info' });
      return;
    }
    onChanged({ ...post, pinnedToProfile: !post.pinnedToProfile });
  };

  const handleArchiveToggle = async () => {
    setMenuOpen(false);
    setBusy(true);
    const nextArchived = !post.isArchived;
    const { error } = await setEmpirePostArchived(post.id, nextArchived);
    setBusy(false);
    if (error) {
      toast({ title: 'Could not update archive', desc: error, icon: 'info' });
      return;
    }
    // Archiving also clears the profile pin server-side (a hidden post
    // can't stay pinned) — reflect that locally rather than waiting on
    // a refetch to notice.
    onChanged({ ...post, isArchived: nextArchived, pinnedToProfile: nextArchived ? false : post.pinnedToProfile });
  };

  const handleFeatureToggle = async () => {
    setMenuOpen(false);
    setBusy(true);
    const { error } = await setEmpirePostFeatured(post.id, !post.isFeatured);
    setBusy(false);
    if (error) {
      toast({ title: 'Could not update Featured', desc: error, icon: 'info' });
      return;
    }
    onDeleted(post.id);
    onFeaturedToggled?.();
  };

  if (editing) {
    return post.publisherType === 'self' ? (
      <SignalCommunityComposer
        editing={post}
        onDone={(updated) => { setEditing(false); onChanged(updated); }}
        onCancel={() => setEditing(false)}
      />
    ) : (
      <SignalPostComposer
        editing={post}
        onDone={(updated) => { setEditing(false); onChanged(updated); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const menuGroups: PostMenuItem[][] = [
    // Share-to-Messages is the one entry every viewer gets — the native share
    // sheet/copy-link lives on the always-visible Share button; this is the
    // "send it to a real CX Rent conversation" path.
    [{ icon: 'send', label: 'Share to Messages', onClick: () => setShareSheetOpen(true) }],
    ...(canModerate
      ? [
          [
            ...(isSpotlightPost ? [] : [{ icon: 'edit', label: 'Edit post', onClick: () => setEditing(true) } as PostMenuItem]),
            ...(isOwnPost
              ? [
                  { icon: 'pinned', label: post.pinnedToProfile ? 'Unpin from profile' : 'Pin to my profile', onClick: () => void handleProfilePinToggle(), fill: post.pinnedToProfile },
                  { icon: 'package', label: post.isArchived ? 'Unarchive' : 'Archive', onClick: () => void handleArchiveToggle() },
                ]
              : []),
          ] as PostMenuItem[],
          ...(canManage
            ? [[
                { icon: 'pinned', label: post.isPinned ? 'Unpin' : 'Pin to top', onClick: () => void handlePinToggle() },
                { icon: 'sparkles', label: post.isFeatured ? 'Unfeature' : 'Feature this post', onClick: () => void handleFeatureToggle() },
              ] as PostMenuItem[]]
            : []),
          [{ icon: 'trash', label: 'Delete post', onClick: () => void handleDelete(), danger: true }] as PostMenuItem[],
        ]
      : [[{ icon: 'info', label: 'Report post', onClick: () => void handleReport() }] as PostMenuItem[]]),
  ];

  return (
    <article
      onClick={handleCardClick}
      className={`relative animate-fade-up overflow-hidden bg-surface ${detail || featured ? '' : 'cursor-pointer'} ${
        featured
          ? 'card mb-5 rounded-3xl p-0 shadow-[0_8px_28px_-12px_rgba(0,212,71,0.35)] ring-2 ring-accent-bright/50'
          : isExclusive
            ? 'card mb-5 rounded-3xl p-0 shadow-[0_20px_48px_-24px_rgba(0,0,0,0.34)] ring-1 ring-[#c9971c]/40'
            : `border-b border-line transition-colors ${detail ? '' : 'active:bg-panel/40 sm:hover:bg-panel/25'}`
      }`}
    >
      {/* The one card on the whole feed that should read as "CX's own" —
          same restraint as the rest of the app's green accent, not a
          treatment every card gets. */}
      {featured && <BorderBeam size={110} duration={8} borderWidth={1.5} />}
      {featured && (
        <div className="flex items-center gap-1.5 border-b border-line bg-accent-bright/10 px-4 py-1.5 text-caption font-semibold text-accent-700">
          <Icon name={post.isPinned ? 'pinned' : 'sparkles'} size={12} fill={post.isPinned} />
          {post.isPinned ? 'Pinned Announcement' : 'Featured'}
        </div>
      )}
      {!featured && isExclusive && (
        <div className="flex items-center gap-1.5 border-b border-line bg-[#c9971c]/10 px-4 py-1.5 text-caption font-semibold text-[#8a6d1f]">
          <Icon name="sparkles" size={12} /> Exclusive
        </div>
      )}

      <div className="flex items-start gap-3 px-4 pb-2.5 pt-3.5 sm:px-5">
        <Link to={signalProfileHref(post, profileBase)} viewTransition aria-label={post.authorName} className="shrink-0">
          <SignalIdentityAvatar identity={identity} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link to={signalProfileHref(post, profileBase)} viewTransition className="flex min-w-0 max-w-full items-center gap-1.5 hover:underline">
              <span className="min-w-0 truncate font-display text-[15.5px] font-semibold leading-tight text-ink">{identity.name}</span>
              <SignalIdentityBadge identity={identity} />
            </Link>
          </div>
          <div className="mt-0.5 min-w-0 truncate text-[13px] leading-tight text-muted">
            <span>
              {identity.username ? `@${identity.username} · ` : ''}
              {timeAgo(post.createdAt)}
              {post.editedAt && ' · Edited'}
              {post.isArchived && ' · Archived'}
              {post.isDemo && ` · ${t('Sample')}`}
            </span>
          </div>
        </div>
        {/* Every item here (Edit/Pin/Feature/Archive/Delete/Report) acts
            on a real empire_posts row — none of it applies to a demo
            post, whose id doesn't exist in that table. Respect/Save/
            Share already work for demo posts via the always-visible
            action row below; that's the full real-interaction surface
            demo content gets. */}
        {Boolean(session?.user.id) && !post.isDemo && (
          <div className="relative shrink-0">
            <button
              ref={menuBtnRef}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Post options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={busy}
              className={`pressable -mr-1 grid h-10 w-10 place-items-center rounded-full transition-colors ${menuOpen ? 'bg-panel text-ink' : 'text-ink-soft hover:bg-panel'}`}
            >
              <Icon name="moreHorizontal" size={20} />
            </button>
            {menuOpen && <PostActionMenu anchor={menuBtnRef.current} groups={menuGroups} onClose={() => setMenuOpen(false)} />}
          </div>
        )}
      </div>

      {spotlight && (
        <div className="px-3 pb-3">
          <SignalSpotlightCard data={spotlight} all={spotlightAll} embedded compact={!detail} />
        </div>
      )}

      {post.title && !isSpotlightPost && (
        <h3 className={`px-4 pb-1 font-display font-semibold text-ink sm:px-5 ${featured ? 'text-feature' : 'text-lead'}`}>{tr.texts[0]}</h3>
      )}
      {post.body.trim() !== '' && !isSpotlightPost && (
        <div className="px-4 pb-3 sm:px-5">
          <p
            ref={bodyRef}
            className={`whitespace-pre-wrap break-words leading-relaxed text-ink ${featured ? 'text-detail' : detail ? 'text-[16px]' : 'text-[15px]'} ${featured && !post.title ? 'line-clamp-3' : clampText && !textExpanded ? 'line-clamp-6' : ''}`}
          >
            <PostText text={tr.texts[1]} />
          </p>
          {clampText && textClamped && !textExpanded && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setTextExpanded(true); }} className="pressable mt-1 text-detail font-semibold text-accent-700">
              {t('Show more')}
            </button>
          )}
        </div>
      )}

      {tr.available && post.body.trim() !== '' && !isSpotlightPost && (
        <div className="px-4 pb-3 sm:px-5">
          <button
            type="button"
            onClick={tr.toggle}
            disabled={tr.status === 'loading'}
            className={`pressable inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold transition-colors ${
              tr.on ? 'bg-accent-050 text-accent-bright' : 'bg-panel text-ink-soft hover:text-ink'
            }`}
          >
            <Icon name="globe" size={13} className={tr.status === 'loading' ? 'animate-spin' : ''} />
            {tr.status === 'loading' ? t('Translating…') : tr.on ? t('See original') : t('Translate')}
          </button>
        </div>
      )}
      {tr.available && tr.status === 'failed' && (
        <p className="px-4 pb-1.5 text-caption text-muted sm:px-5">{t('Translation unavailable')}</p>
      )}

      {tripBadge && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
          <VerifiedTripBadge />
          <span className="inline-flex items-center gap-1 text-caption font-medium text-muted">
            <Icon name="pin" size={11} /> {tripBadge.city} · {formatTripPeriod(tripBadge.startDate, tripBadge.endDate, lang)}
          </span>
        </div>
      )}

      {!post.isDemo && <SignalPollView postId={post.id} isOwnPost={isOwnPost} />}

      {post.vehicle && <SignalVehicleCard vehicle={post.vehicle} authorId={post.authorId} isOwnPost={isOwnPost} />}

      {post.mediaUrls.length > 0 && (
        <div className={featured ? '' : 'mx-4 mb-3 overflow-hidden rounded-2xl border border-line sm:mx-5'}>
        {detail && !featured ? (
          <div className="flex flex-col gap-1">
            {post.mediaUrls.map((url, i) =>
              mediaKindFromPath(url) === 'video' ? (
                <PostVideo key={url} src={url} full onClick={() => setViewerIndex(i)} className="aspect-video" />
              ) : (
                <PostImage
                  key={url}
                  src={url}
                  full
                  dynamicAspect
                  className="aspect-[4/5]"
                  onClick={() => setViewerIndex(i)}
                  onDoubleTap={handleDoubleTapRespect}
                  sharedId={i === 0 ? `post-media-${post.id}-${url}` : undefined}
                  sharedActive={viewerIndex === null}
                />
              ),
            )}
          </div>
        ) : featured ? (
          mediaKindFromPath(post.mediaUrls[0]) === 'video' ? (
            <PostVideo src={post.mediaUrls[0]} className="aspect-[16/10] w-full" fixedAspect onClick={() => setViewerIndex(0)} />
          ) : (
            <PostImage
              src={post.mediaUrls[0]}
              className="aspect-[16/10] w-full"
              onClick={() => setViewerIndex(0)}
              onDoubleTap={handleDoubleTapRespect}
              sharedId={`post-media-${post.id}-${post.mediaUrls[0]}`}
              sharedActive={viewerIndex === null}
            />
          )
        ) : post.mediaUrls.length === 1 ? (
          mediaKindFromPath(post.mediaUrls[0]) === 'video' ? (
            <PostVideo src={post.mediaUrls[0]} onClick={() => setViewerIndex(0)} className="aspect-video" />
          ) : (
            <PostImage
              src={post.mediaUrls[0]}
              onClick={() => setViewerIndex(0)}
              onDoubleTap={handleDoubleTapRespect}
              className="aspect-[4/5]"
              dynamicAspect
              sharedId={`post-media-${post.id}-${post.mediaUrls[0]}`}
              sharedActive={viewerIndex === null}
            />
          )
        ) : (
          <MediaCarousel urls={post.mediaUrls} onOpenViewer={setViewerIndex} onDoubleTap={handleDoubleTapRespect} />
        )}
        </div>
      )}

      {detail && <p className="px-4 pb-3 pt-3 text-caption text-muted sm:px-5">{postedAt}</p>}

      {/* The stats bar under every post: a plain row of icon + number — views,
          Respects and Saves for everyone (numbers only, never who), plus
          Shares and the "Performance" label for Owner/Admin. It fills in as
          people react. For Owner/Admin the eye also adds a view on tap (hold
          removes the extras you added; the +N counts them). */}
      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-0.5 sm:px-5">
        <div className="flex items-center gap-4 text-ink-soft">
            {(isTeamViewer ? (
                <button
                  type="button"
                  onClick={viewClick}
                  onPointerDown={viewPressStart}
                  onPointerUp={viewPressEnd}
                  onPointerLeave={viewPressEnd}
                  onPointerCancel={viewPressEnd}
                  aria-label="Add a view — hold to remove yours"
                  className="pressable inline-flex min-h-9 select-none items-center gap-1.5"
                >
                  <span className={`${BAR_ICON}`}><EyeIcon size={15} playKey={viewPlay} className="shrink-0 text-faint" /></span>
                  <span className="text-[13.5px] font-normal leading-none text-muted">{compact(post.viewCount)}</span>
                  <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-bright px-1 text-[10px] font-bold leading-none text-white">
                    {myViews > 1 ? `+${myViews - 1}` : '+'}
                  </span>
                </button>
              ) : (
                <span className="relative inline-flex">
                  <button
                    type="button"
                    onClick={() => { setViewsInfo((v) => !v); setViewPlay(Date.now()); }}
                    aria-label={t('Views')}
                    aria-expanded={viewsInfo}
                    className="pressable inline-flex min-h-9 select-none items-center gap-1.5"
                  >
                    <span className={BAR_ICON}><EyeIcon size={15} playKey={viewPlay} className="shrink-0 text-faint" /></span>
                    <span className="text-[13.5px] font-normal leading-none text-muted">{compact(post.viewCount)}</span>
                  </button>
                  {viewsInfo && (
                    <>
                      <span aria-hidden="true" data-no-open className="fixed inset-0 z-10" onClick={() => setViewsInfo(false)} />
                      <span
                        role="tooltip"
                        data-no-open
                        className="absolute bottom-full left-0 z-20 mb-1 w-56 animate-scale-in rounded-xl bg-ink px-3 py-2 text-left text-[12.5px] leading-snug text-white shadow-pop"
                      >
                        <span className="block font-semibold">{t('Views')}</span>
                        <span className="block text-white/75">{t('How many people have seen this post.')}</span>
                        <span aria-hidden="true" className="absolute -bottom-1 left-4 h-2 w-2 rotate-45 bg-ink" />
                      </span>
                    </>
                  )}
                </span>
              ))}
          {/* Respect — while a Respect stands, its stamp is pressed on the line between the post and this bar, above the hand */}
          <div className="relative flex items-center gap-2">
            {isTeamViewer ? (
              <Tap
                onClick={respectClick}
                onPointerDown={respectPressStart}
                onPointerUp={respectPressEnd}
                onPointerLeave={respectPressEnd}
                onPointerCancel={respectPressEnd}
                scale={0.94}
                aria-label={myRespects > 0 ? 'Rimuovi Respect' : 'Esprimi Respect'}
                className={`${BAR_ACTION} ${myRespects > 0 ? 'text-accent-700' : 'text-faint hover:text-accent-700'}`}
              >
                <span className={BAR_ICON}>
                  <RespectIcon size={14} filled={myRespects > 0} playKey={respectPlay} />
                </span>
                <span className="text-[13.5px] font-normal leading-none text-muted">{compact(post.likeCount)}</span>
              </Tap>
            ) : (
              <Tap
                onClick={handleRespect}
                scale={0.94}
                aria-label={post.likedByMe ? 'Rimuovi Respect' : 'Esprimi Respect'}
                className={`${BAR_ACTION} ${post.likedByMe ? 'text-accent-700' : 'text-faint hover:text-accent-700'}`}
              >
                <span className={BAR_ICON}>
                  <RespectIcon size={14} filled={post.likedByMe} playKey={respectPlay} />
                </span>
                <span className="text-[13.5px] font-normal leading-none text-muted">{compact(post.likeCount)}</span>
              </Tap>
            )}
            {respected && (
              <span
                key={stampKey}
                aria-hidden="true"
                style={stampKey > 0 ? undefined : { transform: 'rotate(-6deg)' }}
                className={`${stampKey > 0 ? 'respect-stamp' : ''} pointer-events-none absolute -top-[15px] left-1 z-10 whitespace-nowrap rounded-[4px] border-[1.5px] border-accent-bright bg-accent-050 px-1.5 py-[2px] text-[9.5px] font-black uppercase leading-none tracking-[0.2em] text-accent-700 shadow-[inset_0_0_0_1.5px_var(--color-accent-050),inset_0_0_0_2.5px_rgba(0,212,71,0.4)]`}
              >
                Respected
              </span>
            )}
          </div>

          {isTeamViewer ? (
            <Tap
              onClick={saveClick}
              onPointerDown={savePressStart}
              onPointerUp={savePressEnd}
              onPointerLeave={savePressEnd}
              onPointerCancel={savePressEnd}
              scale={0.94}
              aria-label={mySaves > 0 ? `Save (${mySaves}) — hold to choose a collection` : 'Save — hold to choose a collection'}
              className={`${BAR_ACTION} ${mySaves > 0 ? 'text-ink' : 'text-faint hover:text-ink'}`}
            >
              <span className={BAR_ICON}>
                <BookmarkIcon size={15} filled={mySaves > 0} playKey={savePlay} />
              </span>
            </Tap>
          ) : (
            <Tap
              onClick={saveTap}
              onPointerDown={collectPressStart}
              onPointerUp={collectPressEnd}
              onPointerLeave={collectPressEnd}
              onPointerCancel={collectPressEnd}
              onContextMenu={(e: { preventDefault: () => void }) => e.preventDefault()}
              scale={0.94}
              aria-label={post.savedByMe ? 'Saved — hold to choose a collection' : 'Save — hold to choose a collection'}
              className={`${BAR_ACTION} select-none [-webkit-touch-callout:none] ${post.savedByMe ? 'text-ink' : 'text-faint hover:text-ink'}`}
            >
              <span className={BAR_ICON}>
                <BookmarkIcon size={15} filled={post.savedByMe} playKey={savePlay} />
              </span>
            </Tap>
          )}
        </div>

        <div className="flex items-center gap-4">
          {canManage && <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Performance</span>}
          {/* Owner-only — add_empire_post_comment enforces this server-side;
              hiding it for everyone else is just honest UI. No demo
              equivalent (see signalDemo.ts). */}
          {isOwnerViewer && !post.isDemo && (
            <Tap
              onClick={() => setCommentsSheetOpen(true)}
              scale={0.94}
              aria-label="Comment"
              className={`${BAR_ACTION} text-faint hover:text-sky-600`}
            >
              <span className={BAR_ICON}>
                <Icon name="message" size={15} />
              </span>
            </Tap>
          )}
          <Tap
            onClick={handleShare}
            scale={0.94}
            aria-label="Share"
            className={`${BAR_ACTION} text-faint hover:text-accent-700`}
          >
            <span className={`${BAR_ICON} `}>
              <ShareIcon size={15} playKey={sharePlay} />
            </span>
            {canManage && <span className="text-[13.5px] font-normal leading-none text-muted">{compact(post.shareCount)}</span>}
          </Tap>
        </div>
      </div>

      {/* Owner/CX-team comments are public — they render right here,
          automatically, for every viewer the moment at least one exists,
          no tap required. SignalComments itself still only shows the
          write composer to the Owner (isOwnerViewer above already keeps
          the dedicated "Comment" action Owner-only for actually writing
          one via the sheet). */}
      {post.commentCount > 0 && !post.commentsDisabled && (
        <div data-no-open className="border-t border-line">
          <SignalComments
            postId={post.id}
            canModerateAll={canManage}
            onCountChanged={(delta) => onChanged({ ...post, commentCount: post.commentCount + delta })}
          />
        </div>
      )}

      {/* Owner/Admin only — the real numbers behind the three actions
          above, never shown to a regular user. Plain text, not a
          dashboard: this is a glance, not an analytics screen (see
          SignalAnalyticsSheet for the site-wide breakdown). */}
      {collectionsOpen && (
        <SignalCollectionsSheet
          postId={post.id}
          onClose={() => setCollectionsOpen(false)}
          onClearSaves={isTeamViewer && mySaves > 0 ? () => void handleClearSaves() : undefined}
        />
      )}

      {viewerIndex !== null && (
        <SignalMediaViewer images={post.mediaUrls} sharedKey={post.id} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}

      {shareSheetOpen && <SignalSharePostSheet post={post} onClose={() => setShareSheetOpen(false)} />}

      {commentsSheetOpen && (
        <SignalCommentsSheet
          post={post}
          canModerateAll={canManage}
          onCountChanged={(delta) => onChanged({ ...post, commentCount: post.commentCount + delta })}
          onClose={() => setCommentsSheetOpen(false)}
        />
      )}
    </article>
  );
}
