import { useEffect, useState } from 'react';
import { Routes, Route, Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { SplashScreen } from './components/CarLoader';
import { ProtectedRoute } from './components/ProtectedRoute';
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
import CustomerDashboard from './pages/CustomerDashboard';
import HostDashboard from './pages/HostDashboard';
import Messages from './pages/Messages';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
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
  return (
    <>
      {splash.visible && <SplashScreen hiding={splash.hiding} />}
      <ScrollToTop />
      <div key={location.pathname} className="animate-page">
      <Routes location={location}>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/cars/:slug" element={<CarDetails />} />
          <Route path="/book/:slug" element={<Booking />} />
          <Route path="/list-your-car" element={<ListCar />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<CustomerDashboard />} />
          <Route path="/host" element={<HostDashboard />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      </div>
      <Toaster />
    </>
  );
}
