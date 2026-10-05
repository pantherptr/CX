import { useCallback, useEffect, useLayoutEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { Img } from './motion';
import { unsplash, unsplashSrcSet } from '../lib/img';

const tileFallback = (size: number) => (
  <span className="grid h-full w-full place-items-center bg-panel text-muted">
    <Icon name="car" size={size} />
  </span>
);

/* ------------------------------ Inline gallery ------------------------------
 * Phone: every photo in a full-bleed swipe carousel — native scroll-snap,
 * so it carries the platform's own momentum and rubber-banding — with a
 * live counter, instead of one static cover photo with no hint that more
 * exist. Wider screens: a grid that adapts to how many photos the listing
 * actually has. The old fixed 5-slot grid assumed five, and real host
 * listings often have one to three, which left empty holes in it. */
export function CarGallery({ images, alt, onOpen }: { images: string[]; alt: string; onOpen: (index: number) => void }) {
  if (images.length === 0) {
    return <div className="mt-6 aspect-[4/3] overflow-hidden rounded-2xl sm:aspect-auto sm:h-[460px]">{tileFallback(36)}</div>;
  }
  return (
    <>
      <MobileCarousel images={images} alt={alt} onOpen={onOpen} />
      <DesktopGrid images={images} alt={alt} onOpen={onOpen} />
    </>
  );
}

function MobileCarousel({ images, alt, onOpen }: { images: string[]; alt: string; onOpen: (index: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="relative -mx-5 mt-5 sm:hidden">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {images.map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`Open photo ${i + 1} of ${images.length}`}
            className="relative aspect-[4/3] w-full shrink-0 snap-center snap-always overflow-hidden bg-panel-2"
          >
            <Img
              src={unsplash(img, 900)}
              srcSet={unsplashSrcSet(img, [480, 800, 1200])}
              sizes="100vw"
              alt={i === 0 ? alt : ''}
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : undefined}
              className="h-full w-full object-cover"
              fallback={tileFallback(32)}
            />
          </button>
        ))}
      </div>
      {images.length > 1 && (
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-ink/65 px-2.5 py-1 text-caption font-medium tabular-nums text-white backdrop-blur-sm">
          {index + 1} / {images.length}
        </span>
      )}
    </div>
  );
}

const GRID_LAYOUT: Record<number, { grid: string; tiles: string[] }> = {
  1: { grid: 'grid-cols-1', tiles: [''] },
  2: { grid: 'grid-cols-2', tiles: ['', ''] },
  3: { grid: 'grid-cols-4 grid-rows-2', tiles: ['col-span-2 row-span-2', 'col-span-2', 'col-span-2'] },
  4: { grid: 'grid-cols-4 grid-rows-2', tiles: ['col-span-2 row-span-2', 'col-span-2', '', ''] },
  5: { grid: 'grid-cols-4 grid-rows-2', tiles: ['col-span-2 row-span-2', '', '', '', ''] },
};

