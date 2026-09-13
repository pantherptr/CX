import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../Icon';
import { useApp } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { compact } from '../../lib/format';
import {
  EMPIRE_CATEGORIES, toggleEmpirePostLike, toggleEmpirePostSave, deleteEmpirePost, setEmpirePostPinned,
  setEmpirePostFeatured, markEmpirePostViewed, incrementEmpirePostImpression, incrementEmpirePostShare,
  reportEmpireContent, mediaKindFromPath, type EmpirePost,
} from '../../lib/data/empireFeed';
import { resolveSignalIdentity } from '../../lib/data/signalIdentity';
import { SignalIdentityAvatar, SignalIdentityBadge } from './SignalIdentityBadge';
import { SignalMediaViewer } from './SignalMediaViewer';
import { SignalSharePostSheet } from './SignalSharePostSheet';
import { SignalPostComposer } from './SignalPostComposer';
import { SignalComments } from './SignalComments';

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

const categoryLabel = (c: EmpirePost['category']) => EMPIRE_CATEGORIES.find((x) => x.value === c)?.label ?? c;

// A single video/image in the feed (not the fixed-crop hero or multi-media
// grid) shows its OWN aspect ratio rather than a hardcoded 16:9 — but never
// narrower than 4:5, so a 9:16 vertical clip is cropped down to a normal
// portrait-post height instead of stretching to nearly the full viewport
// (the "video takes over the screen" complaint this whole pass fixes). A
// max-height is a second, independent safety net for wide desktop cards.
const MIN_MEDIA_ASPECT = 4 / 5;
const MEDIA_MAX_HEIGHT_CLASS = 'max-h-[420px] sm:max-h-[520px]';

