import { useEffect, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

export type Theme = 'light' | 'dark';

const KEY = 'cx-theme';
const LEGACY_KEY = 'cx-gateway-theme';
/** SIGNAL keeps its own theme: dark the first time, then whatever the person picks inside it. The site's
 *  theme (KEY) is left alone and comes back as soon as they leave SIGNAL. */
const SIGNAL_KEY = 'cx-signal-theme';

/** Browser chrome colours (iOS status bar / Android address bar) per theme. */
export const CHROME: Record<Theme, string> = { light: '#fbfbf9', dark: '#000000' };

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage is optional */
  }
  return 'light';
}

function readSignal(): Theme {
  try {
    const v = localStorage.getItem(SIGNAL_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage is optional */
  }
  return 'dark';
}

const startsInSignal = typeof window !== 'undefined' && /^\/signal(\/|$)/.test(window.location.pathname);
let inSignal = startsInSignal;
let current: Theme = typeof document === 'undefined' ? 'light' : startsInSignal ? readSignal() : read();
const listeners = new Set<() => void>();

/** Colour a page wants the browser chrome to take while it is visible, or null for the theme default. */
let chromeOverride: Record<Theme, string> | null = null;
let chromeSuspended = false;

/** While a full-screen dark layer is open, drop the theme-color tag so Safari follows the page background. */
export function setChromeSuspended(on: boolean) {
  chromeSuspended = on;
  if (typeof document !== 'undefined') paint();
}

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
  if (chromeSuspended) {
    // Full-screen dark layers: with no theme-color at all Safari tints its bars from the page background
    // (which those layers set to their own dark), instead of holding on to the last colour it was given.
    old?.remove();
  } else if (old?.getAttribute('content') !== colour || !old) {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', colour);
    if (old) old.replaceWith(meta);
    else document.head.appendChild(meta);
  }
  // (the iOS status-bar style is fixed at 'black-translucent' in index.html: it cannot change while the app runs)
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
    // Inside SIGNAL the choice belongs to SIGNAL; the site's own theme is not touched.
    localStorage.setItem(inSignal ? SIGNAL_KEY : KEY, next);
  } catch {
    /* ignore */
  }
  paint();
  listeners.forEach((l) => l());
}

// Where the last tap landed (the Signal button in the dock, usually): the colour change spreads from there.
let lastPointer: { x: number; y: number } | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => { lastPointer = { x: e.clientX, y: e.clientY }; }, { capture: true, passive: true });
}

/** Called when the route moves into or out of SIGNAL: it wears its own theme, the site gets its own back.
 *  The change spreads like the Dark mode switch does — a circle growing from where you tapped. */
export function setInSignal(on: boolean) {
  if (on === inSignal) return;
  inSignal = on;
  const next = on ? readSignal() : read();
  if (next === current) return;
  const apply = () => {
    current = next;
    paint();
    listeners.forEach((l) => l());
  };
  const doc = document as TransitionDocument;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced) {
    apply();
    return;
  }
  const x = lastPointer?.x ?? window.innerWidth / 2;
  const y = lastPointer?.y ?? window.innerHeight - 40;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const t = doc.startViewTransition(apply);
  t.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 600, easing: 'cubic-bezier(0.4,0,0.2,1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
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

/** For a page that is dark whatever the theme (the SIGNAL gate): the page background and Safari's bars take
 *  that colour while it is on screen, so no light strip shows above or below it. */
export function useAlwaysDarkChrome(colour = '#000000') {
  useEffect(() => {
    const root = document.documentElement;
    const app = document.getElementById('root');
    const prev = { r: root.style.backgroundColor, b: document.body.style.backgroundColor, a: app?.style.backgroundColor ?? '' };
    root.style.backgroundColor = colour;
    document.body.style.backgroundColor = colour;
    if (app) app.style.backgroundColor = colour;
    setChromeOverride({ light: colour, dark: colour });
    return () => {
      root.style.backgroundColor = prev.r;
      document.body.style.backgroundColor = prev.b;
      if (app) app.style.backgroundColor = prev.a;
      setChromeOverride(null);
    };
  }, [colour]);
}
