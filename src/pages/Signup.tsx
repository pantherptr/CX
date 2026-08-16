import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo } from '../components/primitives';
import { useAuth } from '../lib/auth';

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

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
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
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
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-7 sm:p-8">
          <h1 className="text-center font-display text-2xl font-semibold text-ink">Create your account</h1>
          <p className="mt-1.5 text-center text-[14px] text-muted">Rent or list a car on CX</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <label className="field-label" htmlFor="name">
                Full name
              </label>
              <input
                id="name"
                required
                autoComplete="name"
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
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
                minLength={6}
                autoComplete="new-password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-[13.5px] text-danger">{error}</p>
            )}
            <button type="submit" disabled={submitting} className="btn btn-primary btn-block btn-lg">
              {submitting ? 'Creating account…' : 'Create account'}
              {!submitting && <Icon name="arrowRight" size={16} />}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-[14px] text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-ink underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