function PostImage({
  src,
  className,
  onClick,
  dynamicAspect = false,
}: {
  src: string;
  className: string;
  onClick?: () => void;
  /** True only for a single, standalone image post — reads the image's
   *  own natural size instead of using `className`'s fixed aspect
   *  utility. Multi-image grids and the Featured/Pinned hero keep their
   *  fixed crop, unchanged. */
  dynamicAspect?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);
  const content = (
    <>
      {!loaded && <div className="skeleton absolute inset-0" />}
      <img
        src={src}
        alt=""
        loading="lazy"
        onLoad={(e) => {
          setLoaded(true);
          if (dynamicAspect) {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setAspect(Math.max(img.naturalWidth / img.naturalHeight, MIN_MEDIA_ASPECT));
            }
          }
        }}
        className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${onClick ? 'hover:scale-[1.03]' : ''} transition-transform`}
      />
    </>
  );
  const dynamicClass = dynamicAspect ? `w-full ${MEDIA_MAX_HEIGHT_CLASS}` : className;
  const style = dynamicAspect ? { aspectRatio: aspect ? `${aspect}` : '4/5' } : undefined;
  return onClick ? (
    <button onClick={onClick} style={style} className={`relative overflow-hidden bg-panel ${dynamicClass}`}>{content}</button>
  ) : (
    <div style={style} className={`relative overflow-hidden bg-panel ${dynamicClass}`}>{content}</div>
  );
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
}: {
  src: string;
  className: string;
  onClick?: () => void;
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
      className={`relative overflow-hidden bg-panel ${fixedAspect ? className : `w-full ${MEDIA_MAX_HEIGHT_CLASS}`}`}
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
          if (!fixedAspect && v.videoWidth && v.videoHeight) setAspect(Math.max(v.videoWidth / v.videoHeight, MIN_MEDIA_ASPECT));
        }}
        onError={() => setErrored(true)}
        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
        className={`h-full w-full cursor-pointer object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
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
  showComments = false,
  onChanged,
  onDeleted,
  onPinToggled,
  onFeaturedToggled,
}: {
  post: EmpirePost;
  canManage: boolean;
  featured?: boolean;
  /** Only the detail view (`SignalPostDetail`) passes this — comments
   *  stay out of the scrolling feed's cards to keep the feed as clean as
   *  the no-public-counters redesign already made it; they're reachable
   *  the moment you open a post. */
  showComments?: boolean;
  onChanged: (post: EmpirePost) => void;
  onDeleted: (postId: string) => void;
  onPinToggled?: () => void;
  onFeaturedToggled?: () => void;
}) {
  const { toast } = useApp();
  const { session } = useAuth();
  const { pathname } = useLocation();
  const profileBase = pathname.startsWith('/signal/community') ? '/signal/community' : '/signal';
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [likeBounce, setLikeBounce] = useState(false);

  const isExclusive = post.category === 'exclusive';
  const identity = resolveSignalIdentity(post.publisherType, post.authorName, post.authorAvatarUrl, post.authorIsHost, post.authorIsVerifiedClient);
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
  useEffect(() => {
    markEmpirePostViewed(post.id);
    incrementEmpirePostImpression(post.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  // Internally still "like" — toggle_empire_post_like/empire_post_likes/
  // likedByMe/likeCount are unchanged on purpose (the real engagement
  // architecture this sits on, preserved exactly as the brief asks); only
  // the visible label/icon-treatment below present it as "Respect".
  const handleRespect = async () => {
    onChanged({ ...post, likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) });
    if (!post.likedByMe) {
      setLikeBounce(true);
      window.setTimeout(() => setLikeBounce(false), 300);
    }
    const { error } = await toggleEmpirePostLike(post.id);
    if (error) onChanged(post);
  };

  const handleSave = async () => {
    onChanged({ ...post, savedByMe: !post.savedByMe, saveCount: post.saveCount + (post.savedByMe ? -1 : 1) });
    const { error } = await toggleEmpirePostSave(post.id);
    if (error) onChanged(post);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/signal/post/${post.id}`;
    const shareData = { title: post.title || 'CX Rent — Signal', text: post.body.slice(0, 140), url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        // Only a completed share is real activity — a cancelled system
        // sheet throws and falls into the catch below, uncounted.
        void incrementEmpirePostShare(post.id);
      } catch {
        // user cancelled — no error toast, no share event recorded
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied to clipboard', icon: 'check' });
      void incrementEmpirePostShare(post.id);
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
    return (
      <SignalPostComposer
        editing={post}
        mode={post.publisherType === 'self' ? 'self' : 'official'}
        onDone={(updated) => { setEditing(false); onChanged(updated); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <article
      className={`card mb-2.5 animate-fade-up overflow-hidden p-0 ${
        featured
          ? 'ring-2 ring-accent-bright/50 shadow-[0_8px_28px_-12px_rgba(0,212,71,0.35)]'
          : isExclusive
            ? 'ring-1 ring-[#c9971c]/40'
            : ''
      }`}
    >
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

      <div className="flex items-start gap-2.5 p-3 pb-2 sm:px-4">
        <Link to={signalProfileHref(post, profileBase)} className="shrink-0">
          <SignalIdentityAvatar identity={identity} size={36} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={signalProfileHref(post, profileBase)} className="flex items-center gap-1.5 hover:underline">
            <span className="truncate font-display font-semibold text-ink">{identity.name}</span>
            <SignalIdentityBadge identity={identity} />
          </Link>
          <p className="truncate text-caption text-muted">{identity.subtitle}</p>
          <p className="text-caption text-muted">
            {categoryLabel(post.category)} · {timeAgo(post.createdAt)}
            {post.editedAt && ' · Edited'}
          </p>
        </div>
        {Boolean(session?.user.id) && (
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Post options"
              disabled={busy}
              className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel"
            >
              <Icon name="moreHorizontal" size={18} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
                  {/* Share-to-Messages is the one entry every viewer gets
                      regardless of ownership — the native share sheet/
                      copy-link already lives on the always-visible Share
                      button below, this is specifically the "send it to
                      a real CX Rent conversation" path from the brief. */}
                  <button onClick={() => { setMenuOpen(false); setShareSheetOpen(true); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-detail text-ink hover:bg-panel">
                    <Icon name="send" size={15} /> Share to Messages
                  </button>
                  {canModerate ? (
                    <>
                      <button onClick={() => { setMenuOpen(false); setEditing(true); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-detail text-ink hover:bg-panel">
                        <Icon name="edit" size={15} /> Edit post
                      </button>
                      {canManage && (
                        <>
                          <button onClick={handlePinToggle} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-detail text-ink hover:bg-panel">
                            <Icon name="pinned" size={15} /> {post.isPinned ? 'Unpin' : 'Pin to top'}
                          </button>
                          <button onClick={handleFeatureToggle} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-detail text-ink hover:bg-panel">
                            <Icon name="sparkles" size={15} /> {post.isFeatured ? 'Unfeature' : 'Feature this post'}
                          </button>
                        </>
                      )}
                      <button onClick={handleDelete} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-detail text-danger hover:bg-danger/5">
                        <Icon name="trash" size={15} /> Delete post
                      </button>
                    </>
                  ) : (
                    // A regular viewer, not the author or a moderator —
                    // Save already has its own always-visible button in
                    // the action row below, so the only thing left to
                    // offer here is Report (same RPC/pattern
                    // SignalComments.tsx already uses for a comment).
                    <button onClick={handleReport} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-detail text-ink hover:bg-panel">
                      <Icon name="info" size={15} /> Report post
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {post.title && (
        <h3 className={`px-3 pb-1 font-display font-semibold text-ink sm:px-4 ${featured ? 'text-feature' : 'text-lead'}`}>{post.title}</h3>
      )}
      <p className={`whitespace-pre-wrap break-words px-3 pb-2 leading-relaxed text-ink sm:px-4 ${featured ? 'text-detail' : 'text-body'} ${featured && !post.title ? 'line-clamp-3' : ''}`}>
        {post.body}
      </p>

      {post.vehicle && (
        <Link
          to={`/cars/${post.vehicle.slug}`}
          className="pressable mx-3 mb-2 flex items-center gap-3 rounded-xl border border-line bg-panel p-2 sm:mx-4"
        >
          <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface">
            {post.vehicle.imageUrl ? (
              <img src={post.vehicle.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-muted"><Icon name="car" size={20} /></span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-detail font-semibold text-ink">
              {post.vehicle.year} {post.vehicle.make} {post.vehicle.model}
            </span>
            <span className="block truncate text-caption text-muted">
              {post.vehicle.city} · €{compact(post.vehicle.pricePerDay)}/day
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-caption font-semibold text-accent-700">
            View Vehicle <Icon name="chevronRight" size={14} />
          </span>
        </Link>
      )}

      {post.mediaUrls.length > 0 && (
        featured ? (
          mediaKindFromPath(post.mediaUrls[0]) === 'video' ? (
            <PostVideo src={post.mediaUrls[0]} className="aspect-[16/10] w-full" fixedAspect onClick={() => setViewerIndex(0)} />
          ) : (
            <PostImage src={post.mediaUrls[0]} className="aspect-[16/10] w-full" onClick={() => setViewerIndex(0)} />
          )
        ) : (
          <div className={`grid gap-0.5 px-0 ${post.mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {post.mediaUrls.map((url, i) =>
              mediaKindFromPath(url) === 'video' ? (
                <PostVideo
                  key={url}
                  src={url}
                  onClick={() => setViewerIndex(i)}
                  // A single video keeps its own composition; a mixed
                  // multi-media grid still needs every cell the same
                  // square shape so the grid itself stays tidy.
                  className={post.mediaUrls.length === 1 ? 'aspect-video' : 'aspect-square'}
                  fixedAspect={post.mediaUrls.length > 1}
                />
              ) : (
                <PostImage
                  key={url}
                  src={url}
                  onClick={() => setViewerIndex(i)}
                  className={post.mediaUrls.length === 1 ? 'aspect-[4/5]' : 'aspect-square'}
                  dynamicAspect={post.mediaUrls.length === 1}
                />
              ),
            )}
          </div>
        )
      )}

      {/* No numbers anywhere in this row, deliberately — Views/Likes/
          Saves/Shares are all still tracked for real underneath (see the
          mount effect above and each handler below), but a regular user
          only ever sees the three actions themselves. Evenly split three
          ways so every touch target is equally large on mobile, rather
          than clustering left with Share pushed to the far edge. */}
      <div className="grid grid-cols-3 gap-1 px-2 py-1 sm:px-3">
        {/* SIGNAL's signature interaction — "Respect", not "Like": same
            thumbs-up throughout both states (never swapped for a heart
            or checkmark), just filled + CX green + a quick scale/glow
            pop when it lands. `whitespace-nowrap` keeps "Respected" (the
            longer of the two labels) from ever wrapping to a second
            line and shifting the row's height. */}
        <button
          onClick={handleRespect}
          className={`pressable flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full py-2 text-detail font-semibold transition-colors ${
            post.likedByMe ? 'bg-accent-050 text-accent-700' : 'text-ink-soft hover:bg-panel'
          }`}
        >
          <Icon
            name="like"
            size={18}
            fill={post.likedByMe}
            className={likeBounce ? 'animate-respect-pop' : ''}
          />
          {post.likedByMe ? 'Respected' : 'Respect'}
        </button>
        <button
          onClick={handleSave}
          className={`pressable flex items-center justify-center gap-1.5 rounded-full py-2 text-detail font-semibold transition-colors ${
            post.savedByMe ? 'bg-accent-050 text-accent-700' : 'text-ink-soft hover:bg-panel'
          }`}
        >
          <Icon name="bookmark" size={17} fill={post.savedByMe} />
          {post.savedByMe ? 'Saved' : 'Save'}
        </button>
        <button onClick={handleShare} className="pressable flex items-center justify-center gap-1.5 rounded-full py-2 text-detail font-semibold text-ink-soft transition-colors hover:bg-panel">
          <Icon name="share" size={17} />
          Share
        </button>
      </div>

      {/* Owner/Admin only — the real numbers behind the three actions
          above, never shown to a regular user. Plain text, not a
          dashboard: this is a glance, not an analytics screen (see
          SignalAnalyticsSheet for the site-wide breakdown). */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-1.5 text-[11px] text-faint sm:px-4">
          <span className="font-semibold uppercase tracking-wide">Performance</span>
          <span>{compact(post.viewCount)} views</span>
          <span>{compact(post.likeCount)} likes</span>
          <span>{compact(post.saveCount)} saves</span>
          <span>{compact(post.shareCount)} shares</span>
        </div>
      )}

      {showComments && !post.commentsDisabled && (
        <div className="border-t border-line">
          <SignalComments
            postId={post.id}
            canModerateAll={canManage}
            onCountChanged={(delta) => onChanged({ ...post, commentCount: post.commentCount + delta })}
          />
        </div>
      )}

      {viewerIndex !== null && (
        <SignalMediaViewer images={post.mediaUrls} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}

      {shareSheetOpen && <SignalSharePostSheet post={post} onClose={() => setShareSheetOpen(false)} />}
    </article>
  );
}
