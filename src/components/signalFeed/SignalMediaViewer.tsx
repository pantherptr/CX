import { useEffect, useRef, useState, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { mediaKindFromPath } from '../../lib/data/empireFeed';
import { SharedAvatar } from '../motionKit';

/** Horizontal travel that commits to the next/previous item. */
const SWIPE_NAV_PX = 60;
/** Downward travel that closes the viewer on release. */
const SWIPE_CLOSE_PX = 110;
const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 280;

/** A simple fullscreen image/video viewer — tap any post media to open it
 *  here. Same `fixed inset-0` full-viewport overlay pattern used
 *  elsewhere in this app for fullscreen moments (no portal needed, plain
 *  CSS escapes any parent's layout regardless of DOM nesting). A video
 *  slide is `key`ed by its own URL so navigating to the next/previous
 *  item fully remounts the element — the only way to guarantee the
 *  previous video actually stops rather than keeps playing off-screen.
 *
 *  Touch: swipe sideways between items, swipe down to dismiss (the media
 *  follows the finger and the backdrop fades with it, then the shared-
 *  element morph carries it home into the card). Keyboard: arrows and
 *  Escape. The page underneath can't scroll while it's open. */
export function SignalMediaViewer({
  images,
  startIndex,
  onClose,
  sharedKey = '',
  captions,
  footer,
}: {
  images: string[];
  startIndex: number;
  onClose: () => void;
  /** The post's id — keeps the shared-element id unique when two posts show the same photo. */
  sharedKey?: string;
  /** Optional title/caption per item (CX Visions) — shown under the media. */
  captions?: ({ title: string | null; caption: string | null; badge?: string | null } | null)[];
  /** Optional extra row under the caption (e.g. a link to the creator). */
  footer?: ReactNode | ((index: number) => ReactNode);
}) {
  const [index, setIndex] = useState(startIndex);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 });
  const [zooming, setZooming] = useState(false);
  const pinch = useRef<{ d0: number; s0: number } | null>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTap = useRef(0);
  const gesture = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const many = images.length > 1;
  const isVideo = mediaKindFromPath(images[index]) === 'video';
  // The shared-element morph (see PostImage's own matching comment) only
  // ever connects to the exact image that was tapped — navigating to a
  // different image in a multi-image post just stops sharing the id
  // (plain `<img>`, no morph), same scoped-down pattern Stories uses for
  // swiping past the originally-opened one.
  const sharedId = `post-media-${sharedKey ? `${sharedKey}-` : ''}${images[startIndex]}`;
  const showsInitialImage = index === startIndex && !isVideo;

  const step = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length);
  const resetZoom = () => setZoom({ s: 1, x: 0, y: 0 });
  const toggleZoom = () => setZoom((z) => (z.s > 1 ? { s: 1, x: 0, y: 0 } : { s: DOUBLE_TAP_ZOOM, x: 0, y: 0 }));
  useEffect(() => {
    resetZoom();
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      else if (e.key === 'ArrowRight' && many) setIndex((i) => (i + 1) % images.length);
      else if (e.key === 'ArrowLeft' && many) setIndex((i) => (i - 1 + images.length) % images.length);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [many, images.length]);

  const touchDistance = (e: ReactTouchEvent) =>
    Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);

  const onTouchStart = (e: ReactTouchEvent) => {
    if (!isVideo) {
      if (e.touches.length === 2) {
        pinch.current = { d0: touchDistance(e), s0: zoom.s };
        pan.current = null;
        gesture.current = null;
        setZooming(true);
        return;
      }
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        toggleZoom();
        return;
      }
      lastTap.current = now;
      if (zoom.s > 1) {
        pan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: zoom.x, ty: zoom.y };
        setZooming(true);
        return;
      }
    }
    gesture.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null };
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    if (pinch.current && e.touches.length === 2) {
      const s = Math.min(MAX_ZOOM, Math.max(1, pinch.current.s0 * (touchDistance(e) / pinch.current.d0)));
      setZoom((z) => ({ s, x: s <= 1 ? 0 : z.x, y: s <= 1 ? 0 : z.y }));
      return;
    }
    const start = pan.current;
    if (start) {
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      const limX = (window.innerWidth * (zoom.s - 1)) / 2;
      const limY = (window.innerHeight * (zoom.s - 1)) / 2;
      setZoom((z) => ({
        s: z.s,
        x: Math.max(-limX, Math.min(limX, start.tx + dx)),
        y: Math.max(-limY, Math.min(limY, start.ty + dy)),
      }));
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const dx = e.touches[0].clientX - g.x;
    const dy = e.touches[0].clientY - g.y;
    if (!g.axis && Math.hypot(dx, dy) > 8) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (!g.axis) return;
    setDragging(true);
    // A single item still gives a little under a sideways pull — resists
    // rather than going dead, so the gesture never feels ignored.
    setDrag(g.axis === 'x' ? { x: many ? dx : dx / 4, y: 0 } : { x: 0, y: Math.max(0, dy) });
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    if (pinch.current || pan.current) {
      if (e.touches.length === 0) {
        pinch.current = null;
        pan.current = null;
        setZooming(false);
        setZoom((z) => (z.s < 1.05 ? { s: 1, x: 0, y: 0 } : z));
      }
      return;
    }
    const axis = gesture.current?.axis;
    gesture.current = null;
    if (!dragging) return;
    setDragging(false);
    if (axis === 'y' && drag.y > SWIPE_CLOSE_PX) {
      onCloseRef.current();
      return;
    }
    if (axis === 'x' && many && Math.abs(drag.x) > SWIPE_NAV_PX) step(drag.x < 0 ? 1 : -1);
    setDrag({ x: 0, y: 0 });
  };

  const closeProgress = Math.min(1, drag.y / 300);

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col animate-fade-in"
      style={{
        backgroundColor: `rgba(0,0,0,${0.95 * (1 - closeProgress * 0.7)})`,
        transition: dragging ? 'none' : 'background-color 200ms ease',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] shrink-0 items-center justify-between px-4 pt-safe transition-opacity duration-200"
        style={{ opacity: drag.y > 0 ? 0 : 1 }}
      >
        <span className="text-detail font-medium tabular-nums text-white/70">
          {many ? `${index + 1} / ${images.length}` : ''}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-11 w-11 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Icon name="x" size={22} />
        </button>
      </div>

      <div
        className="relative flex flex-1 touch-none items-center justify-center overflow-hidden px-4 pb-safe"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          key={index}
          className="flex h-full w-full items-center justify-center animate-fade-in"
          style={{
            transform: `translate(${drag.x}px, ${drag.y}px) scale(${1 - closeProgress * 0.15})`,
            transition: dragging ? 'none' : 'transform 240ms var(--ease-out-expo)',
          }}
        >
          {isVideo ? (
            <video key={images[index]} src={images[index]} controls autoPlay playsInline className="max-h-full max-w-full object-contain" />
          ) : (
            <SharedAvatar id={sharedId} active={showsInitialImage}>
              <div
                onDoubleClick={toggleZoom}
                style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`, transition: zooming ? 'none' : 'transform 220ms var(--ease-out-expo)', cursor: zoom.s > 1 ? 'zoom-out' : 'zoom-in' }}
              >
              <Img
                src={images[index]}
                alt=""
                className="max-h-full max-w-full select-none object-contain"
                fallback={
                  <div className="flex flex-col items-center gap-2 text-white/60">
                    <Icon name="image" size={32} />
                    <span className="text-detail">Image unavailable</span>
                  </div>
                }
              />
              </div>
            </SharedAvatar>
          )}
        </div>

        {many && (
          <>
            <button
              onClick={() => step(-1)}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 sm:left-4"
            >
              <Icon name="chevronLeft" size={22} />
            </button>
            <button
              onClick={() => step(1)}
              aria-label="Next image"
              className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 sm:right-4"
            >
              <Icon name="chevronRight" size={22} />
            </button>
          </>
        )}
      </div>

      {captions?.[index] && (captions[index]!.title || captions[index]!.caption || captions[index]!.badge) && (
        <div className="mx-auto w-full max-w-xl shrink-0 px-5 pb-2 pt-3 text-center text-white transition-opacity duration-200" style={{ opacity: drag.y > 0 ? 0 : 1 }}>
          {captions[index]!.title && <p translate="no" className="font-display text-[17px] font-semibold leading-snug">{captions[index]!.title}</p>}
          {captions[index]!.caption && <p translate="no" className="mt-1 text-detail leading-relaxed text-white/70">{captions[index]!.caption}</p>}
          {captions[index]!.badge && <p className="mt-2 text-micro font-semibold uppercase tracking-[0.2em] text-accent-bright">{captions[index]!.badge}</p>}
        </div>
      )}

      {footer && <div className="flex shrink-0 justify-center px-5 pb-3 pt-1">{typeof footer === 'function' ? footer(index) : footer}</div>}

      {many && images.length <= 12 && (
        <div className="flex shrink-0 justify-center gap-1.5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2" aria-hidden="true">
          {images.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full bg-white transition-all duration-200"
              style={{ width: i === index ? 16 : 6, opacity: i === index ? 1 : 0.4 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
