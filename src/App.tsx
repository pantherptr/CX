import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Outlet, useLocation } from 'react-router-dom';
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

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
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
  return (
    <>
      {splash.visible && <PremiumInitialLoader hiding={splash.hiding} />}
      <ScrollToTop />
      <MaintenanceGate>
      <div key={location.pathname} className={`animate-page ${bottomNavVisible ? 'pb-16' : ''}`}>
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
