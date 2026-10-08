import { useEffect, useRef, useState } from 'react';
import { useLightStatusBar } from '../../lib/useLightStatusBar';
import { useApp } from '../../lib/store';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img, vibrateTap } from '../motion';
import { markEmpireStoryViewed, deleteEmpireStory, toggleEmpireStoryRespect, type EmpireStory } from '../../lib/data/empireStories';
import { resolveSignalIdentity } from '../../lib/data/signalIdentity';
import { SignalIdentityAvatar, SignalIdentityBadge } from './SignalIdentityBadge';
import { StoryTextSlide } from './StoryTextSlide';
import { StoryCanvas } from './StoryCanvas';
import { SignalStoryInsights } from './SignalStoryInsights';
import { useAuth } from '../../lib/auth';
import { motion, SharedAvatar, useHideForNavigation, useReducedMotion, SPRING_SNAPPY } from '../motionKit';
import { Ugc } from '../../lib/i18n/ugc';
import { fetchStoryTripLabels } from '../../lib/data/tripMemories';

const SLIDE_DURATION_MS = 5000;
const HOLD_DELAY_MS = 180;
const SWIPE_THRESHOLD_PX = 60;
const CLOSE_SWIPE_THRESHOLD_PX = 90;

/** A video slide's progress bar (see below) tracks real playback via
 *  `timeupdate` instead of this fixed duration — an image slide has no
 *  natural "done" signal of its own, a video already does. */

/** Fullscreen Story viewer — same `fixed inset-0` full-viewport escape
 *  pattern `SignalMediaViewer.tsx` already uses. A per-slide progress
 *  bar row auto-advances on a real CSS animation (no per-frame JS timer
 *  — `animation-play-state` pauses/resumes at its exact current position
 *  for free), tap zones and horizontal swipes both navigate, and a
 *  press-and-hold pauses playback. Navigating past the last slide of the
 *  last story closes the viewer; navigating before the first slide of
 *  the first story is a no-op. */
