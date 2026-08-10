import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo } from '../components/primitives';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-7 sm:p-8">
          <h1 className="text-center font-display text-2xl font-semibold text-ink">Welcome back</h1>
          <p className="mt-1.5 text-center text-[14px] text-muted">Sign in to your Velora account</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-[13.5px] text-danger">{error}</p>
            )}
            <button type="submit" disabled={submitting} className="btn btn-primary btn-block btn-lg">
              {submitting ? 'Signing in…' : 'Sign in'}
              {!submitting && <Icon name="arrowRight" size={16} />}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-[14px] text-muted">
          New to Velora?{' '}
          <Link to="/signup" className="font-medium text-ink underline underline-offset-2">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
