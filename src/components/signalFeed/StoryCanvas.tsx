import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const STORY_RATIO = 9 / 16;

/** The one place SIGNAL's Story aspect ratio is enforced — the camera,
 *  the editor, and the viewer all render their full layout (header,
 *  media, footer — not just the media) inside this same box, so a
 *  composition made in the camera looks pixel-identical in the
 *  published Story. A `max-height`-constrained `aspect-ratio` box
 *  doesn't reliably reflow its cross axis across browsers, so this
 *  measures the outer container with a `ResizeObserver` and sets exact
 *  pixel dimensions instead — letterboxed within whatever space is
 *  available, on a phone screen or a wide desktop viewport alike,
 *  without ever stretching. `boxStyle` merges after the computed size so
 *  a caller (the viewer's pull-to-close drag) can still animate
 *  transform/opacity on the same element. */
export function StoryCanvas({
  children,
  className = '',
  boxClassName = '',
  boxStyle,
}: {
  children: ReactNode;
  className?: string;
  boxClassName?: string;
  boxStyle?: CSSProperties;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      let width = cw;
      let height = width / STORY_RATIO;
      if (height > ch) {
        height = ch;
        width = height * STORY_RATIO;
      }
      setSize({ width: Math.round(width), height: Math.round(height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className={`relative flex h-full w-full items-center justify-center ${className}`}>
      <div
        className={`relative flex flex-col overflow-hidden bg-noir ${boxClassName}`}
        style={{
          ...(size
            ? { width: size.width, height: size.height }
            : { aspectRatio: '9 / 16', width: '100%', maxHeight: '100%' }),
          ...boxStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
