import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { markEmpireStoryViewed, deleteEmpireStory, type EmpireStory } from '../../lib/data/empireStories';
import { resolveSignalIdentity } from '../../lib/data/signalIdentity';
import { SignalIdentityAvatar, SignalIdentityBadge } from './SignalIdentityBadge';

const SLIDE_DURATION_MS = 5000;
const HOLD_DELAY_MS = 180;
const SWIPE_THRESHOLD_PX = 60;

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
  const [storyIndex, setStoryIndex] = useState(startIndex);
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const viewedRef = useRef<Set<string>>(new Set());
  const holdTimerRef = useRef<number | null>(null);
  const heldRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);

  const story = stories[storyIndex];
  const slide = story?.slides[slideIndex];

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

  const identity = resolveSignalIdentity(story.publisherType, story.authorName, story.authorAvatarUrl);

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
    startHold();
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    endHold();
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
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
    <div className="fixed inset-0 z-[300] flex flex-col bg-black animate-fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-x-0 top-0 z-10 flex gap-1 px-2 pt-safe">
        {story.slides.map((s, i) => (
          <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            {i < slideIndex ? (
              <div className="h-full w-full bg-white" />
            ) : i === slideIndex ? (
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
            ) : null}
          </div>
        ))}
      </div>

      <div className="relative z-10 flex h-14 items-center gap-2.5 px-4 pt-safe">
        <SignalIdentityAvatar identity={identity} size={32} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-detail font-semibold text-white">{identity.name}</span>
            <SignalIdentityBadge identity={identity} size={13} />
            <span className="text-caption text-white/60">{new Date(story.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          </div>
          {story.title && <p className="truncate text-caption text-white/70">{story.title}</p>}
        </div>
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
        onTouchEnd={handleTouchEnd}
      >
        <img key={slide.id} src={slide.mediaUrl} alt="" className="max-h-full max-w-full animate-fade-in object-contain" />

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
