import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Gates the Owner Control Center behind profiles.is_owner (see
 * supabase/migrations/0021_owner_control_center.sql) — nested inside
 * ProtectedRoute, so a session is already guaranteed here.
 *
 * Same story as AdminRoute: this check is UX, not the security boundary.
 * `profile.is_owner` is client-fetched state; the real boundary is
 * server-side, via RLS policies built on `public.is_owner()`, which
 * re-check the database's own row on every request regardless of what
 * this component decides. There is no self-serve path to is_owner — see
 * the migration for the one hardcoded account it's ever granted to.
 */
export function OwnerRoute() {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (profile === null) return null;
  if (!profile.is_owner) return <Navigate to={profile.is_host ? '/host' : '/dashboard'} replace />;
  return <Outlet />;
}
