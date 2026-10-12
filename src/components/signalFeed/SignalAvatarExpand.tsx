import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Img } from '../motion';
import { Icon } from '../Icon';
import { haptics } from '../../lib/native';

/* Adapted from 21st.dev "Telegram Profile Header" (serafimcloud): the round photo is the same element as
 * the full-width one — tapping it makes the circle grow into the whole photo (shared layout animation),
 * with the name over it; tapping again shrinks it back. */

const SPRING = { duration: 0.42, type: 'spring', bounce: 0.2 } as const;

/** The profile photo as a tappable circle that expands to a full-width photo. */
export function SignalAvatarExpand({
  src,
  name,
  username,
  size = 'h-[5.5rem] w-[5.5rem] sm:h-28 sm:w-28',
  fallback,
}: {
  src: string;
  name: string;
  username?: string | null;
  size?: string;
  fallback?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const layoutId = `profile-photo-${src}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const toggle = () => {
    haptics.tick();
    setOpen((o) => !o);
  };

  return (
    <MotionConfig transition={SPRING} reducedMotion="user">
      {/* the circle (hidden while its photo is the big one, so the shared element has one home) */}
      <span className={`relative inline-block rounded-full bg-bg p-1 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.5)]`}>
        {!open ? (
          <motion.button
            type="button"
            layoutId={layoutId}
            onClick={toggle}
            aria-label={`${name} — view photo`}
            className={`relative block overflow-hidden ${size}`}
            style={{ borderRadius: 9999 }}
          >
            <Img src={src} alt="" className="pointer-events-none h-full w-full object-cover" fallback={fallback} />
          </motion.button>
        ) : (
          <span className={`block ${size}`} />
        )}
      </span>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="backdrop"
                className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={toggle}
                role="dialog"
                aria-modal="true"
                aria-label={name}
              >
                <motion.button
                  type="button"
                  layoutId={layoutId}
                  onClick={(e) => { e.stopPropagation(); toggle(); }}
                  className="relative block aspect-square w-full max-w-md overflow-hidden"
                  style={{ borderRadius: 0 }}
                  aria-label="Close photo"
                >
                  <Img src={src} alt={name} className="pointer-events-none h-full w-full object-cover" />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/60 to-transparent" />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-left text-white">
                    <span className="block font-display text-xl font-medium leading-tight">{name}</span>
                    {username && <span className="block text-xs text-white/75">@{username}</span>}
                  </span>
                </motion.button>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label="Close"
                  className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md"
                >
                  <Icon name="x" size={20} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </MotionConfig>
  );
}
