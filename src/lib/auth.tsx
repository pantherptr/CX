import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser as CapacitorBrowser } from '@capacitor/browser';
import { supabase, isSupabaseConfigured } from './supabase';
import { registerPushToken, unregisterPushToken } from './push';

const NOT_CONFIGURED_ERROR =
  'Sign-in is not set up yet — Supabase keys are missing from .env.local.';

/**
 * Google actively refuses to show its consent screen inside an embedded
 * WebView — including Capacitor's WKWebView — and fails with
 * "disallowed_useragent" instead. The fix Google's own docs recommend is
 * opening the OAuth URL in the system browser (SFSafariViewController on
 * iOS, via @capacitor/browser) rather than navigating the app's own
 * WebView to it, then catching Google's redirect back with a custom URL
 * scheme instead of an https:// callback page.
 *
 * This exact string must match, in three places at once: the
 * CFBundleURLSchemes entry in ios/App/App/Info.plist, and an entry in
 * Supabase Dashboard -> Authentication -> URL Configuration -> Redirect
 * URLs. All three — plus capacitor.config.ts's `appId` — change together
 * the day the com.cxrent.app placeholder becomes a real bundle identifier.
 */
const NATIVE_OAUTH_REDIRECT = 'com.cxrent.app://login';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  is_host: boolean;
  is_admin: boolean;
  /** The one platform Owner account — see
   *  supabase/migrations/0021_owner_control_center.sql. Strictly above
   *  is_admin: an Owner always has is_admin === true too, but the
   *  reverse isn't required. */
  is_owner: boolean;
  /** Set only by the Owner (see the profiles_lock_is_admin_update
   *  trigger) — a suspended host keeps their account and history but is
   *  blocked from the host-side app. */
  suspended: boolean;
  response_time: string | null;
  response_rate: number | null;
  created_at: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** True only while the initial session is being resolved on load. */
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Redirects the whole page to Google's real OAuth consent screen via
   *  Supabase's hosted flow — there is no mock/fake path. Resolves with an
   *  error only if the redirect itself couldn't be started (e.g. the
   *  Google provider isn't enabled in the Supabase dashboard yet); on
   *  success the browser navigates away before this promise would
   *  otherwise resolve, and the session is picked up by the
   *  `onAuthStateChange` listener below when Google redirects back. */
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) {
        void loadProfile(data.session.user.id);
        void registerPushToken(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) {
        void loadProfile(next.user.id);
        void registerPushToken(next.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Catches Google's redirect back into the app after the system-browser
  // consent flow below (native only — the web build's redirect is a plain
  // page navigation to /login, handled by PublicOnlyRoute instead). The
  // PKCE `code` this app receives here is exchanged for the real session;
  // onAuthStateChange above then picks it up the same way a web sign-in
  // would.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: { remove: () => void } | undefined;
    CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith(NATIVE_OAUTH_REDIRECT)) return;
      void CapacitorBrowser.close().catch(() => {});
      const code = new URL(url).searchParams.get('code');
      if (code) {
        supabase.auth.exchangeCodeForSession(code).catch((err) => {
          console.error('[auth] Google sign-in code exchange failed', err);
        });
      }
    }).then((h) => {
      handle = h;
    });
    return () => handle?.remove();
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR, needsEmailConfirmation: false };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { error: error.message, needsEmailConfirmation: false };
    // If email confirmation is required, Supabase returns a user but no
    // session — the account exists but can't sign in yet.
    return { error: null, needsEmailConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR };

    if (Capacitor.isNativePlatform()) {
      // skipBrowserRedirect stops supabase-js from navigating the app's
      // own WebView to Google — it just hands back the authorize URL,
      // which gets opened in the system browser instead (see
      // NATIVE_OAUTH_REDIRECT's comment for why that's required). The
      // appUrlOpen listener above completes the sign-in once Google
      // redirects back; this call has no session to report yet by the
      // time it returns.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: NATIVE_OAUTH_REDIRECT, skipBrowserRedirect: true },
      });
      if (error || !data.url) return { error: error?.message ?? 'Could not start Google sign-in.' };
      await CapacitorBrowser.open({ url: data.url });
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Land back on /login: PublicOnlyRoute there immediately bounces
        // to /dashboard once the session lands, for both a brand-new
        // Google user and a returning one — no separate callback page
        // needed.
        redirectTo: `${window.location.origin}/login`,
      },
    });
    return { error: error ? error.message : null };
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    // Runs before auth.signOut() so the delete still carries this user's
    // own session — deleting under RLS after sign-out would have no
    // identity to check auth.uid() against.
    await unregisterPushToken();
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, signUp, signIn, signInWithGoogle, signOut, refreshProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
