import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo, GoogleSignInButton, AuthDivider } from '../components/primitives';
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

  const perks = ['Verified hosts and renters', 'Payments protected inside CX', 'CX support when you need it'];

  return (
    <div className="container-page flex min-h-[78vh] items-center justify-center py-8 sm:py-14">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-line bg-surface shadow-pop lg:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <div className="relative hidden min-h-[560px] overflow-hidden bg-noir lg:block">
          <img
            src="/cx-hero-mediterranean-v2.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-80"
            loading="eager"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-noir via-noir/55 to-noir/10" />
          <div className="relative flex h-full flex-col justify-between p-9">
            <Logo />
            <div>
              <h2 className="font-display text-[2rem] font-bold leading-[1.1] tracking-tight text-on-noir">
                Your next drive is one sign-in away.
              </h2>
              <p className="mt-3 max-w-sm text-body text-on-noir/70">
                Book trusted cars across the Mediterranean — all inside the app.
              </p>
              <ul className="mt-6 space-y-2.5">
                {perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2.5 text-detail font-medium text-on-noir/90">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-bright text-noir">
                      <Icon name="check" size={12} strokeWidth={3} />
                    </span>
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col justify-center px-6 py-9 sm:px-12 sm:py-12">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-7 flex justify-center lg:hidden">
              <Logo />
            </div>
            <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-ink max-lg:text-center">Welcome back</h1>
            <p className="mt-1.5 text-body text-muted max-lg:text-center">Sign in to your CX account</p>

            <div className="mt-7">
              <GoogleSignInButton label="Sign in with Google" />
            </div>
            <AuthDivider />

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="field-label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="input !text-[16px]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    className="input !pr-12 !text-[16px]"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-faint transition-colors hover:text-ink"
                  >
                    <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
                  </button>
                </div>
              </div>
              {error && (
                <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-detail text-danger">{error}</p>
              )}
              <button type="submit" disabled={submitting} className="btn btn-glint btn-primary btn-block btn-lg" {...(submitting ? {} : signInScramble)}>
                <span className="btn-glint__sweep" aria-hidden="true" />
                {submitting ? 'Signing in…' : signInScramble.display}
                {!submitting && <Icon name="arrowRight" size={16} />}
              </button>
            </form>
            <p className="mt-6 text-center text-body text-muted">
              New to CX?{' '}
              <Link to="/signup" className="font-semibold text-ink underline underline-offset-2">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
