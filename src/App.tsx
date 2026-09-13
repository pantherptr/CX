import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Routes, Route, Outlet, useLocation, Navigate, useParams } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { PremiumInitialLoader, PremiumPageLoader } from './components/PremiumLoader';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicOnlyRoute } from './components/PublicOnlyRoute';
import { HostRoute } from './components/HostRoute';
import { AdminRoute } from './components/AdminRoute';
import { OwnerRoute } from './components/OwnerRoute';
import { BottomNav, useBottomNavVisible } from './components/BottomNav';
import { Toaster } from './lib/store';
import { useAuth } from './lib/auth';
import { CompareTray } from './components/CompareTray';
import { MaintenanceGate } from './components/MaintenanceGate';

// Eager — the three routes a first-time visitor actually lands on. Keeping
// these in the main chunk avoids a loading flash on the critical path.
import Home from './pages/Home';
import Browse from './pages/Browse';
import CarDetails from './pages/CarDetails';
import NotFound from './pages/NotFound';

// Lazy — everything else. Most of these are behind auth (Booking,
// TripDetails, ListCar, the dashboards, Settings) so an anonymous visitor
// was previously downloading ~3,500 lines of code they could never reach.
// Split per route so each page's cost is paid only when it's opened.
const Compare = lazy(() => import('./pages/Compare'));
const Garage = lazy(() => import('./pages/Garage'));
const Signal = lazy(() => import('./pages/Signal'));
const Booking = lazy(() => import('./pages/Booking'));
const ListCar = lazy(() => import('./pages/ListCar'));
const HowItWorks = lazy(() => import('./pages/HowItWorks'));
const About = lazy(() => import('./pages/About'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Help = lazy(() => import('./pages/Help'));
const CustomerDashboard = lazy(() => import('./pages/CustomerDashboard'));
const OwnerHome = lazy(() => import('./pages/OwnerHome'));
const HostDashboard = lazy(() => import('./pages/HostDashboard'));
const Messages = lazy(() => import('./pages/Messages'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Settings = lazy(() => import('./pages/Settings'));
const TripDetails = lazy(() => import('./pages/TripDetails'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));

// Dev-only layout fixture (hardcoded numbers, no real data) — the import
// itself is gated the same as the route below so it's excluded from a
// production build entirely, not just hidden behind a check at runtime.
const SignalMetricsPreview = import.meta.env.DEV
  ? lazy(() => import('./pages/dev/SignalMetricsPreview'))
  : null;

// Every /signal* path (Official, Community, and both spaces' post/profile/
// highlight overlays) renders the same <Signal/> shell — see the `pageKey`
// use below and SIGNAL_ROUTE's twin in BottomNav.tsx.
const SIGNAL_ROUTE = /^\/signal(\/|$)/;
// Which of the two spaces a Signal path belongs to, or null outside Signal
// entirely — used to tell "opened/closed an overlay, same space" (keep
// scroll — Signal.tsx owns one scrollable feed underneath any overlay,
// and resetting it here would throw away the reader's place every time
// they open then close a post) apart from "switched Official<->Community"
// (a genuinely different feed — scroll to top like any tab switch).
function signalSpaceOf(pathname: string): 'official' | 'community' | null {
  if (!SIGNAL_ROUTE.test(pathname)) return null;
  return pathname.startsWith('/signal/community') ? 'community' : 'official';
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const prevPathname = useRef(pathname);
  useEffect(() => {
    const prevSpace = signalSpaceOf(prevPathname.current);
    prevPathname.current = pathname;
    if (prevSpace && prevSpace === signalSpaceOf(pathname)) return;
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }

    // The target element (e.g. #trips, #saved) often belongs to a
    // route behind ProtectedRoute's async auth check, so it can mount
    // several frames after this effect fires. Poll briefly rather than
    // assuming one frame is enough — some hashes (e.g. /settings#payments)
    // select a tab rather than naming a real element, so give up and land
    // at the top if nothing shows up.
    let cancelled = false;
    let attempts = 0;
    const tryScroll = () => {
      if (cancelled) return;
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
        return;
      }
      attempts += 1;
      if (attempts < 30) {
        window.requestAnimationFrame(tryScroll);
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
    };
    tryScroll();

    return () => {
      cancelled = true;
    };
  }, [pathname, hash]);
  return null;
}

/** `/dashboard` is every signed-in account's "home" — but the Owner
 *  account doesn't rent cars, so the customer view (trips, saved cars,
 *  book-a-car) has nothing real to show it. Swapping the whole page here,
 *  rather than branching inside CustomerDashboard.tsx, keeps that already
 *  large file untouched and the Owner's home entirely separate. */
function DashboardHome() {
  const { profile } = useAuth();
  return profile?.is_owner ? <OwnerHome /> : <CustomerDashboard />;
}

/** Signal was renamed from Empire — old /empire* links (already shared,
 *  bookmarked, or indexed) still need to land somewhere real rather than
 *  404. Redirects to the equivalent /signal* path, preserving whatever
 *  deep-link id was in the URL. */
function EmpireToSignalRedirect() {
  const { postId, highlightId } = useParams<{ postId?: string; highlightId?: string }>();
  if (postId) return <Navigate to={`/signal/post/${postId}`} replace />;
  if (highlightId) return <Navigate to={`/signal/highlight/${highlightId}`} replace />;
  return <Navigate to="/signal" replace />;
}

function MarketingLayout() {
  // The full marketing footer (product/company/support/legal columns,
  // socials, newsletter tone) belongs to the public site — an
  // authenticated session on a sidebar-less page (Browse, car details,
  // help, booking, list-a-car) should feel like the same private app as
  // the dashboard, which never renders this footer at all.
  const { session } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      {!session && <Footer />}
    </div>
  );
}

function useSplash(minMs = 1500) {
  const [visible, setVisible] = useState(() => !sessionStorage.getItem('cx-splashed'));
  const [hiding, setHiding] = useState(false);

  // Locks the underlying page's own scroll for as long as the splash
  // covers it — without this, a tall page behind the splash keeps its
  // scrollbar, which shrinks the fixed full-screen splash's own width
  // by the scrollbar's size and throws its centered content very
  // slightly off true viewport-center. A true full-screen overlay
  // shouldn't leave the page under it interactable anyway.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const start = performance.now();
    let raf = 0;
    const finish = () => {
      const wait = Math.max(0, minMs - (performance.now() - start));
      window.setTimeout(() => {
        setHiding(true);
        sessionStorage.setItem('cx-splashed', '1');
        window.setTimeout(() => setVisible(false), 520);
      }, wait);
    };
    if (document.readyState === 'complete') finish();
    else window.addEventListener('load', finish, { once: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('load', finish);
    };
  }, [visible, minMs]);

  return { visible, hiding };
}

export default function App() {
  const location = useLocation();
  const splash = useSplash();
  const bottomNavVisible = useBottomNavVisible();
  // One stable key for the whole /signal* family instead of the raw
  // pathname — every variant (Official, Community, and both spaces' post/
  // profile/highlight overlays) renders the same <Signal/> shell, and
  // keying by the exact pathname forced React to fully unmount and
  // remount it — refetching the feed, Stories, pinned/featured, and
  // resetting scroll — on every single overlay open/close or space
  // switch. Signal.tsx already derives everything it needs (space, which
  // overlay if any) reactively from useLocation()/useParams(), so it
  // never needed a fresh mount for any of this in the first place. Every
  // other route keeps its exact previous per-pathname remount behavior.
  const pageKey = SIGNAL_ROUTE.test(location.pathname) ? '/signal' : location.pathname;
  return (
    <>
      {splash.visible && <PremiumInitialLoader hiding={splash.hiding} />}
      <ScrollToTop />
      <MaintenanceGate>
      <div key={pageKey} className={`animate-page ${bottomNavVisible ? 'pb-16' : ''}`}>
      {/* One boundary for every lazy route below. The fallback is
          deliberately quiet — a centred marque rather than a full-screen
          splash — because these chunks resolve in a few hundred ms on a
          warm connection and a heavy loader would read as slower than
          the navigation actually is. */}
      <Suspense
        fallback={
          <div className="flex min-h-[60dvh] items-center justify-center" role="status" aria-label="Loading">
            <PremiumPageLoader size={80} />
          </div>
        }
      >
      <Routes location={location}>
        <Route element={<MarketingLayout />}>
          {/* Home, login and signup only make sense while signed out — an
              authenticated session bounces straight to the dashboard,
              whether arriving by direct URL, link, or browser back/forward. */}
          <Route element={<PublicOnlyRoute />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
          </Route>
          <Route path="/browse" element={<Browse />} />
          <Route path="/cars/:slug" element={<CarDetails />} />
          <Route path="/compare" element={<Compare />} />
          {/* Not wrapped in ProtectedRoute — the page itself shows a
              sign-in teaser for a signed-out visitor rather than a hard
              redirect, per its own spec. */}
          <Route path="/garage" element={<Garage />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/about" element={<About />} />
          <Route path="/help" element={<Help />} />

          {/* Booking and List Your Car need a real signed-in user, but
              keep the marketing chrome (Navbar/Footer) rather than the
              dashboard shell — nest ProtectedRoute inside MarketingLayout
              for them. */}
          <Route element={<ProtectedRoute />}>
            <Route path="/book/:slug" element={<Booking />} />
            <Route path="/list-your-car" element={<ListCar />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/trips/:id" element={<TripDetails />} />

          <Route element={<HostRoute />}>
            <Route path="/host" element={<HostDashboard />} />
          </Route>

          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>

          <Route element={<OwnerRoute />}>
            <Route path="/owner" element={<OwnerDashboard />} />
          </Route>
        </Route>

        {/* Signal is a deliberate sibling of MarketingLayout, not a child
            of it — it supplies 100% of its own chrome the same way the
            dashboard-area routes below opt out of MarketingLayout in favor
            of DashboardShell. No ProtectedRoute wrapper: the page itself
            shows a sign-in title screen for a signed-out visitor rather
            than a hard redirect. */}
        <Route path="/signal" element={<Signal />} />
        {/* Deep links — a shared post/Highlight open the same Signal shell
            with the item focused in an overlay, rather than a standalone
            page, so "back" always returns to a live, scroll-preserved
            feed underneath. */}
        <Route path="/signal/post/:postId" element={<Signal />} />
        <Route path="/signal/highlight/:highlightId" element={<Signal />} />
        <Route path="/signal/profile/:authorId" element={<Signal />} />
        {/* SIGNAL COMMUNITY — the same shell/component, reading its own
            pathname to know which space it's in (see Signal.tsx's `space`).
            Highlights stay Official-only, so there's no
            /signal/community/highlight/:id route. */}
        <Route path="/signal/community" element={<Signal />} />
        <Route path="/signal/community/post/:postId" element={<Signal />} />
        <Route path="/signal/community/profile/:authorId" element={<Signal />} />

        {/* Dev-only: hardcoded-number layout fixture, never present in a
            production build (see the gated import above). */}
        {SignalMetricsPreview && <Route path="/dev/signal-metrics" element={<SignalMetricsPreview />} />}

        {/* Signal was renamed from Empire — keep the old routes alive as
            redirects so links shared before the rename still resolve. */}
        <Route path="/empire" element={<EmpireToSignalRedirect />} />
        <Route path="/empire/post/:postId" element={<EmpireToSignalRedirect />} />
        <Route path="/empire/highlight/:highlightId" element={<EmpireToSignalRedirect />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      </div>
      <BottomNav />
      </MaintenanceGate>
      <CompareTray />
      <Toaster />
    </>
  );
}
