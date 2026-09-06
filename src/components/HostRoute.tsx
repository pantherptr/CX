import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useApp } from '../lib/store';

/** Gates nested routes behind a real host account — nested inside
 *  ProtectedRoute, so a session is already guaranteed here. Waits for the
 *  profile row itself to load before deciding, so a real host is never
 *  bounced during the brief window after sign-in before `profile` resolves. */
export function HostRoute() {
  const { session, profile, loading } = useAuth();
  const { toast } = useApp();
  const location = useLocation();

  const blocked = !loading && !!session && profile !== null && !profile.is_host;
  // Set only by the Owner Control Center (profiles.suspended) — a
  // suspended host keeps their account and history but loses host-side
  // access until the Owner lifts it.
  const suspended = !loading && !!session && profile !== null && profile.suspended;

  // Firing the toast here rather than inline in the render body avoids a
  // "Cannot update a component while rendering a different component"
  // warning — `toast()` updates AppProvider's state, and React doesn't
  // allow that as a side effect of rendering HostRoute itself.
  useEffect(() => {
    if (suspended) {
      toast({ title: 'Your host account is suspended', desc: 'Contact support if you believe this is a mistake.', icon: 'shield' });
    } else if (blocked) {
      toast({ title: 'Become a host to access this', desc: 'List a car to unlock your host dashboard.', icon: 'cars' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, suspended]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (profile === null) return null;
  if (suspended) return <Navigate to="/dashboard" replace />;
  if (blocked) return <Navigate to="/list-your-car" replace />;
  return <Outlet />;
}
