import * as React from 'react';
import { flushSync } from 'react-dom';
import { setTheme as setGlobalTheme, useTheme } from '../../lib/theme';

type Theme = 'light' | 'dark';
type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
    skipTransition: () => void;
  };
};

export interface CircularThemeRevealProps {
  initialTheme?: Theme;
  /** Reveal duration in ms. */
  duration?: number;
  /** localStorage key to remember the choice. */
  storageKey?: string;
  onThemeChange?: (theme: Theme) => void;
  /** Where the switch sits. */
  togglePosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  /** Accessible label of the switch. */
  label?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * A light / dark switch whose change spreads in a circle from the centre (to light) or closes in
 * from the edges (to dark), with the site's own colour tokens re-pointed inside this surface only.
 * Based on Gravlens' "circular theme reveal"; falls back to an instant change where the View
 * Transitions API is missing or motion is reduced.
 */
export function CircularThemeReveal({
  initialTheme = 'light',
  duration = 780,
  onThemeChange,
  togglePosition = 'top-right',
  label = 'Dark mode',
  children,
  className = '',
}: CircularThemeRevealProps) {
  const theme = useTheme();
  void initialTheme;
  const [busy, setBusy] = React.useState(false);
  const locked = React.useRef(false);
  const root = React.useRef<HTMLDivElement>(null);
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const transitionName = `circular-theme-${id}`;

  async function toggle() {
    if (locked.current || !root.current) return;
    locked.current = true;
    setBusy(true);
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      flushSync(() => setGlobalTheme(next));
      onThemeChange?.(next);
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doc = document as TransitionDocument;
    const bounds = root.current.getBoundingClientRect();
    const radius = Math.hypot(bounds.width / 2, bounds.height / 2);
    const zero = 'circle(0px at 50% 50%)';
    const full = `circle(${radius}px at 50% 50%)`;
    const ms = Number.isFinite(duration) ? Math.max(0, duration) : 780;
    try {
      if (doc.startViewTransition && !reduced) {
        const transition = doc.startViewTransition(commit);
        let wave: Animation | undefined;
        const watchdog = window.setTimeout(() => transition.skipTransition(), ms + 1500);
        try {
          await transition.ready;
          wave = document.documentElement.animate(
            { clipPath: next === 'light' ? [zero, full] : [full, zero] },
            {
              duration: ms,
              easing: 'cubic-bezier(0.4,0,0.2,1)',
              fill: 'none',
              pseudoElement: `::view-transition-${next === 'light' ? 'new' : 'old'}(${transitionName})`,
            },
          );
          await wave.finished;
        } catch {
          /* a failed snapshot still ends with the committed theme */
        } finally {
          transition.skipTransition();
          wave?.cancel();
          window.clearTimeout(watchdog);
        }
        await transition.finished.catch(() => {});
      } else {
        commit();
      }
    } catch {
      commit();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const corner =
    togglePosition === 'top-left' ? 'left:16px;top:calc(16px + env(safe-area-inset-top,0px))'
    : togglePosition === 'bottom-right' ? 'right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px))'
    : togglePosition === 'bottom-left' ? 'left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px))'
    : 'right:16px;top:calc(16px + env(safe-area-inset-top,0px))';

  return (
    <div ref={root} data-theme={theme} className={`ctr-surface ${className}`} style={{ viewTransitionName: transitionName }}>
      <style>{`
        .ctr-surface { position:relative; background:var(--color-bg); color:var(--color-ink); }
        .ctr-surface[data-theme="dark"] {
          --color-bg:#0a0b0a; --color-surface:#131513; --color-panel:#1a1c1a; --color-panel-2:#222522;
          --color-ink:#f4f4ef; --color-ink-soft:#d6d6cf; --color-muted:#a2a29a; --color-faint:#74746c;
          --color-line:#2b2e2b; --color-line-strong:#3a3e3a;
          color-scheme:dark;
        }
        .ctr-surface[data-theme="dark"] .ctr-invert { filter: invert(1) hue-rotate(180deg); }
        .ctr-toggle { position:absolute; z-index:30; ${corner}; display:flex; align-items:center; justify-content:space-between; width:68px; height:36px; padding:4px; border:1px solid var(--color-line); border-radius:999px; background:var(--color-surface); color:var(--color-ink); cursor:pointer; box-shadow:0 6px 18px -10px rgba(0,0,0,.4); }
        .ctr-toggle:focus-visible { outline:2px solid var(--color-ink); outline-offset:3px; }
        .ctr-toggle:disabled { cursor:wait; }
        .ctr-icon { display:grid; place-items:center; width:26px; height:26px; border-radius:50%; transition:background .2s,color .2s; }
        .ctr-icon.active { background:var(--color-ink); color:var(--color-bg); }
        ::view-transition-group(${transitionName}) { animation:none; }
        ::view-transition-old(${transitionName}), ::view-transition-new(${transitionName}) { animation:none; mix-blend-mode:normal; }
        ::view-transition-old(${transitionName}) { z-index:${theme === 'light' ? 1 : 2}; }
        ::view-transition-new(${transitionName}) { z-index:${theme === 'light' ? 2 : 1}; }
      `}</style>
      <button
        type="button"
        className="ctr-toggle"
        role="switch"
        aria-label={label}
        aria-checked={theme === 'dark'}
        disabled={busy}
        onClick={toggle}
      >
        <span className={`ctr-icon ${theme === 'light' ? 'active' : ''}`} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
          </svg>
        </span>
        <span className={`ctr-icon ${theme === 'dark' ? 'active' : ''}`} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
          </svg>
        </span>
      </button>
      {children}
    </div>
  );
}

export default CircularThemeReveal;