function DesktopGrid({ images, alt, onOpen }: { images: string[]; alt: string; onOpen: (index: number) => void }) {
  const shown = images.slice(0, 5);
  const layout = GRID_LAYOUT[shown.length];
  return (
    <div className={`mt-6 hidden h-[460px] gap-2 overflow-hidden rounded-2xl sm:grid ${layout.grid}`}>
      {shown.map((img, i) => {
        const isMain = i === 0;
        const isLast = i === shown.length - 1;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`Open photo ${i + 1} of ${images.length}`}
            className={`group relative min-h-0 overflow-hidden bg-panel-2 ${layout.tiles[i]}`}
          >
            <Img
              src={unsplash(img, isMain ? 1200 : 700)}
              srcSet={unsplashSrcSet(img, isMain ? [800, 1200, 1600] : [400, 700, 1000])}
              sizes={isMain ? '(min-width: 1280px) 640px, 50vw' : '(min-width: 1280px) 320px, 25vw'}
              alt={isMain ? alt : ''}
              loading={isMain ? 'eager' : 'lazy'}
              fetchPriority={isMain ? 'high' : undefined}
              className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
              fallback={tileFallback(isMain ? 36 : 24)}
            />
            <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" />
            {isLast && images.length > 1 && (
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-detail font-medium text-ink shadow-hair backdrop-blur">
                <Icon name="grid" size={14} /> Show all {images.length}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- Photo viewer -------------------------------
 * Full-screen, black, edge-to-edge — the photo is the whole screen, not a
 * box inside a white dialog. Swipe between photos (native scroll-snap),
 * arrow keys / on-screen arrows on desktop, and swipe *down* to close,
 * the same gesture as the phone's own photo app. Portaled to <body> so no
 * ancestor's transform or `will-change` can ever trap it inside a card. */
export function PhotoViewer({
  images,
  index,
  alt,
  onClose,
}: {
  images: string[];
  index: number | null;
  alt: string;
  onClose: () => void;
}) {
  if (index === null || images.length === 0) return null;
  return createPortal(<ViewerInner images={images} startIndex={index} alt={alt} onClose={onClose} />, document.body);
}

const SWIPE_CLOSE_PX = 110;

function ViewerInner({
  images,
  startIndex,
  alt,
  onClose,
}: {
  images: string[];
  startIndex: number;
  alt: string;
  onClose: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [current, setCurrent] = useState(Math.min(startIndex, images.length - 1));
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => onCloseRef.current(), 180);
  }, []);

  const go = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) return;
      const target = Math.max(0, Math.min(images.length - 1, i));
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left: target * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    },
    [images.length],
  );

  // Land on the tapped photo before first paint — no visible scroll from 1.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = startIndex * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(current + 1);
      else if (e.key === 'ArrowLeft') go(current - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, go, current]);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    setCurrent(Math.round(el.scrollLeft / el.clientWidth));
  };

  // Vertical drag only — horizontal stays with the track's native scroll
  // (`touch-pan-x` below hands vertical gestures to us instead).
  const onTouchStart = (e: ReactTouchEvent) => {
    gesture.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null };
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.touches[0].clientX - g.x;
    const dy = e.touches[0].clientY - g.y;
    if (!g.axis && Math.hypot(dx, dy) > 8) g.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    if (g.axis !== 'y') return;
    setDragging(true);
    setDragY(Math.max(0, dy));
  };
  const onTouchEnd = () => {
    gesture.current = null;
    if (!dragging) return;
    setDragging(false);
    if (dragY > SWIPE_CLOSE_PX) close();
    else setDragY(0);
  };

  const dragProgress = Math.min(1, dragY / 300);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — photo ${current + 1} of ${images.length}`}
      data-surface="noir"
      className="fixed inset-0 z-[95] flex flex-col bg-black animate-fade-in"
      style={{
        backgroundColor: `rgba(0,0,0,${closing ? 0 : 1 - dragProgress * 0.7})`,
        transition: dragging ? 'none' : 'background-color 200ms ease',
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-200"
        style={{ opacity: dragging || closing ? 0 : 1 }}
      >
        <span className="pl-2 text-detail font-medium tabular-nums text-white/85">
          {current + 1} / {images.length}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label="Close photos"
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full text-white transition-colors hover:bg-white/15"
        >
          <Icon name="x" size={22} />
        </button>
      </div>

      <div
        ref={trackRef}
        onScroll={onScroll}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="no-scrollbar flex min-h-0 flex-1 touch-pan-x snap-x snap-mandatory overflow-x-auto overscroll-contain"
        style={{
          transform: closing ? 'translateY(8%) scale(0.94)' : `translateY(${dragY}px) scale(${1 - dragProgress * 0.15})`,
          opacity: closing ? 0 : undefined,
          transition: dragging ? 'none' : 'transform 220ms var(--ease-out-expo), opacity 180ms ease',
        }}
      >
        {images.map((img, i) => (
          <div key={i} className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center">
            <Img
              src={unsplash(img, 1600)}
              srcSet={unsplashSrcSet(img, [800, 1200, 1600, 2200])}
              sizes="100vw"
              alt={i === current ? `${alt} — photo ${i + 1}` : ''}
              loading={Math.abs(i - startIndex) <= 1 ? 'eager' : 'lazy'}
              className="max-h-full max-w-full select-none object-contain animate-scale-in"
              fallback={
                <span className="grid h-full w-full place-items-center text-white/40">
                  <Icon name="car" size={44} />
                </span>
              }
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(current - 1)}
            disabled={current === 0}
            aria-label="Previous photo"
            className="absolute left-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-white backdrop-blur transition hover:bg-white/25 disabled:pointer-events-none disabled:opacity-0 can-hover:grid"
          >
            <Icon name="chevronLeft" size={24} />
          </button>
          <button
            type="button"
            onClick={() => go(current + 1)}
            disabled={current === images.length - 1}
            aria-label="Next photo"
            className="absolute right-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-white backdrop-blur transition hover:bg-white/25 disabled:pointer-events-none disabled:opacity-0 can-hover:grid"
          >
            <Icon name="chevronRight" size={24} />
          </button>

          {/* Auto margins on the first/last thumb, not `justify-center`:
              a centered flex row that overflows clips its leading items
              out of scroll reach; auto margins center it when it fits and
              degrade to a plain scrollable row when it doesn't. */}
          <div
            className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 no-scrollbar transition-opacity duration-200 [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto"
            style={{ opacity: dragging || closing ? 0 : 1 }}
          >
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`Photo ${i + 1}`}
                aria-current={i === current}
                className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg ring-2 transition sm:h-14 sm:w-20 ${
                  i === current ? 'opacity-100 ring-white' : 'opacity-45 ring-transparent hover:opacity-80'
                }`}
              >
                <Img
                  src={unsplash(img, 200)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                  fallback={<span className="grid h-full w-full place-items-center bg-white/10 text-white/40"><Icon name="car" size={14} /></span>}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
