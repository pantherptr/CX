import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, SPRING_SMOOTH } from './motionKit';
import { FlyingMark } from './FlyingMark';
import { useLocale } from '../lib/i18n';

/** The shared sign-in / sign-up card: a white card on a soft light field
 *  with a staggered entrance, a pointer tilt + spotlight, a turning edge
 *  beam, and a small car that drives around the card on its own.
 *
 *  The car is a little driving sim. Most of the time it just *drives* —
 *  smooth steering that eases in, braking for corners, brake lights, and a
 *  neat stop at its destination. Now and then it picks a "sideways" run:
 *  it carries speed into a corner, breaks the rear loose and slides
 *  through it, leaving skid marks and a puff of tyre smoke. Destinations
 *  are any element tagged `data-car-stop` (see `AuthItem`). */

type Pt = { x: number; y: number };

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
    let heading = Math.PI / 2; // 0 = right, π/2 = down
    let vx = 0;
    let vy = 70;
    let steerAngle = 0; // the actual front-wheel angle, which lags the input
    let target: Pt | null = null;
    let driftRun = false;
    let pauseUntil = 0;
    let lastStop: Element | null = null;
    let tripsSinceDrift = 0;
    let prevL: Pt | null = null;
    let prevR: Pt | null = null;

    const pickTarget = (): Pt | null => {
      const stops = Array.from(el.querySelectorAll('[data-car-stop]')).filter((n) => n !== lastStop);
      const stop = stops[Math.floor(Math.random() * stops.length)];
      if (!stop) return null;
      lastStop = stop;
      const f = el.getBoundingClientRect();
      const r = stop.getBoundingClientRect();
      const side = Math.random();
      const fx = side < 0.4 ? 0.08 + Math.random() * 0.15 : side < 0.8 ? 0.77 + Math.random() * 0.15 : 0.3 + Math.random() * 0.4;
      // roughly one trip in four is a sideways run, never two in a row
      tripsSinceDrift += 1;
      driftRun = tripsSinceDrift >= 2 && Math.random() < 0.45;
      if (driftRun) tripsSinceDrift = 0;
      return { x: r.left - f.left + r.width * fx, y: r.top - f.top + r.height * (0.35 + Math.random() * 0.3) };
    };

    const loop = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const fx = Math.cos(heading);
      const fy = Math.sin(heading);

      let fwd = vx * fx + vy * fy; // along the body
      let lat = -vx * fy + vy * fx; // sideways slip
      const speed = Math.hypot(vx, vy);

      let steerInput = 0;
      let throttle = 0;
      let grip = 8;
      let braking = false;

      if (!target && now >= pauseUntil) target = pickTarget();
      if (target) {
        const dx = target.x - x;
        const dy = target.y - y;
        const dist = Math.hypot(dx, dy);
        if (dist < 14) {
          target = null;
          pauseUntil = now + 900 + Math.random() * 1200;
        } else {
          const want = Math.atan2(dy, dx);
          const diff = ((want - heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
          const turn = Math.abs(diff);
          steerInput = Math.max(-1, Math.min(1, diff * 1.8));

          // Cruise speed: slow for tight corners, ease off into the stop.
          const cornerFactor = driftRun ? 1 : Math.max(0.35, 1 - turn / 2.2);
          const vMax = driftRun ? 240 : 175;
          const desired = Math.min(vMax * cornerFactor, 40 + dist * 2.1);
          if (fwd < desired - 6) throttle = 1;
          else if (fwd > desired + 8) { throttle = -1; braking = true; }

          if (driftRun) {
            // turn in hot: kick the rear out, then hold the slide until pointed back
            if (turn > 0.6 && speed > 130) grip = 1.3;
            else if (Math.abs(lat) > 55) grip = 2.4;
          }
        }
      } else {
        // parked: roll to a halt
        fwd *= Math.exp(-4.5 * dt);
        lat *= Math.exp(-6 * dt);
        braking = Math.abs(fwd) > 12;
      }

      // front wheels turn toward the input with a little inertia
      steerAngle += (steerInput * 0.6 - steerAngle) * Math.min(1, dt * (driftRun && grip < 3 ? 9 : 4.5));

      fwd += throttle * (throttle > 0 ? 330 : 480) * dt;
      fwd *= Math.exp(-0.45 * dt);
      lat *= Math.exp(-grip * dt);

      // bicycle-model yaw: needs speed to turn; counter-steers in a slide
      const sp = Math.max(Math.abs(fwd), 24);
      let yaw = (steerAngle * sp) / 17;
      if (grip < 3) yaw *= 1.3;
      heading += yaw * dt * (fwd < -5 ? -1 : 1);

      const nfx = Math.cos(heading);
      const nfy = Math.sin(heading);
      vx = fwd * nfx - lat * nfy;
      vy = fwd * nfy + lat * nfx;
      x += vx * dt;
      y += vy * dt;

      if (x < -6 || x > w + 6) { vx *= -0.5; x = Math.max(-6, Math.min(w + 6, x)); }
      if (y < -6 || y > h + 6) { vy *= -0.5; y = Math.max(-6, Math.min(h + 6, y)); }

      // slight body roll in corners
      const roll = Math.max(-1, Math.min(1, (steerAngle * speed) / 130)) * 2.5;
      carEl.style.transform = `translate(${x}px, ${y}px) rotate(${(heading * 180) / Math.PI}deg) skewY(${roll}deg)`;
      carEl.style.setProperty('--brake', braking ? '1' : '0.25');
      el.style.setProperty('--beam-angle', `${(((now - start) / 9000) % 1) * 360}deg`);

      if (ctx) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,0.035)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        const slip = Math.abs(lat);
        const sliding = slip > 38;
        const rx = x - nfx * 7;
        const ry = y - nfy * 7;
        const L = { x: rx - nfy * 4.5, y: ry + nfx * 4.5 };
        const R = { x: rx + nfy * 4.5, y: ry - nfx * 4.5 };
        if (sliding && prevL && prevR) {
          ctx.strokeStyle = `rgba(22,22,26,${Math.min(0.34, slip / 280)})`;
          ctx.lineWidth = 2.2;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(prevL.x, prevL.y); ctx.lineTo(L.x, L.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(prevR.x, prevR.y); ctx.lineTo(R.x, R.y); ctx.stroke();
          // tyre smoke
          ctx.fillStyle = 'rgba(120,124,120,0.10)';
          ctx.beginPath(); ctx.arc(rx + (Math.random() - 0.5) * 6, ry + (Math.random() - 0.5) * 6, 4 + Math.random() * 5, 0, Math.PI * 2); ctx.fill();
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

const group = (reduce: boolean | null) => ({ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: 0.15 } } });

/** One staggered row of the card. `stop` makes it a place the car may drive to. */
export function AuthItem({ children, stop = false, className = '' }: { children: ReactNode; stop?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={{
        hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 16, filter: 'blur(6px)' },
        show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: SPRING_SMOOTH },
      }}
      {...(stop ? { 'data-car-stop': true } : {})}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useLocale();
  const reduceMotion = useReducedMotion();
  const heading = t(title);
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

  const letter = {
    hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 14, filter: 'blur(8px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring' as const, stiffness: 260, damping: 22 } },
  };

  return (
    <div className="relative isolate flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-10">
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
                <rect x="0.5" y="3.5" width="1.6" height="3" rx="0.8" fill="#ff3b30" style={{ opacity: 'var(--brake, 0.25)' }} />
                <rect x="0.5" y="9.5" width="1.6" height="3" rx="0.8" fill="#ff3b30" style={{ opacity: 'var(--brake, 0.25)' }} />
              </svg>
            </div>

            <motion.div variants={group(reduceMotion)} initial="hidden" animate="show" className="relative overflow-hidden rounded-[28px] bg-surface p-7 shadow-pop sm:p-9">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 [@media(hover:hover)]:opacity-100" style={{ background: 'radial-gradient(260px circle at var(--mx, 50%) var(--my, 0%), rgba(0,212,71,0.10), transparent 70%)' }} />

              <AuthItem stop className="mx-auto w-fit">
                <FlyingMark src="/brand/cx-bat-man.webp" alt="CX" width={200} height={95} className="h-[96px] pb-2" shadow />
              </AuthItem>

              <h1 aria-label={heading} data-car-stop className="mt-5 text-center font-display text-[1.9rem] font-bold leading-tight tracking-tight text-ink">
                <motion.span variants={group(reduceMotion)} className="inline-block" aria-hidden="true">
                  {Array.from(heading).map((ch, i) => (
                    <motion.span key={i} variants={letter} className="inline-block whitespace-pre">
                      {ch}
                    </motion.span>
                  ))}
                </motion.span>
              </h1>
              <AuthItem><p className="mt-1.5 text-center text-body text-muted">{subtitle}</p></AuthItem>

              {children}
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
