import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { CxsLogo } from '../CxsLogo';
import { motion, AnimatePresence, useReducedMotion, SPRING_SNAPPY } from '../motionKit';

/** This edge tab is a real but non-obvious affordance — worth one quiet
 *  hint, not a nag. A soft ring pulses around it for a few seconds the
 *  first time SIGNAL ever loads in this browser, then never again
 *  (tracked in localStorage, same durability as other one-time UI
 *  flags in this app). Skipped entirely under reduced motion. */
const SEEN_KEY = 'cx-signal-quickcontrol-seen';

interface QuickControlItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  /** Highlights this row as "where you are" — used for Official/Community
   *  so switching spaces never leaves you guessing which one you're in. */
  active?: boolean;
  /** Draws a thin divider below this row — used once, after
   *  Official/Community, to visually group the two space-switchers apart
   *  from the personal shortcuts (My Profile/My Posts/Saved/Explore). */
  groupEnd?: boolean;
}

/** SIGNAL's own tiny navigation affordance — deliberately NOT a sidebar,
 *  drawer, or hamburger menu (the brief was explicit: those all read as
 *  "generic app menu", this should read as a signature SIGNAL detail).
 *  Closed, it's a barely-there rounded tab pinned to the left edge at
 *  mid-height — a different screen region entirely from Stories (top of
 *  the feed), the bottom nav (`z-50`, full-width, bottom), and any post's
 *  action row/video controls, so it can never overlap them by
 *  construction rather than by z-index luck. Tapping it grows a small
 *  panel from the tab on the same spring (`SPRING_SNAPPY`) the app's
 *  other sheets/drawers already use — real `AnimatePresence` exit, not a
 *  hand-rolled CSS transition with `pointer-events` doing the hiding. A
 *  quiet one-time ring (see `SEEN_KEY` above) hints at the tab's
 *  existence on someone's very first SIGNAL visit, since an edge tab
 *  with no label is easy to miss entirely otherwise. */
export function SignalQuickControl({ items }: { items: QuickControlItem[] }) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = !!useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (reduceMotion) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    const showTimer = window.setTimeout(() => setHint(true), 600);
    const hideTimer = window.setTimeout(() => {
      setHint(false);
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* private browsing etc. — worst case the hint just replays next visit */
      }
    }, 4000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const dismissHint = () => {
    setHint(false);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div ref={rootRef} className="fixed left-0 top-1/2 z-40 -translate-y-1/2">
      {open && <div className="fixed inset-0 z-0" onClick={() => setOpen(false)} />}

      {hint && !open && (
        <span className="pointer-events-none absolute left-0 top-1/2 h-16 w-8 -translate-y-1/2 animate-quick-control-pulse rounded-r-2xl ring-2 ring-accent-bright/60" />
      )}

      <button
        onClick={() => {
          dismissHint();
          setOpen((v) => !v);
        }}
        aria-label={open ? 'Close Signal quick menu' : 'Open Signal quick menu'}
        aria-expanded={open}
        className="pressable relative z-10 flex h-16 w-8 items-center justify-center overflow-hidden rounded-r-2xl border border-l-0 border-line bg-surface/90 shadow-[0_8px_22px_-8px_rgba(0,0,0,0.35),0_0_16px_-4px_rgba(0,212,71,0.45)] backdrop-blur-md transition-colors hover:bg-surface"
      >
        <span className="absolute inset-y-0 left-0 w-[3px] bg-accent-bright" />
        <CxsLogo size={open ? 19 : 16} className="transition-[width,height] duration-200" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            className="absolute left-0 top-1/2 z-10 w-44 origin-left overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
            style={{ marginLeft: '2rem' }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: '-50%' }}
            animate={{ opacity: 1, scale: 1, y: '-50%' }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.9, y: '-50%' }}
            transition={reduceMotion ? { duration: 0 } : SPRING_SNAPPY}
          >
            <p className="px-4 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Signal</p>
            {items.map((item) => (
              <div key={item.label}>
                <button
                  role="menuitem"
                  onClick={() => select(item.onSelect)}
                  className={`pressable flex w-full items-center gap-2.5 px-4 py-3 text-left text-detail font-medium transition-colors ${
                    item.active ? 'bg-accent-050 text-accent-700' : 'text-ink hover:bg-panel'
                  }`}
                >
                  <Icon name={item.icon} size={17} className={item.active ? 'text-accent-700' : 'text-ink-soft'} />
                  {item.label}
                </button>
                {item.groupEnd && <div className="mx-4 border-t border-line" />}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
