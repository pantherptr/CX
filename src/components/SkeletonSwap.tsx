import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from './motionKit';

/**
 * Loading → content without a jump (after 21st.dev "Skeleton Swap").
 * - the skeleton only appears if loading lasts longer than `delay` (a fast load never flashes it);
 * - once shown it stays at least `minVisible` ms (no flicker);
 * - skeleton and content share one grid cell, so the block takes the taller of the two and nothing shifts;
 * - the content cross-fades in (a little blur + scale) while the skeleton fades out.
 * Content is only mounted when `ready`, so "empty" states never flash under the skeleton.
 */
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

export function useSkeletonSwap({ ready, delay = 120, minVisible = 380 }: { ready: boolean; delay?: number; minVisible?: number }) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (!ready) {
      if (visible) return;
      const id = window.setTimeout(() => {
        shownAt.current = performance.now();
        setVisible(true);
      }, delay);
      return () => window.clearTimeout(id);
    }
    if (!visible) return;
    const rest = Math.max(0, minVisible - (performance.now() - shownAt.current));
    const id = window.setTimeout(() => setVisible(false), rest);
    return () => window.clearTimeout(id);
  }, [ready, visible, delay, minVisible]);

  return { showSkeleton: visible };
}

export function SkeletonSwap({
  ready,
  skeleton,
  children,
  delay,
  minVisible,
  label,
  className = '',
}: {
  ready: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  delay?: number;
  minVisible?: number;
  /** read out to screen readers when loading finishes */
  label?: string;
  className?: string;
}) {
  const { showSkeleton } = useSkeletonSwap({ ready, delay, minVisible });
  const reduced = useReducedMotion();

  return (
    <div aria-busy={!ready} className={`grid min-w-0 ${className}`}>
      {ready && (
        <motion.div
          className="col-start-1 row-start-1 min-w-0"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.99, filter: 'blur(4px)' }}
          animate={
            reduced
              ? { opacity: showSkeleton ? 0 : 1 }
              : { opacity: showSkeleton ? 0 : 1, scale: showSkeleton ? 0.99 : 1, filter: showSkeleton ? 'blur(4px)' : 'blur(0px)' }
          }
          transition={reduced ? { duration: 0 } : CROSSFADE}
          style={{ transformOrigin: 'top left', pointerEvents: showSkeleton ? 'none' : undefined }}
        >
          {children}
        </motion.div>
      )}
      <AnimatePresence initial={false}>
        {showSkeleton && (
          <motion.div
            key="skeleton"
            aria-hidden
            className="pointer-events-none col-start-1 row-start-1 w-full min-w-0 self-start"
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(3px)' }}
            transition={reduced ? { duration: 0 } : CROSSFADE}
          >
            {skeleton}
          </motion.div>
        )}
      </AnimatePresence>
      {label && <span role="status" className="sr-only">{ready ? label : ''}</span>}
    </div>
  );
}

export default SkeletonSwap;
