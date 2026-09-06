import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import type { SupportedStorage } from '@supabase/supabase-js';

/**
 * Keychain-backed session storage for the native iOS app.
 *
 * By default supabase-js persists the session (access + refresh token) to
 * `localStorage`, which inside a WKWebView is backed by a plain file on
 * disk — readable by anything with filesystem access to the app's
 * sandbox, and not cleared by the OS's own "erase this app's data"
 * affordances the way Keychain items are. `capacitor-secure-storage-plugin`
 * puts the same data in the iOS Keychain instead, which is what Apple's
 * own guidance expects for anything as sensitive as an auth session.
 *
 * Left as the default (localStorage) on the web build, where none of this
 * applies and Keychain doesn't exist.
 */
const keychainStorage: SupportedStorage = {
  async getItem(key) {
    try {
      const { value } = await SecureStoragePlugin.get({ key });
      return value;
    } catch {
      // The plugin rejects (rather than resolving null) when the key has
      // never been set — the normal case on first launch.
      return null;
    }
  },
  async setItem(key, value) {
    await SecureStoragePlugin.set({ key, value });
  },
  async removeItem(key) {
    try {
      await SecureStoragePlugin.remove({ key });
    } catch {
      // Already gone — removeItem on a missing key isn't an error case
      // for any of supabase-js's own storage implementations.
    }
  },
};

export const authStorage: SupportedStorage | undefined = Capacitor.isNativePlatform() ? keychainStorage : undefined;