export function SignalStoryViewer({
  stories,
  startIndex,
  canManage,
  onClose,
  onStoryDeleted,
  onMarkViewed = markEmpireStoryViewed,
  onDeleteStory = deleteEmpireStory,
  deleteConfirmMessage = 'Delete this Story? This cannot be undone.',
}: {
  stories: EmpireStory[];
  startIndex: number;
  canManage: boolean;
  onClose: () => void;
  onStoryDeleted: () => void;
  /** Overridable so SignalHighlightsBar can reuse this same viewer for
   *  permanent Highlights, which have no per-viewer "viewed" state (its
   *  override always resolves `true` — a Highlight has no View Once
   *  concept to authorize against). The boolean is the sole source of
   *  truth for whether a View Once Story's media may render at all —
   *  see the gating effect below. */
  onMarkViewed?: (id: string) => Promise<boolean>;
  /** Overridable so Highlights delete through their own RPC instead of
   *  the Story-specific one. */
  onDeleteStory?: (id: string) => Promise<{ error: string | null }>;
  deleteConfirmMessage?: string;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { session } = useAuth();
  const { toast } = useApp();
  const reduceMotion = !!useReducedMotion();
  useLightStatusBar();
  const [storyIndex, setStoryIndex] = useState(startIndex);
  // Story -> Profile -> Story: opening a profile from here must not
  // unmount (and lose) this viewer's position — see useHideForNavigation's
  // own comment for the mechanics. `hidingForProfile` hides the output but
  // keeps every hook's state (storyIndex/slideIndex/paused/dragY) alive.
  const { hidden: hidingForProfile, hideForNavigation } = useHideForNavigation(pathname);
  const [slideIndex, setSlideIndex] = useState(0);
  const [holdPaused, setPaused] = useState(false);
  // The header's pause/play button — separate from hold-to-pause, which
  // releases itself on touch end and would otherwise undo a manual pause.
  // Paused only while a finger (or the mouse) is held on the Story.
  const paused = holdPaused;
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Respect is per-story (one respect_count for the whole Story, not per
  // slide) — the `stories` prop is a fixed snapshot for this viewer's
  // lifetime, so a toggle here is tracked locally per story id rather
  // than mutating the prop; the aggregate count itself is never shown
  // inline (see the header's own comment) so there's nothing to keep in
  // sync beyond this one boolean.
  const [respectedOverrides, setRespectedOverrides] = useState<Record<string, boolean>>({});
  const [respecting, setRespecting] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  // Video-only: real playback progress (0-100, driven by `timeupdate`)
  // and a per-slide mute flag, muted by default on every new slide per
  // the brief.
  const [videoProgress, setVideoProgress] = useState(0);
  const [muted, setMuted] = useState(true);
  // Live vertical drag offset for the "pull down to close" gesture —
  // 0 when at rest; the whole viewer follows the finger 1:1 via
  // `translateY` for direct-manipulation feel, then either completes the
  // close or snaps back on release (see handleTouchEnd).
  const [dragY, setDragY] = useState(0);
  const [closing, setClosing] = useState(false);
  // Per-story authorization result for View Once gating — `undefined`
  // while a View Once Story's authorize call is still in flight (its
  // media stays unrendered until this resolves), `true` once cleared to
  // show, `false` if the server says it's already been consumed. Every
  // non-View-Once (or author-viewing-their-own) story is set `true`
  // synchronously, so the vast majority of Stories never show a pending
  // state at all — see the gating effect below.
  const [storyAuth, setStoryAuth] = useState<Record<string, boolean>>({});
  const viewedRef = useRef<Set<string>>(new Set());
  const holdTimerRef = useRef<number | null>(null);
  const heldRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const draggingVerticalRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const story = stories[storyIndex];
  // "On the Road · Verified trip": only the general city, only if the author chose it.
  const [tripLabels, setTripLabels] = useState<Map<string, string>>(new Map());
  const storyIdsKey = stories.map((x) => x.id).join(',');
  useEffect(() => {
    let cancelled = false;
    fetchStoryTripLabels(stories.map((x) => x.id)).then((m) => { if (!cancelled) setTripLabels(m); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyIdsKey]);
  // The shared-element morph (see SignalStoriesBar's matching comment)
  // only ever connects to the ONE tile that was actually tapped —
  // `startIndex` is stable for this viewer instance's whole lifetime, so
  // this is fixed once, not recomputed as `storyIndex` changes underneath
  // it. Swiping to a different Story inside the viewer just stops
  // sharing the id (falls back to a plain avatar) rather than trying to
  // reconnect to a different bar tile in real time.
  const initialStoryId = stories[startIndex]?.id;
  const slide = story?.slides[slideIndex];
  const isVideo = slide?.mediaType === 'video';
  const isText = slide?.mediaType === 'text';

  useEffect(() => {
    setVideoProgress(0);
    setMuted(true);
  }, [slide?.id]);

  // Hold-to-pause already drives the image slide's CSS animation via
  // `animationPlayState` below — a video slide needs the same pause
  // reflected in actual playback, not just the progress bar freezing.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else video.play().catch(() => {});
  }, [paused, slide?.id]);

  // Authorize-then-view: a View Once Story a non-author is opening for
  // the first time this viewer-instance-lifetime gets awaited — its
  // media only renders once the server confirms this is legitimately
  // the first viewing (see markEmpireStoryViewed's own comment; this is
  // what actually stops a stale, already-fetched tile from being
  // re-opened and replayed, not just fetch_active_empire_stories'
  // WHERE-clause exclusion on the *next* fetch). Every other Story marks
  // in the background exactly as before — zero added latency.
  useEffect(() => {
    if (!story || viewedRef.current.has(story.id)) return;
    viewedRef.current.add(story.id);
    const isAuthor = session != null && story.authorId === session.user.id;
    if (!(story.isViewOnce && !isAuthor)) {
      setStoryAuth((m) => ({ ...m, [story.id]: true }));
      onMarkViewed(story.id);
      return;
    }
    const id = story.id;
    onMarkViewed(id)
      .then((authorized) => setStoryAuth((m) => ({ ...m, [id]: authorized })))
      .catch(() => setStoryAuth((m) => ({ ...m, [id]: true })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story]);

  useEffect(() => {
    setSlideIndex(0);
  }, [storyIndex]);

  // Without this, iOS Safari lets the page behind this `fixed inset-0`
  // overlay keep scrolling under touch/swipe gestures — the overlay stays
  // pinned to the layout viewport while the visual viewport shifts, which
  // exposes the page's own background (white) below the Story for an
  // instant. Every other fullscreen viewer in this codebase already locks
  // body scroll the same way (see SignalMediaViewer.tsx); this one just
  // never had it.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => void (document.body.style.overflow = prevOverflow);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNextSlide();
      if (e.key === 'ArrowLeft') goPrevSlide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyIndex, slideIndex]);

  if (!story || !slide || hidingForProfile) return null;

  const identity = resolveSignalIdentity(story.publisherType, story.authorName, story.authorAvatarUrl, story.authorIsHost, story.authorIsVerifiedClient, story.authorIsOwner, story.authorIsAdmin, story.authorUsername);
  // Same real-account routing SignalPostCard's signalProfileHref uses —
  // "cx"/"assistant" get the static official info block, everyone else
  // (Owner's real row, or a Host/Verified Client's own Story) opens their
  // real profile by id. Space-aware (Official vs Community) via the
  // current pathname, same pattern used throughout Signal.
  const profileBase = pathname.startsWith('/signal/community') ? '/signal/community' : '/signal';
  const profileHref =
    story.publisherType === 'cx' ? `${profileBase}/profile/cx`
    : story.publisherType === 'assistant' ? `${profileBase}/profile/assistant`
    : `${profileBase}/profile/${story.authorId}`;
  const openProfile = () => {
    // Already on this exact profile (this viewer is itself embedded in
    // that profile screen, e.g. viewing your own Story from your own
    // profile) — navigating is a no-op, so there's nothing that will
    // ever cover us; hiding here would just get stuck forever since
    // pathname would never actually change away and back.
    if (profileHref === pathname) return;
    hideForNavigation();
    navigate(profileHref);
  };
  // Mirrors delete_empire_story's own real rule (author-or-admin, see
  // 0058's own comment) — `canManage` alone under-reports what a Host/
  // Verified Client is actually allowed to do to their own Story.
  const canDelete = canManage || (session != null && story.authorId === session.user.id);
  // `authorId === ''` is highlightAsStory's own placeholder sentinel for
  // "this isn't a real Story, it's a permanent Highlight" — Highlights
  // have no live view/respect tracking of their own, so Respect and
  // Story Insights both stay hidden for them rather than acting on IDs
  // that don't exist in empire_stories/empire_story_respects.
  const isRealStory = story.authorId !== '';
  // Same author-or-admin rule fetch_empire_story_insights enforces
  // server-side — kept here only to decide whether to show the entry
  // point at all, never to grant anything the RPC itself wouldn't.
  const canViewInsights = isRealStory && canDelete;
  const isRespected = respectedOverrides[story.id] ?? story.respectedByMe;
  // See the authorize-then-view effect above — `undefined` means still
  // waiting on the server, `false` means already consumed. Both cases
  // keep this Story's actual media out of the DOM entirely (not just
  // hidden behind an overlay) — a blocked or still-authorizing View Once
  // Story never has its mediaUrl requested.
  const authState = storyAuth[story.id];
  const isPending = authState === undefined;
  const isBlocked = authState === false;

  const goNextSlide = () => {
    if (slideIndex < story.slides.length - 1) {
      setSlideIndex((i) => i + 1);
    } else if (storyIndex < stories.length - 1) {
      setStoryIndex((i) => i + 1);
    } else {
      onClose();
    }
  };

  const goPrevSlide = () => {
    if (slideIndex > 0) {
      setSlideIndex((i) => i - 1);
    } else if (storyIndex > 0) {
      setStoryIndex((i) => i - 1);
    }
  };

  const startHold = () => {
    heldRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      heldRef.current = true;
      setPaused(true);
    }, HOLD_DELAY_MS);
  };
  const endHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setPaused(false);
  };

  const handleZoneClick = (dir: 'next' | 'prev') => {
    if (heldRef.current) {
      heldRef.current = false;
      return;
    }
    if (dir === 'next') goNextSlide(); else goPrevSlide();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    draggingVerticalRef.current = false;
    startHold();
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    if (startX === null || startY === null) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    // Once a gesture reads as "mostly downward," commit to the close-drag
    // for the rest of this touch — a hold-to-pause no longer makes sense
    // once the Story is visibly being dragged away, and a mixed
    // diagonal gesture should pick one behavior, not both at once.
    if (!draggingVerticalRef.current && dy > 12 && dy > Math.abs(dx)) {
      draggingVerticalRef.current = true;
      endHold();
    }
    if (draggingVerticalRef.current) {
      setDragY(Math.max(0, dy));
    }
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    endHold();
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (draggingVerticalRef.current) {
      draggingVerticalRef.current = false;
      heldRef.current = true; // suppress the tap-nav click that follows
      if (dragY > CLOSE_SWIPE_THRESHOLD_PX) {
        setClosing(true);
        window.setTimeout(onClose, 200);
      } else {
        setDragY(0);
      }
      return;
    }
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) {
      heldRef.current = true; // suppress the tap-nav click that follows
      if (dx < 0) goNextSlide(); else goPrevSlide();
    }
  };

  // The confirmation is an in-app sheet, not `window.confirm`: inside the iOS
  // app's web view the native confirm can silently answer "no", which made
  // Delete look like it did nothing. A failed delete now says why.
  const handleDelete = () => {
    endHold();
    setConfirmDelete(true);
  };
  const runDelete = async () => {
    setDeleting(true);
    const { error } = await onDeleteStory(story.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (error) {
      toast({ title: 'Could not delete', desc: error, icon: 'info' });
      return;
    }
    onStoryDeleted();
    onClose();
  };

  const handleToggleRespect = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isRealStory || respecting) return;
    const id = story.id;
    const next = !isRespected;
    setRespecting(true);
    setRespectedOverrides((prev) => ({ ...prev, [id]: next }));
    vibrateTap();
    const { error } = await toggleEmpireStoryRespect(id);
    if (error) setRespectedOverrides((prev) => ({ ...prev, [id]: !next })); // revert on failure
    setRespecting(false);
  };

  return (
    // Every Story renders in the exact same strict 9:16 frame it was
    // composed in (`StoryCanvas` — shared with the camera/editor), so a
    // Story always looks the same shape it did while being made. On a
    // phone screen taller than 9:16 that means real letterbox bars, not
    // a stretch to fill the device; on desktop the same box just centers
    // over a dim backdrop instead of blowing up full-bleed.
    <div className="fixed inset-0 z-[300] bg-black animate-fade-in sm:bg-black/90 sm:p-6">
      <StoryCanvas
        fillOnPhone
        boxClassName="shadow-2xl sm:rounded-2xl"
        boxStyle={{
          transform: `translateY(${closing ? '100%' : `${dragY}px`})`,
          opacity: closing ? 0 : dragY > 0 ? Math.max(0.4, 1 - dragY / 400) : 1,
          transition: dragY === 0 || closing ? 'transform 220ms ease-out, opacity 220ms ease-out' : 'none',
        }}
      >
      <div
        className="relative flex h-full w-full flex-col"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="absolute inset-0 flex items-center justify-center overflow-hidden"
          onMouseDown={startHold}
          onMouseUp={endHold}
          onMouseLeave={endHold}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {isPending ? (
            // The authorize round trip for a View Once Story — its
            // mediaUrl is never requested until the server clears it, so
            // there's genuinely nothing to leak here even for a moment.
            <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
          ) : isBlocked ? (
            <div className="flex flex-col items-center gap-3 px-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-white/70">
                <Icon name="eye" size={24} />
              </span>
              <p className="text-body font-semibold text-white">Already viewed</p>
              <p className="text-detail text-white/60">This Story can only be viewed once.</p>
            </div>
          ) : isVideo ? (
            <video
              key={slide.id}
              ref={videoRef}
              src={slide.mediaUrl}
              poster={slide.posterUrl ?? undefined}
              autoPlay
              muted={muted}
              playsInline
              // Stopping playback on leave is free: this element unmounts
              // the moment `slide`/`story` changes or the viewer closes —
              // that's what actually stops a video in a real browser, no
              // manual cleanup needed.
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration) setVideoProgress((v.currentTime / v.duration) * 100);
              }}
              onEnded={goNextSlide}
              className="h-full w-full animate-fade-in object-cover"
            />
          ) : isText ? (
            <StoryTextSlide
              key={slide.id}
              content={slide.textContent ?? ''}
              align={slide.textAlign}
              size={slide.textSize}
              bg={slide.bgStyle}
              className="animate-fade-in"
            />
          ) : (
            <Img
              key={slide.id}
              src={slide.mediaUrl}
              alt=""
              className="h-full w-full animate-fade-in object-cover"
              fallback={
                <div className="flex flex-col items-center gap-2 text-white/60">
                  <Icon name="image" size={32} />
                  <span className="text-detail">Image unavailable</span>
                </div>
              }
            />
          )}

          {isVideo && !isPending && !isBlocked && (
            <button
              onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
              aria-label={muted ? 'Unmute' : 'Mute'}
              style={{ bottom: 'max(env(safe-area-inset-bottom), 16px)' }}
              className="absolute right-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-black/60"
            >
              <Icon name={muted ? 'volumeOff' : 'volume'} size={17} />
            </button>
          )}

          <button onClick={() => handleZoneClick('prev')} aria-label="Previous" className="absolute inset-y-0 left-0 w-1/3" />
          <button onClick={() => handleZoneClick('next')} aria-label="Next" className="absolute inset-y-0 right-0 w-1/3" />

          {!isPending && !isBlocked && slide.caption && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pt-20" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
              <p className="text-body leading-relaxed text-white"><Ugc text={slide.caption} /></p>
            </div>
          )}

          {!isPending && !isBlocked && slide.ctaLabel && slide.ctaUrl && (
            <a
              href={slide.ctaUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ bottom: 'max(env(safe-area-inset-bottom), 32px)' }}
              className="btn btn-accent-bright btn-sm absolute left-1/2 -translate-x-1/2"
            >
              {slide.ctaLabel}
            </a>
          )}
        </div>

        {/* Floats directly over the media on a soft gradient, the same
            treatment the caption already gets at the bottom — this used
            to be its own solid-background row ahead of the media, which
            read as a hard black bar cutting the Story in two instead of
            the name/controls sitting over the photo the way every native
            Story viewer does it. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/65 via-black/20 to-transparent pb-8">
          <div className="pointer-events-auto flex gap-1 px-2 pt-safe">
            {story.slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); setSlideIndex(i); }}
                aria-label={`Go to slide ${i + 1}`}
                className="group flex h-4 flex-1 items-center"
              >
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover:h-[5px]">
                {i < slideIndex ? (
                  <div className="h-full w-full bg-white" />
                ) : i === slideIndex ? (
                  isVideo && !isPending && !isBlocked ? (
                    // Driven by the video's own timeupdate below, not a
                    // fixed-duration CSS animation — an image slide has no
                    // natural "done" signal of its own, a video already does.
                    <div className="h-full bg-white" style={{ width: `${videoProgress}%` }} />
                  ) : (
                    <div
                      key={`${storyIndex}-${slideIndex}`}
                      className="h-full bg-white"
                      style={{
                        width: '0%',
                        animationName: 'signal-story-progress',
                        animationDuration: `${SLIDE_DURATION_MS}ms`,
                        animationTimingFunction: 'linear',
                        animationFillMode: 'forwards',
                        animationPlayState: paused ? 'paused' : 'running',
                      }}
                      onAnimationEnd={goNextSlide}
                    />
                  )
                ) : null}
              </div>
              </button>
            ))}
          </div>

          <div className="pointer-events-auto flex h-14 items-center gap-2.5 px-4">
            <button onClick={openProfile} className="pressable flex min-w-0 items-center gap-2.5 text-left">
              <SharedAvatar id={`story-avatar-${initialStoryId}`} active={story.id === initialStoryId}>
                <SignalIdentityAvatar identity={identity} size={32} />
              </SharedAvatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-detail font-semibold text-white">{identity.name}</span>
                  <SignalIdentityBadge identity={identity} size={16} />
                  <span className="text-caption text-white/60">{new Date(story.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </div>
                {tripLabels.get(story.id) && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-semibold text-accent-bright">
                    <Icon name="key" size={10} /> On the Road · Verified trip · {tripLabels.get(story.id)}
                  </p>
                )}
                {story.title && <p className="truncate text-caption text-white/70">{story.title}</p>}
              </div>
            </button>
            <div className="ml-auto flex items-center gap-1">
              {/* Author-or-admin only, same rule fetch_empire_story_insights
                  enforces server-side — opens the aggregate-only Views/
                  Respects panel. There is deliberately no "who viewed"
                  entry point anywhere in this viewer for anyone. */}
              {canViewInsights && (
                <button
                  onClick={(e) => { e.stopPropagation(); setInsightsOpen(true); }}
                  aria-label="Story insights"
                  className="grid h-10 w-10 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Icon name="chart" size={17} />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  aria-label="Delete story"
                  className="grid h-10 w-10 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Icon name="trash" size={18} />
                </button>
              )}
              <button
                onClick={onClose}
                aria-label="Close"
                className="grid h-10 w-10 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Icon name="x" size={22} />
              </button>
            </div>
          </div>
        </div>

        {/* Story-level, not per-slide (one Respect per Story, matching
            empire_story_respects) — floats independent of the per-slide
            caption/CTA area so it stays put across slide navigation. No
            count shown here, same "no noisy statistics" call SIGNAL
            already makes for a Post's Respect button — the real number
            only ever shows up in the author's own Story Insights panel. */}
        {isRealStory && (
          <motion.button
            onClick={handleToggleRespect}
            disabled={respecting}
            aria-label={isRespected ? 'Remove Respect' : 'Respect this Story'}
            aria-pressed={isRespected}
            whileTap={reduceMotion ? undefined : { scale: 0.85 }}
            animate={isRespected && !reduceMotion ? { scale: [1, 1.25, 1] } : { scale: 1 }}
            transition={SPRING_SNAPPY}
            style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 16px) + 56px)' }}
            className={`absolute right-4 z-20 grid h-12 w-12 place-items-center rounded-full ring-1 backdrop-blur-md transition-colors ${isRespected ? 'bg-accent-bright text-noir ring-accent-bright' : 'bg-black/40 text-white ring-white/15 hover:bg-black/60'}`}
          >
            <Icon name="like" size={19} fill={isRespected} />
          </motion.button>
        )}
      </div>
      </StoryCanvas>

      {confirmDelete && (
        <div className="absolute inset-0 z-[320] flex items-end justify-center bg-black/55 sm:items-center" onClick={() => !deleting && setConfirmDelete(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-sm animate-fade-up rounded-t-3xl bg-surface p-5 sm:rounded-3xl"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center font-display text-lead font-semibold text-ink">{deleteConfirmMessage}</p>
            <div className="mt-5 grid gap-2">
              <button onClick={() => void runDelete()} disabled={deleting} className="btn min-h-12 justify-center rounded-full bg-danger text-white disabled:opacity-60">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="btn btn-secondary min-h-12 justify-center rounded-full">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {insightsOpen && <SignalStoryInsights storyId={story.id} onClose={() => setInsightsOpen(false)} />}
    </div>
  );
}
