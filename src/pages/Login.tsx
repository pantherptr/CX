import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { CxsLogo } from '../components/CxsLogo';
import { motion, useReducedMotion, SPRING_SMOOTH } from '../components/motionKit';
import { useLocale } from '../lib/i18n';
import { GoogleSignInButton, AuthDivider } from '../components/primitives';
import { useAuth } from '../lib/auth';
import { useScramble } from '../lib/useScramble';


/** The card's light: a small car that drives around the card on its own.
 *  It has real-ish physics — throttle and braking along its heading, a
 *  steering angle that bites harder with speed, and tyre grip that lets the
 *  rear slide when it turns hard (drift): the body points one way while the
 *  car travels another, leaving fading skid marks. It aims for a random
 *  field, button or link (`data-car-stop`), pauses there, then goes again. */
function useCardLight(enabled: boolean) {
  const frame = useRef<HTMLDivElement>(null);
  const car = useRef<HTMLDivElement>(null);
  const skid = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = frame.current;
    const carEl = car.current;
    const canvas = skid.current;
    if (!el || !carEl || !canvas) return;
    if (!enabled) { carEl.style.display = 'none'; canvas.style.display = 'none'; return; }
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = el.offsetWidth * dpr;
      canvas.height = el.offsetHeight * dpr;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    let last = performance.now();
    const start = last;
    let x = el.offsetWidth * 0.5;
    let y = -6;
    let heading = Math.PI / 2; // radians, 0 = right, π/2 = down
    let vx = 0;
    let vy = 60;
    let target: { x: number; y: number } | null = null;
    let pauseUntil = 0;
    let lastStop: Element | null = null;
    let prevL: { x: number; y: number } | null = null;
    let prevR: { x: number; y: number } | null = null;

    const pickTarget = () => {
      const stops = Array.from(el.querySelectorAll('[data-car-stop]')).filter((n) => n !== lastStop);
      const stop = stops[Math.floor(Math.random() * stops.length)];
      if (!stop) return null;
      lastStop = stop;
      const f = el.getBoundingClientRect();
      const r = stop.getBoundingClientRect();
      const side = Math.random();
      const fx = side < 0.4 ? 0.08 + Math.random() * 0.15 : side < 0.8 ? 0.77 + Math.random() * 0.15 : 0.3 + Math.random() * 0.4;
      return { x: r.left - f.left + r.width * fx, y: r.top - f.top + r.height * (0.35 + Math.random() * 0.3) };
    };

    const loop = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const fx = Math.cos(heading);
      const fy = Math.sin(heading);

      // velocity in the car's own frame: forward / lateral (sideways slip)
      let fwd = vx * fx + vy * fy;
      let lat = -vx * fy + vy * fx;
      const speed = Math.hypot(vx, vy);

      let steer = 0;
      let throttle = 0;
      let grip = 7;

      if (!target && now >= pauseUntil) target = pickTarget();
      if (target) {
        const dx = target.x - x;
        const dy = target.y - y;
        const dist = Math.hypot(dx, dy);
        if (dist < 14) {
          target = null;
          pauseUntil = now + 800 + Math.random() * 1000;
        } else {
          const want = Math.atan2(dy, dx);
          const diff = ((want - heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
          steer = Math.max(-1, Math.min(1, diff * 2.2));
          const desired = Math.min(250, 55 + dist * 2.6);
          throttle = fwd < desired ? 1 : -0.8;
          // a hard corner at speed breaks the rear loose — the drift
          if (Math.abs(diff) > 0.75 && speed > 110) grip = 1.4;
          else if (Math.abs(lat) > 60) grip = 2.6;
        }
      } else {
        // parked: shed speed fast
        fwd *= Math.exp(-5 * dt);
        lat *= Math.exp(-5 * dt);
      }

      // engine / brake along the heading, light rolling drag
      fwd += throttle * 360 * dt;
      fwd *= Math.exp(-0.45 * dt);
      // tyre grip bleeds off the sideways velocity
      lat *= Math.exp(-grip * dt);

      // yaw: the steering angle turns the car in proportion to its speed
      const sp = Math.max(Math.abs(fwd), 28);
      heading += steer * 0.62 * (sp / 17) * dt * (fwd < -5 ? -1 : 1) * (grip < 3 ? 1.35 : 1);

      const nfx = Math.cos(heading);
      const nfy = Math.sin(heading);
      vx = fwd * nfx - lat * nfy;
      vy = fwd * nfy + lat * nfx;
      x += vx * dt;
      y += vy * dt;

      // bounce softly off the card's bounds
      if (x < -6 || x > w + 6) { vx *= -0.5; x = Math.max(-6, Math.min(w + 6, x)); }
      if (y < -6 || y > h + 6) { vy *= -0.5; y = Math.max(-6, Math.min(h + 6, y)); }

      carEl.style.transform = `translate(${x}px, ${y}px) rotate(${(heading * 180) / Math.PI}deg)`;
      el.style.setProperty('--beam-angle', `${(((now - start) / 9000) % 1) * 360}deg`);

      // skid marks while the rear is sliding; the whole layer slowly fades
      if (ctx) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,0.035)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        const sliding = Math.abs(lat) > 38;
        const rx = x - nfx * 7;
        const ry = y - nfy * 7;
        const L = { x: rx - nfy * 4.5, y: ry + nfx * 4.5 };
        const R = { x: rx + nfy * 4.5, y: ry - nfx * 4.5 };
        if (sliding && prevL && prevR) {
          ctx.strokeStyle = `rgba(22,22,26,${Math.min(0.32, Math.abs(lat) / 300)})`;
          ctx.lineWidth = 2.2;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(prevL.x, prevL.y); ctx.lineTo(L.x, L.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(prevR.x, prevR.y); ctx.lineTo(R.x, R.y); ctx.stroke();
        }
        prevL = sliding ? L : null;
        prevR = sliding ? R : null;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [enabled]);
  return { frame, car, skid };
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
  const { frame, car, skid } = useCardLight(!reduceMotion);
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
        <canvas ref={skid} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 h-full w-full" />
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
