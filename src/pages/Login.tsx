import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { CxsLogo } from '../components/CxsLogo';
import { motion, useReducedMotion, SPRING_SMOOTH } from '../components/motionKit';
import { useLocale } from '../lib/i18n';
import { GoogleSignInButton, AuthDivider } from '../components/primitives';
import { useAuth } from '../lib/auth';
import { useScramble } from '../lib/useScramble';


/** The card's light: a small car that drives around the card on its own —
 *  steering toward a random field, button or link, slowing as it arrives,
 *  pausing a moment, then picking somewhere else. Elements opt in with
 *  `data-car-stop`. The edge beam turns on its own, slowly. */
function useCardLight(enabled: boolean) {
  const frame = useRef<HTMLDivElement>(null);
  const car = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = frame.current;
    const carEl = car.current;
    if (!el || !carEl) return;
    if (!enabled) { carEl.style.display = 'none'; return; }

    let raf = 0;
    let last = performance.now();
    const start = last;
    let x = el.offsetWidth * 0.5;
    let y = -6;
    let heading = 90; // degrees, 0 = right, 90 = down
    let target: { x: number; y: number } | null = null;
    let pauseUntil = 0;
    let lastStop: Element | null = null;

    const pickTarget = () => {
      const stops = Array.from(el.querySelectorAll('[data-car-stop]')).filter((n) => n !== lastStop);
      const stop = stops[Math.floor(Math.random() * stops.length)];
      if (!stop) return null;
      lastStop = stop;
      const f = el.getBoundingClientRect();
      const r = stop.getBoundingClientRect();
      // land somewhere on the element, favouring its ends so the car reads as "parking" beside it
      const side = Math.random();
      const fx = side < 0.4 ? 0.1 + Math.random() * 0.15 : side < 0.8 ? 0.75 + Math.random() * 0.15 : 0.3 + Math.random() * 0.4;
      return { x: r.left - f.left + r.width * fx, y: r.top - f.top + r.height * (0.35 + Math.random() * 0.3) };
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = el.offsetWidth;
      const h = el.offsetHeight;

      if (!target && now >= pauseUntil) target = pickTarget();
      if (target) {
        const dx = target.x - x;
        const dy = target.y - y;
        const dist = Math.hypot(dx, dy);
        if (dist < 6) {
          target = null;
          pauseUntil = now + 700 + Math.random() * 900;
        } else {
          const want = (Math.atan2(dy, dx) * 180) / Math.PI;
          let diff = ((want - heading + 540) % 360) - 180;
          // car-like steering: a limited turn rate, so it swings through curves
          const maxTurn = 200 * dt;
          diff = Math.max(-maxTurn, Math.min(maxTurn, diff));
          heading += diff;
          const speed = Math.min(150, 40 + dist * 1.6) * (Math.abs(diff) > maxTurn * 0.9 ? 0.6 : 1);
          x += Math.cos((heading * Math.PI) / 180) * speed * dt;
          y += Math.sin((heading * Math.PI) / 180) * speed * dt;
        }
      }
      x = Math.max(-8, Math.min(w + 8, x));
      y = Math.max(-8, Math.min(h + 8, y));
      carEl.style.transform = `translate(${x}px, ${y}px) rotate(${heading}deg)`;
      el.style.setProperty('--beam-angle', `${(((now - start) / 9000) % 1) * 360}deg`);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
  return { frame, car };
}

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
  const { frame, car } = useCardLight(!reduceMotion);
  const tilt = useRef<HTMLDivElement>(null);
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || e.pointerType === 'touch') return;
    const box = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - box.left) / box.width;
    const py = (e.clientY - box.top) / box.height;
    if (tilt.current) tilt.current.style.transform = `perspective(1100px) rotateX(${(0.5 - py) * 5}deg) rotateY(${(px - 0.5) * 6}deg)`;
    frame.current?.style.setProperty('--mx', `${px * 100}%`);
    frame.current?.style.setProperty('--my', `${py * 100}%`);
  };
  const onPointerLeave = () => { if (tilt.current) tilt.current.style.transform = ''; };

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

      <div aria-hidden="true" className="auth-aurora pointer-events-none absolute -z-10 h-[420px] w-[420px] rounded-full bg-accent-bright/15 blur-[90px]" />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: 28 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={SPRING_SMOOTH}
        className="w-full max-w-[420px]"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
      <div ref={tilt} className="transition-transform duration-200 ease-out [transform-style:preserve-3d]">
      <div ref={frame} className="auth-beam relative">
        <div ref={car} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-20 will-change-transform">
          <svg width="30" height="16" viewBox="0 0 30 16" className="-translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_8px_rgba(0,212,71,0.85)]">
            <rect x="1" y="2" width="26" height="12" rx="5" fill="#16161a" />
            <rect x="15" y="4" width="7" height="8" rx="2" fill="#e8faec" />
            <rect x="6" y="4" width="5" height="8" rx="1.5" fill="#e8faec" opacity="0.5" />
            <circle cx="27" cy="4.5" r="1.6" fill="#00d447" />
            <circle cx="27" cy="11.5" r="1.6" fill="#00d447" />
          </svg>
        </div>
        <motion.div variants={group} initial="hidden" animate="show" className="relative overflow-hidden rounded-[28px] bg-surface p-7 shadow-pop sm:p-9">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 [@media(hover:hover)]:opacity-100" style={{ background: 'radial-gradient(260px circle at var(--mx, 50%) var(--my, 0%), rgba(0,212,71,0.10), transparent 70%)' }} />
          <motion.div variants={rise} data-car-stop className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-line bg-surface shadow-hair">
            <CxsLogo size={30} />
          </motion.div>

          <h1 aria-label={title} data-car-stop className="mt-5 text-center font-display text-[1.9rem] font-bold leading-tight tracking-tight text-ink">
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
            <motion.div variants={rise} data-car-stop className="relative">
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
            <motion.div variants={rise} data-car-stop className="relative">
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
              <button type="submit" data-car-stop disabled={submitting} className="btn btn-glint btn-primary btn-block btn-lg" {...(submitting ? {} : signInScramble)}>
                <span className="btn-glint__sweep" aria-hidden="true" />
                {submitting ? 'Signing in…' : signInScramble.display}
                {!submitting && <Icon name="arrowRight" size={16} />}
              </button>
            </motion.div>
          </motion.form>

          <motion.div variants={rise} data-car-stop>
            <AuthDivider />
            <GoogleSignInButton label="Sign in with Google" />
          </motion.div>

          <motion.p variants={rise} data-car-stop className="mt-6 text-center text-body text-muted">
            New to CX?{' '}
            <Link to="/signup" className="font-semibold text-ink underline underline-offset-2">
              Create an account
            </Link>
          </motion.p>
        </motion.div>
      </div>
      </div>
      </motion.div>
    </div>
  );
}
