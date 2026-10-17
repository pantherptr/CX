import { useEffect, useState } from 'react';
import { IS_APP } from './appMode';

/** "Get the app": the site is a PWA, this makes installing it easy.
 *  - Chrome / Android hands over a prompt (`beforeinstallprompt`): we keep it and fire it from our own button.
 *  - iPhone / iPad has no such prompt: we show the two Share-sheet steps.
 *  - Computers get a QR code to open the site on the phone. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

const INSTALLED_KEY = 'cx-installed';
const SNOOZE_KEY = 'cx-install-snooze';
const VISITS_KEY = 'cx-visits';

const safe = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    safe.set(INSTALLED_KEY, '1');
    emit();
  });
  // one visit per browser session (a returning visitor is the right moment to offer the app)
  try {
    if (!sessionStorage.getItem('cx-visit-counted')) {
      sessionStorage.setItem('cx-visit-counted', '1');
      safe.set(VISITS_KEY, String(Number(safe.get(VISITS_KEY) ?? '0') + 1));
    }
  } catch { /* ignore */ }
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';

function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function openInstallSheet() {
  window.dispatchEvent(new Event('cx:install'));
}

export function snoozeInstallInvite(days = 14) {
  safe.set(SNOOZE_KEY, String(Date.now() + days * 86_400_000));
}

export function useInstall() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  const platform = detectPlatform();
  const installed = IS_APP || safe.get(INSTALLED_KEY) === '1';
  return {
    platform,
    installed,
    /** the browser can install with one tap */
    nativePrompt: deferred !== null,
    /** returning visitor, not installed, not snoozed */
    shouldInvite: !installed && Date.now() > Number(safe.get(SNOOZE_KEY) ?? '0') && Number(safe.get(VISITS_KEY) ?? '0') >= 2,
    async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
      if (!deferred) return 'unavailable';
      const p = deferred;
      deferred = null;
      emit();
      await p.prompt();
      const { outcome } = await p.userChoice;
      if (outcome === 'accepted') safe.set(INSTALLED_KEY, '1');
      emit();
      return outcome;
    },
  };
}
