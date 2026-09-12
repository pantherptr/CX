import { useState } from 'react';
import { Icon } from '../Icon';

/** A simple fullscreen image viewer — tap any post image to open it here.
 *  Same `fixed inset-0` full-viewport overlay pattern used elsewhere in
 *  this app for fullscreen moments (no portal needed, plain CSS escapes
 *  any parent's layout regardless of DOM nesting). */
export function SignalMediaViewer({
  images,
  startIndex,
  onClose,
}: {
  images: string[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black/95 animate-fade-in" role="dialog" aria-modal="true">
      <div className="flex h-14 shrink-0 items-center justify-between px-4 pt-safe">
        <span className="text-detail font-medium text-white/70">
          {images.length > 1 ? `${index + 1} / ${images.length}` : ''}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-10 w-10 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Icon name="x" size={22} />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-safe">
        <img src={images[index]} alt="" className="max-h-full max-w-full object-contain" />

        {images.length > 1 && (
          <>
            <button
              onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 sm:left-4"
            >
              <Icon name="chevronLeft" size={22} />
            </button>
            <button
              onClick={() => setIndex((i) => (i + 1) % images.length)}
              aria-label="Next image"
              className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 sm:right-4"
            >
              <Icon name="chevronRight" size={22} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
