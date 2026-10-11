import type { SupportedStorage } from '@supabase/supabase-js';
import { authStorage } from './secureStorage';

/**
 * Where the sign-in session lives on the web.
 *
 * iOS Safari is aggressive: a tab that sits in the background can be discarded, and storage can be
 * trimmed under memory pressure or by "prevent cross-site tracking". If the session only exists in
 * localStorage and that one entry disappears, the next visit is a logged-out visit — which is what
 * "I left Safari and came back and I was signed out" looks like. So every write goes to
 * localStorage AND an IndexedDB copy, and a read that finds one empty restores it from the other.
 *
 * The native iOS app keeps using the Keychain store (secureStorage.ts) — this wrapper is for the web.
 */

const DB = 'cx-auth';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const db = () => (dbPromise ??= openDb());

async function idbGet(key: string): Promise<string | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: string | null): Promise<void> {
  const d = await db();
  if (!d) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite');
      if (value === null) tx.objectStore(STORE).delete(key);
      else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

const ls = {
  get(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { window.localStorage.setItem(key, value); } catch { /* private mode / quota */ }
  },
  remove(key: string) {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

const mirrored: SupportedStorage = {
  async getItem(key) {
    const local = ls.get(key);
    if (local !== null) {
      // keep the copy warm so it can restore localStorage later
      void idbSet(key, local);
      return local;
    }
    const copy = await idbGet(key);
    if (copy !== null) ls.set(key, copy); // restored after the browser dropped it
    return copy;
  },
  async setItem(key, value) {
    ls.set(key, value);
    await idbSet(key, value);
  },
  async removeItem(key) {
    ls.remove(key);
    await idbSet(key, null);
  },
};

/** Native: Keychain. Web: localStorage + IndexedDB mirror. */
export const sessionStorageAdapter: SupportedStorage = authStorage ?? mirrored;

/** Asks the browser not to evict this origin's storage (best effort, silently ignored if refused). */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}
