import { useAuth } from './auth';

/**
 * Whether the visitor has signed in. Visitors without an account see a
 * reduced version of listings (no host details, no exact address) until
 * they do. While the session is still loading this answers "no", so
 * nothing members-only ever flashes up for a moment and disappears.
 */
export function useHasAccess(): boolean {
  const { session, loading } = useAuth();
  return !loading && session != null;
}
