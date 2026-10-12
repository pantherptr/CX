import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

export type Theme = 'light' | 'dark';

const KEY = 'cx-theme';
const LEGACY_KEY = 'cx-gateway-theme';

/** Browser chrome colours (iOS status bar / Android address bar) per theme. */
export const CHROME: Record<Theme, string> = { light: '#fbfbf9', dark: '#0a0b0a' };

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage is optional */
  }
  return 'light';
}

let current: Theme = typeof document === 'undefined' ? 'light' : read();
const listeners = new Set<() => void>();

/** Colour a page wants the browser chrome to take while it is visible, or null for the theme default. */
let chromeOverride: Record<Theme, string> | null = null;

export function chromeColor(light?: string, dark?: string): string {
  return current === 'dark' ? (dark ?? CHROME.dark) : (light ?? CHROME.light);
}

function paint() {
  const root = document.documentElement;
  root.dataset.theme = current;
  root.style.colorScheme = current;
  // Safari only re-reads the status-bar tint when the tag itself is replaced, not when its value changes.
  const colour = chromeOverride ? chromeOverride[current] : CHROME[current];
  const old = document.querySelector('meta[name="theme-color"]');
  if (old?.getAttribute('content') !== colour) {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', colour);
    if (old) old.replaceWith(meta);
    else document.head.appendChild(meta);
  }
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', current === 'dark' ? 'black' : 'default');
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: current === 'dark' ? Style.Dark : Style.Light }))
      .catch(() => {});
  }
}

/** Pages that tint the browser chrome themselves (home hero, chat) register their colours here. */
export function setChromeOverride(colors: Record<Theme, string> | null) {
  chromeOverride = colors;
  if (typeof document !== 'undefined') paint();
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(next: Theme) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  paint();
  listeners.forEach((l) => l());
}

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void };
};

/** Flip the theme with a circle spreading from `origin` (viewport px) where the browser supports it. */
export function toggleTheme(origin?: { x: number; y: number }) {
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  const doc = document as TransitionDocument;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced) {
    setTheme(next);
    return;
  }
  const x = origin?.x ?? window.innerWidth - 40;
  const y = origin?.y ?? 40;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const t = doc.startViewTransition(() => setTheme(next));
  t.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'cubic-bezier(0.4,0,0.2,1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => 'light' as Theme,
  );
}

// Apply as early as possible (before React mounts) so there is no light flash.
if (typeof document !== 'undefined') paint();
