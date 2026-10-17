import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser as CapacitorBrowser } from '@capacitor/browser';
import { supabase, isSupabaseConfigured } from './supabase';
import { registerPushToken, unregisterPushToken } from './push';
import { requestPersistentStorage } from './sessionStorage';
import { touchDevice } from './data/devices';

const PROFILE_CACHE = 'cx.profile.v1';

/** What a person reads when the service is unreachable or restricted (network down, quota block, 5xx): never the raw
 *  provider text. Wrong passwords and the like keep their own message. */
const UNAVAILABLE_ERROR = 'CX is briefly unavailable while we get things ready. Please try again in a little while: your account and data are safe.';
function friendlyAuthError(err: { message: string; status?: number; name?: string }): string {
  const m = err.message ?? '';
  const down = !err.status || err.status === 0 || err.status >= 500 || err.status === 429 || /failed to fetch|network|load failed|quota|restricted|fetch/i.test(m) || err.name === 'AuthRetryableFetchError';
  return down ? UNAVAILABLE_ERROR : m;
}

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
  /** Admin-grantable, reversible — lets a Client publish to SIGNAL under
   *  their own real identity (see 0048_signal_community.sql). Locked the
   *  same way is_admin/is_owner/suspended are (profiles_lock_is_admin_update). */
  is_verified_client: boolean;
  response_time: string | null;
  response_rate: number | null;
  created_at: string;
  /** The account's one SIGNAL username (canonical case as chosen by the
   *  user) — see supabase/migrations/0059_signal_usernames_and_search.sql.
   *  Null until the user sets one. */
  username: string | null;
  /** Null for a new member until the welcome CX Pass has been shown once (migration 0116). */
  welcome_pass_seen_at?: string | null;
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

  // Startup fires this from the session check AND the auth listener; calls for the same person that
  // overlap share one request instead of hitting the database twice.
  const profileInflight = useRef<{ userId: string; run: Promise<void> } | null>(null);

  const loadProfile = useCallback((userId: string): Promise<void> => {
    if (profileInflight.current?.userId === userId) return profileInflight.current.run;
    const run = (async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      // A failed request (network just woke up) must not wipe a profile we already have.
      if (error && !data) return;
      const next = (data as Profile | null) ?? null;
      setProfile(next);
      try {
        if (next) window.localStorage.setItem(PROFILE_CACHE, JSON.stringify(next));
      } catch { /* storage unavailable */ }
    })().finally(() => {
      if (profileInflight.current?.run === run) profileInflight.current = null;
    });
    profileInflight.current = { userId, run };
    return run;
  }, []);

  // ---- Session manager -------------------------------------------------------------------
  // Coming back to Safari after leaving it used to land people signed out. The causes this
  // guards against: (1) the token refresh failing for a moment while the network wakes up, which
  // the client reports as "no session" even though the sign-in is still valid; (2) a stray
  // event with a null session; (3) the page being rebuilt by iOS, which re-resolves the session
  // from storage. A sign-in now only ends when the server says so (refresh token rejected) after
  // re-checking, or when the person presses sign out.
  const hadSession = useRef(false);
  const signingOut = useRef(false);
  const verifying = useRef<Promise<void> | null>(null);

  /** The session is gone from where we looked — look again (with patience) before believing it. */
  const confirmSignedOut = useCallback(() => {
    if (verifying.current) return verifying.current;
    const run = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt > 0) await new Promise((r) => window.setTimeout(r, 700 * attempt));
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setSession(data.session);
          return;
        }
        // The server refusing the refresh token is final; only network trouble is worth retrying.
        const { error } = await supabase.auth.refreshSession();
        if (!error) return; // refreshSession fires TOKEN_REFRESHED, which restores the session
        if (!/network|fetch|timeout|failed to/i.test(error.message)) break;
      }
      hadSession.current = false;
      setSession(null);
      setProfile(null);
      try { window.localStorage.removeItem(PROFILE_CACHE); } catch { /* ignore */ }
    };
    verifying.current = run().finally(() => { verifying.current = null; });
    return verifying.current;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    requestPersistentStorage();
    let cancelled = false;

    // Instant first paint for someone who was signed in: the last profile we saw.
    try {
      const cached = window.localStorage.getItem(PROFILE_CACHE);
      if (cached) setProfile(JSON.parse(cached) as Profile);
    } catch { /* ignore */ }

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      // No session although this device was signed in a moment ago (cached profile present):
      // most likely the first refresh hit a sleeping network. Keep the app on its loading state
      // and look again before sending anyone to the login page.
      if (!data.session) {
        let wasSignedIn = false;
        try { wasSignedIn = Boolean(window.localStorage.getItem(PROFILE_CACHE)); } catch { /* ignore */ }
        if (wasSignedIn) {
          hadSession.current = true;
          await confirmSignedOut();
          if (cancelled) return;
          const again = await supabase.auth.getSession();
          if (again.data.session) {
            setSession(again.data.session);
            void loadProfile(again.data.session.user.id);
            void registerPushToken(again.data.session.user.id);
            setLoading(false);
            return;
          }
        }
      }
      setSession(data.session);
      if (data.session) {
        hadSession.current = true;
        void loadProfile(data.session.user.id);
        void registerPushToken(data.session.user.id);
        void touchDevice();
      } else {
        // Nothing stored: clear the cache so a stale profile never outlives its sign-in.
        try { window.localStorage.removeItem(PROFILE_CACHE); } catch { /* ignore */ }
        setProfile(null);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (next) {
        hadSession.current = true;
        setSession(next);
        // TOKEN_REFRESHED fires every hour — no need to reload the profile for it.
        if (event !== 'TOKEN_REFRESHED') {
          void loadProfile(next.user.id);
          void registerPushToken(next.user.id);
          void touchDevice();
        }
        return;
      }
      if (signingOut.current || !hadSession.current) {
        setSession(null);
        setProfile(null);
        return;
      }
      void confirmSignedOut();
    });

    // Back from the background / the network came back: make sure the session is alive, and
    // refresh it early if it is about to lapse.
    const onResume = () => {
      if (document.visibilityState === 'hidden' || !hadSession.current || signingOut.current) return;
      void (async () => {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          void confirmSignedOut();
          return;
        }
        const left = (data.session.expires_at ?? 0) - Math.floor(Date.now() / 1000);
        if (left < 90) await supabase.auth.refreshSession();
      })();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('online', onResume);
    window.addEventListener('focus', onResume);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('online', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [loadProfile, confirmSignedOut]);

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
    if (error) return { error: friendlyAuthError(error), needsEmailConfirmation: false };
    // If email confirmation is required, Supabase returns a user but no
    // session — the account exists but can't sign in yet.
    return { error: null, needsEmailConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? friendlyAuthError(error) : null };
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
    signingOut.current = true;
    try {
      await unregisterPushToken();
      await supabase.auth.signOut();
    } finally {
      hadSession.current = false;
      signingOut.current = false;
      try { window.localStorage.removeItem(PROFILE_CACHE); } catch { /* ignore */ }
    }
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
