import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Gates nested routes behind profiles.is_admin (see migrations
 * 0016_admin_panel.sql and 0018_single_admin_bootstrap.sql) — nested
 * inside ProtectedRoute, so a session is already guaranteed here.
 *
 * This check exists for UX (send someone somewhere sensible, fast)
 * rather than as the actual security boundary — `profile.is_admin` is
 * client-fetched state, and a determined visitor could in principle
 * doctor it before this component ever runs. The real boundary is
 * server-side: every admin-only read/write goes through the RLS
 * policies built on `public.is_admin()` (migration 0016), which re-check
 * the *database's* row on every single request, regardless of what this
 * route thinks. Even if this whole component were deleted, someone
 * without a true is_admin row could still load the /admin page's shell
 * but every real query and mutation it makes would come back empty or
 * rejected.
 *
 * Unlike HostRoute there's no self-serve way to become an admin, so a
 * blocked visitor is sent to their own real dashboard rather than to
 * some "apply to be an admin" page that doesn't exist.
 */
export function AdminRoute() {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (profile === null) return null;
  if (!profile.is_admin) return <Navigate to={profile.is_host ? '/host' : '/dashboard'} replace />;
  return <Outlet />;
}
