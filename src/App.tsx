import { useEffect, useState } from 'react';
import { Routes, Route, Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { SplashScreen } from './components/CarLoader';
import { ProtectedRoute } from './components/ProtectedRoute';
import { BottomNav, useBottomNavVisible } from './components/BottomNav';
import { Toaster } from './lib/store';

import Home from './pages/Home';
import Browse from './pages/Browse';
import CarDetails from './pages/CarDetails';
import Booking from './pages/Booking';
import ListCar from './pages/ListCar';
import HowItWorks from './pages/HowItWorks';
import About from './pages/About';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Help from './pages/Help';
import CustomerDashboard from './pages/CustomerDashboard';
import HostDashboard from './pages/HostDashboard';
import Messages from './pages/Messages';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import TripDetails from './pages/TripDetails';
import NotFound from './pages/NotFound';

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

function MarketingLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function useSplash(minMs = 1500) {
  const [visible, setVisible] = useState(() => !sessionStorage.getItem('velora-splashed'));
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const start = performance.now();
    let raf = 0;
    const finish = () => {
      const wait = Math.max(0, minMs - (performance.now() - start));
      window.setTimeout(() => {
        setHiding(true);
        sessionStorage.setItem('velora-splashed', '1');
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
      {splash.visible && <SplashScreen hiding={splash.hiding} />}
      <ScrollToTop />
      <div key={location.pathname} className={`animate-page ${bottomNavVisible ? 'pb-16' : ''}`}>
      <Routes location={location}>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/cars/:slug" element={<CarDetails />} />
          <Route path="/list-your-car" element={<ListCar />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/help" element={<Help />} />

          {/* Booking needs a real signed-in renter, but keeps the
              marketing chrome (Navbar/Footer) rather than the dashboard
              shell — nest ProtectedRoute inside MarketingLayout for it. */}
          <Route element={<ProtectedRoute />}>
            <Route path="/book/:slug" element={<Booking />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<CustomerDashboard />} />
          <Route path="/host" element={<HostDashboard />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/trips/:id" element={<TripDetails />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      </div>
      <BottomNav />
      <Toaster />
    </>
  );
}
