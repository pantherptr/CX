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

  if (loading) return null;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (profile === null) return null;
  if (!profile.is_host) {
    toast({ title: 'Become a host to access this', desc: 'List a car to unlock your host dashboard.', icon: 'cars' });
    return <Navigate to="/list-your-car" replace />;
  }
  return <Outlet />;
}
