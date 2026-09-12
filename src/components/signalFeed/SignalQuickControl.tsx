import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { CxsLogo } from '../CxsLogo';

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
 *  fixed panel from the tab (`scale`+`opacity`, ~220ms, the same
 *  `--ease-out-expo` easing already used for the Navbar drawer — reusing
 *  the app's one "premium" easing rather than inventing a new one);
 *  collapsing reverses it with no bounce. The panel is always mounted
 *  (visibility/opacity toggled, not conditionally rendered) specifically
 *  so the collapse direction gets a real transition too, not just the
 *  open one. */
export function SignalQuickControl({ items }: { items: QuickControlItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const select = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={rootRef} className="fixed left-0 top-1/2 z-40 -translate-y-1/2">
      {open && <div className="fixed inset-0 z-0" onClick={() => setOpen(false)} />}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Signal quick menu' : 'Open Signal quick menu'}
        aria-expanded={open}
        className="pressable relative z-10 flex h-14 w-7 items-center justify-center overflow-hidden rounded-r-xl border border-l-0 border-line bg-surface/85 shadow-hair backdrop-blur-md transition-colors hover:bg-surface"
      >
        <span className="absolute inset-y-0 left-0 w-[2px] bg-accent-bright" />
        <CxsLogo size={open ? 16 : 13} className="transition-[width,height] duration-200" />
      </button>

      <div
        role="menu"
        className={`absolute left-0 top-1/2 z-10 w-44 origin-left -translate-y-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop transition-[transform,opacity] duration-[220ms] ${
          open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'
        }`}
        style={{ marginLeft: '2rem', transitionTimingFunction: open ? 'var(--ease-out-expo, ease-out)' : 'ease-in' }}
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
      </div>
    </div>
  );
}
