import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { CxsLogo } from '../components/CxsLogo';
import { motion, useReducedMotion, SPRING_SMOOTH } from '../components/motionKit';
import { useLocale } from '../lib/i18n';
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

  const { t } = useLocale();
  const reduceMotion = useReducedMotion();
  const title = t('Welcome back');

  // Everything on the card arrives in sequence: the mark, then the title
  // letter by letter, then the fields and buttons rising in behind it.
  const rise = {
    hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 16, filter: 'blur(6px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: SPRING_SMOOTH },
  };
  const group = { hidden: {}, show: { transition: { staggerChildren: reduceMotion ? 0 : 0.09, delayChildren: 0.15 } } };
  const letter = {
    hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 14, filter: 'blur(8px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring' as const, stiffness: 260, damping: 22 } },
  };

  return (
    <div className="relative isolate flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-10">
      {/* soft light field behind the card */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(0,212,71,0.10),transparent_70%),radial-gradient(50%_40%_at_90%_100%,rgba(0,133,54,0.07),transparent_70%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5] [background-image:radial-gradient(rgba(22,22,26,0.07)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]" />

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={SPRING_SMOOTH}
        className="auth-beam w-full max-w-[420px]"
      >
        <motion.div variants={group} initial="hidden" animate="show" className="relative rounded-[28px] bg-surface p-7 shadow-pop sm:p-9">
          <motion.div variants={rise} className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-line bg-surface shadow-hair">
            <CxsLogo size={30} />
          </motion.div>

          <h1 aria-label={title} className="mt-5 text-center font-display text-[1.9rem] font-bold leading-tight tracking-tight text-ink">
            <motion.span variants={group} className="inline-block" aria-hidden="true">
              {Array.from(title).map((ch, i) => (
                <motion.span key={i} variants={letter} className="inline-block whitespace-pre">
                  {ch}
                </motion.span>
              ))}
            </motion.span>
          </h1>
          <motion.p variants={rise} className="mt-1.5 text-center text-body text-muted">Sign in to your CX account</motion.p>

          <motion.form variants={group} onSubmit={onSubmit} className="mt-7 space-y-3.5">
            <motion.div variants={rise} className="relative">
              <label className="sr-only" htmlFor="email">Email</label>
              <Icon name="message" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="Email address"
                className="input !h-12 !pl-11 !text-[16px]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </motion.div>
            <motion.div variants={rise} className="relative">
              <label className="sr-only" htmlFor="password">Password</label>
              <Icon name="lock" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Password"
                className="input !h-12 !pl-11 !pr-12 !text-[16px]"
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
            </motion.div>
            {error && (
              <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-detail text-danger">{error}</p>
            )}
            <motion.div variants={rise}>
              <button type="submit" disabled={submitting} className="btn btn-glint btn-primary btn-block btn-lg" {...(submitting ? {} : signInScramble)}>
                <span className="btn-glint__sweep" aria-hidden="true" />
                {submitting ? 'Signing in…' : signInScramble.display}
                {!submitting && <Icon name="arrowRight" size={16} />}
              </button>
            </motion.div>
          </motion.form>

          <motion.div variants={rise}>
            <AuthDivider />
            <GoogleSignInButton label="Sign in with Google" />
          </motion.div>

          <motion.p variants={rise} className="mt-6 text-center text-body text-muted">
            New to CX?{' '}
            <Link to="/signup" className="font-semibold text-ink underline underline-offset-2">
              Create an account
            </Link>
          </motion.p>
        </motion.div>
      </motion.div>
    </div>
  );
}
