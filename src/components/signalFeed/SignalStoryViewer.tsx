import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { markEmpireStoryViewed, deleteEmpireStory, type EmpireStory } from '../../lib/data/empireStories';
import { resolveSignalIdentity } from '../../lib/data/signalIdentity';
import { SignalIdentityAvatar, SignalIdentityBadge } from './SignalIdentityBadge';
import { StoryTextSlide } from './StoryTextSlide';

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
   *  permanent Highlights, which have no per-viewer "viewed" state. */
  onMarkViewed?: (id: string) => void | Promise<void>;
  /** Overridable so Highlights delete through their own RPC instead of
   *  the Story-specific one. */
  onDeleteStory?: (id: string) => Promise<{ error: string | null }>;
  deleteConfirmMessage?: string;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [storyIndex, setStoryIndex] = useState(startIndex);
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
  const viewedRef = useRef<Set<string>>(new Set());
  const holdTimerRef = useRef<number | null>(null);
  const heldRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const draggingVerticalRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const story = stories[storyIndex];
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

  useEffect(() => {
    if (story && !viewedRef.current.has(story.id)) {
      viewedRef.current.add(story.id);
      onMarkViewed(story.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story]);

  useEffect(() => {
    setSlideIndex(0);
  }, [storyIndex]);

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

  if (!story || !slide) return null;

  const identity = resolveSignalIdentity(story.publisherType, story.authorName, story.authorAvatarUrl, story.authorIsHost, story.authorIsVerifiedClient);
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
    onClose();
    navigate(profileHref);
  };

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

  const handleDelete = async () => {
    if (!window.confirm(deleteConfirmMessage)) return;
    setDeleting(true);
    const { error } = await onDeleteStory(story.id);
    setDeleting(false);
    if (!error) {
      onStoryDeleted();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-black animate-fade-in"
      role="dialog"
      aria-modal="true"
      style={{
        transform: `translateY(${closing ? '100%' : `${dragY}px`})`,
        opacity: closing ? 0 : dragY > 0 ? Math.max(0.4, 1 - dragY / 400) : 1,
        transition: dragY === 0 || closing ? 'transform 220ms ease-out, opacity 220ms ease-out' : 'none',
      }}
    >
      <div className="absolute inset-x-0 top-0 z-10 flex gap-1 px-2 pt-safe">
        {story.slides.map((s, i) => (
          <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            {i < slideIndex ? (
              <div className="h-full w-full bg-white" />
            ) : i === slideIndex ? (
              isVideo ? (
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
        ))}
      </div>

      <div className="relative z-10 flex h-14 items-center gap-2.5 px-4 pt-safe">
        <button onClick={openProfile} className="pressable flex min-w-0 items-center gap-2.5 text-left">
          <SignalIdentityAvatar identity={identity} size={32} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-detail font-semibold text-white">{identity.name}</span>
              <SignalIdentityBadge identity={identity} size={13} />
              <span className="text-caption text-white/60">{new Date(story.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            </div>
            {story.title && <p className="truncate text-caption text-white/70">{story.title}</p>}
          </div>
        </button>
        <div className="ml-auto flex items-center gap-1">
          {canManage && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete story"
              className="grid h-9 w-9 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Icon name="trash" size={18} />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" size={22} />
          </button>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onMouseDown={startHold}
        onMouseUp={endHold}
        onMouseLeave={endHold}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isVideo ? (
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
            className="max-h-full max-w-full animate-fade-in object-contain"
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
          <img key={slide.id} src={slide.mediaUrl} alt="" className="max-h-full max-w-full animate-fade-in object-contain" />
        )}

        {isVideo && (
          <button
            onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="absolute bottom-4 right-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <Icon name={muted ? 'volumeOff' : 'volume'} size={17} />
          </button>
        )}

        <button onClick={() => handleZoneClick('prev')} aria-label="Previous" className="absolute inset-y-0 left-0 w-1/3" />
        <button onClick={() => handleZoneClick('next')} aria-label="Next" className="absolute inset-y-0 right-0 w-1/3" />

        {slide.caption && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-8 pt-16">
            <p className="text-body leading-relaxed text-white">{slide.caption}</p>
          </div>
        )}

        {slide.ctaLabel && slide.ctaUrl && (
          <a
            href={slide.ctaUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="btn btn-accent-bright btn-sm absolute bottom-8 left-1/2 -translate-x-1/2"
          >
            {slide.ctaLabel}
          </a>
        )}
      </div>
    </div>
  );
}
