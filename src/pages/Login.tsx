import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { AuthCard, AuthItem } from '../components/AuthCard';
import { GoogleSignInButton, AuthDivider } from '../components/primitives';
import { useAuth } from '../lib/auth';
import { useScramble } from '../lib/useScramble';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const signInScramble = useScramble('Sign in');

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
    <AuthCard title="Welcome back" subtitle="Sign in to your CX account">
      <form onSubmit={onSubmit} className="mt-7 space-y-3.5">
        <AuthItem stop className="relative">
          <label className="sr-only" htmlFor="email">Email</label>
          <Icon name="message" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input id="email" type="email" required autoComplete="email" placeholder="Email address" className="input !h-12 !pl-11 !text-[16px]" value={email} onChange={(e) => setEmail(e.target.value)} />
        </AuthItem>
        <AuthItem stop className="relative">
          <label className="sr-only" htmlFor="password">Password</label>
          <Icon name="lock" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input id="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" placeholder="Password" className="input !h-12 !pl-11 !pr-12 !text-[16px]" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-faint transition-colors hover:text-ink">
            <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
          </button>
        </AuthItem>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-detail text-danger">{error}</p>}
        <AuthItem stop>
          <button type="submit" disabled={submitting} className="btn btn-glint btn-primary btn-block btn-lg" {...(submitting ? {} : signInScramble)}>
            <span className="btn-glint__sweep" aria-hidden="true" />
            {submitting ? 'Signing in…' : signInScramble.display}
            {!submitting && <Icon name="arrowRight" size={16} />}
          </button>
        </AuthItem>
      </form>

      <AuthItem stop>
        <AuthDivider />
        <GoogleSignInButton label="Sign in with Google" />
      </AuthItem>

      <AuthItem stop>
        <p className="mt-6 text-center text-body text-muted">
          New to CX?{' '}
          <Link to="/signup" className="font-semibold text-ink underline underline-offset-2">Create an account</Link>
        </p>
      </AuthItem>
    </AuthCard>
  );
}
