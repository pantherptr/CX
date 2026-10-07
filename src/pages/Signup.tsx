import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo, GoogleSignInButton, AuthDivider } from '../components/primitives';
import { AuthCard, AuthItem } from '../components/AuthCard';
import { useAuth } from '../lib/auth';
import { useScramble } from '../lib/useScramble';

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const createAccountScramble = useScramble('Create account');
  const [confirmSent, setConfirmSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error, needsEmailConfirmation } = await signUp(email, password, fullName);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    if (needsEmailConfirmation) {
      setConfirmSent(true);
      return;
    }
    navigate('/dashboard', { replace: true });
  };

  if (confirmSent) {
    return (
      <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex justify-center">
            <Logo variant="wordmark" />
          </div>
          <div className="card p-8">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-050 text-accent">
              <Icon name="checkCircle" size={22} />
            </span>
            <h1 className="mt-4 font-display text-xl font-semibold text-ink">Check your email</h1>
            <p className="mt-2 text-body leading-relaxed text-muted">
              We sent a confirmation link to <span className="font-medium text-ink-soft">{email}</span>.
              Click it to activate your account, then sign in.
            </p>
            <Link to="/login" className="btn btn-secondary mt-6 w-full">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthCard title="Create your account" subtitle="Rent or list a car on CX">
      <form onSubmit={onSubmit} className="mt-7 space-y-3.5">
        <AuthItem stop className="relative">
          <label className="sr-only" htmlFor="name">Full name</label>
          <Icon name="user" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input id="name" required autoComplete="name" placeholder="Full name" className="input !h-12 !pl-11 !text-[16px]" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </AuthItem>
        <AuthItem stop className="relative">
          <label className="sr-only" htmlFor="email">Email</label>
          <Icon name="message" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input id="email" type="email" required autoComplete="email" placeholder="Email address" className="input !h-12 !pl-11 !text-[16px]" value={email} onChange={(e) => setEmail(e.target.value)} />
        </AuthItem>
        <AuthItem stop className="relative">
          <label className="sr-only" htmlFor="password">Password</label>
          <Icon name="lock" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input id="password" type={showPassword ? 'text' : 'password'} required minLength={6} autoComplete="new-password" placeholder="Password (min. 6 characters)" className="input !h-12 !pl-11 !pr-12 !text-[16px]" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-faint transition-colors hover:text-ink">
            <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
          </button>
        </AuthItem>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-detail text-danger">{error}</p>}
        <AuthItem stop>
          <button type="submit" disabled={submitting} className="btn btn-glint btn-primary btn-block btn-lg" {...(submitting ? {} : createAccountScramble)}>
            <span className="btn-glint__sweep" aria-hidden="true" />
            {submitting ? 'Creating account…' : createAccountScramble.display}
            {!submitting && <Icon name="arrowRight" size={16} />}
          </button>
        </AuthItem>
        <AuthItem>
          <p className="text-center text-caption leading-relaxed text-muted">
            By creating an account you agree to our{' '}
            <Link to="/terms" className="font-medium text-ink underline underline-offset-2">Terms</Link> and{' '}
            <Link to="/privacy" className="font-medium text-ink underline underline-offset-2">Privacy Policy</Link>.
          </p>
        </AuthItem>
      </form>

      <AuthItem stop>
        <AuthDivider />
        <GoogleSignInButton label="Sign up with Google" />
      </AuthItem>

      <AuthItem stop>
        <p className="mt-6 text-center text-body text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-ink underline underline-offset-2">Sign in</Link>
        </p>
      </AuthItem>
    </AuthCard>
  );
}
