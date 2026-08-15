import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** Gates routes that only make sense for a signed-out visitor (home, login,
 *  signup) — bounces an authenticated session straight to the dashboard.
 *  Re-runs on every navigation (direct URL entry, link clicks, browser
 *  back/forward), so there's no route to the public homepage while a
 *  session is active. */
export function PublicOnlyRoute() {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (session) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
