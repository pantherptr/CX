import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** Gates nested routes behind a signed-in session, bouncing to /login otherwise. */
export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}
