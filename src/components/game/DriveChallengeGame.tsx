import { useEffect, useRef, useState } from 'react';
import type { GameSound } from './useGameAudio';

/**
 * The actual canvas game — code-split behind `React.lazy()` in
 * `DriveChallengeLauncher`, so none of this downloads until the player
 * taps "Play the Challenge".
 *
 * Deliberately plain `<canvas>` + `requestAnimationFrame`, no game
 * engine, no image/sprite assets, no audio files — every visual is a
 * drawn primitive and every sound is synthesized (`useGameAudio`). HUD
 * text is mutated directly via refs rather than React state: the loop
 * ticks ~60x/second and routing that through `setState` would re-render
 * the whole component every frame for no benefit.
 *
 * The loop itself never stops once mounted (see `active` below) — pause
 * and the pre-countdown "ready" moment both work by gating *simulation*
 * (elapsed time, spawning, scoring, collision) while still rendering and
 * re-scheduling every frame. That single gate is what keeps this one
 * `requestAnimationFrame` chain the only source of truth for "is the game
 * currently advancing", with no separate pause/resume bookkeeping and no
 * `dt` spike when play resumes (the wall-clock delta is computed every
 * frame regardless of whether simulation runs).
 *
 * `prefers-reduced-motion` is intentionally NOT used to slow or disable
 * the run itself — motion is the gameplay — but the purely decorative
 * touches (combo pop, high-speed camera jitter) are gated on it.
 */

const LANES = 3;
const CAR_W = 46;
const CAR_H = 74;
const MAX_COMBO = 5;
const LEFT_KEYS = new Set(['ArrowLeft', 'a', 'A']);
const RIGHT_KEYS = new Set(['ArrowRight', 'd', 'D']);

type EntityKind = 'car' | 'truck' | 'cone' | 'moving' | 'token' | 'shield' | 'multiplier' | 'boost';

interface Entity {
  kind: EntityKind;
  lane: number; // fractional — 'moving' obstacles drift this toward driftTarget
  driftTarget: number;
  drift: number; // 0 = static
  y: number;
  w: number;
  h: number;
}

export interface DriveChallengeResult {
  score: number;
  distance: number;
  maxCombo: number;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Continuous difficulty curve — a short easy window, then a steep
 *  climb to a hard cap. Reaching a reward-qualifying score means
 *  surviving deep into this curve, not just the opening seconds. */
function speedAt(t: number) {
  const ramp = Math.max(0, t - 3);
  return Math.min(920, 220 + ramp * 22);
}

function spawnEveryAt(t: number) {
  return Math.max(0.2, 0.85 - t * 0.023);
}

/** Obstacle variety unlocks progressively rather than all at once — cars
 *  only for the first ~6s, trucks join, cone clusters after 12s,
 *  drifting "moving" traffic once the run is already demanding (30s+). */
function pickObstacleKind(t: number): EntityKind {
  const pool: EntityKind[] = ['car'];
  if (t > 6) pool.push('car', 'truck');
  if (t > 12) pool.push('cone');
  if (t > 30) pool.push('moving', 'moving');
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function DriveChallengeGame({
  active,
  onFinish,
  play,
}: {
  /** True only while the phase is 'playing' — false during the
   *  pre-countdown mount and while paused. Gates simulation, not
   *  rendering or the animation-frame chain itself. */
  active: boolean;
  onFinish: (result: DriveChallengeResult) => void;
  play: (sound: GameSound) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreElRef = useRef<HTMLParagraphElement>(null);
  const scoreChipRef = useRef<HTMLDivElement>(null);
  const speedElRef = useRef<HTMLParagraphElement>(null);
  const comboElRef = useRef<HTMLParagraphElement>(null);
  const comboChipRef = useRef<HTMLDivElement>(null);
  const distanceElRef = useRef<HTMLParagraphElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const playRef = useRef(play);
  playRef.current = play;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ctx: CanvasRenderingContext2D = context;

    let raf = 0;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const laneX = (lane: number) => (width / LANES) * (lane + 0.5);
    const playerY = () => height - 120;

    let playerLane = 1;
    let currentLaneX = laneX(playerLane);
    let entities: Entity[] = [];
    let elapsed = 0;
    let sinceSpawn = 0;
    let score = 0;
    let combo = 1;
    let maxCombo = 1;
    let distanceUnits = 0;
    let dead = false;
    let shielded = false;
    let boostUntil = -1;
    let multiplierUntil = -1;
    let saveFlashUntil = -1;
    // A brief "impact hang" between the hit and the run actually ending —
    // gives the collision a beat to read instead of an instant hard cut.
    // Skipped entirely under reduced motion (crashElapsed exceeds the 0
    // threshold on the very next frame).
    let crashing = false;
    let crashElapsed = 0;
    let crashAt = { x: 0, y: 0 };
    const IMPACT_DURATION = reducedMotion ? 0 : 0.32;
    // Short-lived collect "pop" rings — bounded array, each entry expires
    // and is filtered out well under a second after spawning.
    let pickupFx: { x: number; y: number; bornAt: number }[] = [];
    let last = performance.now();

    const steer = (delta: number) => {
      if (!activeRef.current) return;
      playerLane = Math.min(LANES - 1, Math.max(0, playerLane + delta));
    };
    const onKey = (e: KeyboardEvent) => {
      if (LEFT_KEYS.has(e.key)) steer(-1);
      else if (RIGHT_KEYS.has(e.key)) steer(1);
    };
    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      steer(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onPointer);

    const spawnObstacle = (lane: number, kind: EntityKind) => {
      const size = kind === 'truck' ? { w: 58, h: 80 } : kind === 'cone' ? { w: 28, h: 32 } : { w: 48, h: 60 };
      const driftTarget = kind === 'moving' ? Math.min(LANES - 1, Math.max(0, lane + (Math.random() < 0.5 ? -1 : 1))) : lane;
      entities.push({ kind, lane, driftTarget, drift: kind === 'moving' ? 0.55 : 0, y: -50, w: size.w, h: size.h });
    };

    const pulse = (el: HTMLElement | null) => {
      if (!el || reducedMotion) return;
      el.classList.remove('animate-heart-pop');
      void el.offsetWidth; // restart the animation on repeat triggers
      el.classList.add('animate-heart-pop');
    };
    const pulseCombo = () => pulse(comboChipRef.current);
    const pulseScore = () => pulse(scoreChipRef.current);

    function loop(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (crashing && !dead) {
        crashElapsed += dt;
        if (crashElapsed > IMPACT_DURATION) dead = true;
      }

      const simulating = activeRef.current && !dead && !crashing;
      let speed = speedAt(elapsed);

      if (simulating) {
        elapsed += dt;
        speed = speedAt(elapsed) * (elapsed < boostUntil ? 1.35 : 1);
        sinceSpawn += dt;

        if (elapsed > 1.1 && sinceSpawn > spawnEveryAt(elapsed)) {
          sinceSpawn = 0;
          const roll = Math.random();
          if (roll < 0.04) {
            const p = Math.random();
            const kind: EntityKind = p < 0.34 ? 'shield' : p < 0.67 ? 'multiplier' : 'boost';
            entities.push({ kind, lane: Math.floor(Math.random() * LANES), driftTarget: 0, drift: 0, y: -40, w: 30, h: 30 });
          } else if (roll < 0.3) {
            entities.push({ kind: 'token', lane: Math.floor(Math.random() * LANES), driftTarget: 0, drift: 0, y: -40, w: 34, h: 34 });
          } else {
            const kind = pickObstacleKind(elapsed);
            if (kind === 'cone') {
              // Needle-thread pair: two of the three lanes get a cone,
              // leaving exactly one gap — tests precise lane holding
              // rather than a reactive dodge.
              const lanes = [0, 1, 2];
              const a = lanes.splice(Math.floor(Math.random() * lanes.length), 1)[0];
              const b = lanes[Math.floor(Math.random() * lanes.length)];
              spawnObstacle(a, 'cone');
              spawnObstacle(b, 'cone');
            } else {
              const firstLane = Math.floor(Math.random() * LANES);
              spawnObstacle(firstLane, kind);
              const waveChance = elapsed > 14 ? Math.min(0.6, (elapsed - 14) * 0.018) : 0;
              if (Math.random() < waveChance) {
                // Guaranteed distinct lane — otherwise a triggered wave
                // can silently coincide with the first obstacle and add
                // no real difficulty.
                const remaining = [0, 1, 2].filter((l) => l !== firstLane);
                const secondLane = remaining[Math.floor(Math.random() * remaining.length)];
                spawnObstacle(secondLane, pickObstacleKind(elapsed));
              }
            }
          }
        }

        const target = laneX(playerLane);
        currentLaneX += (target - currentLaneX) * Math.min(1, dt * 12);

        const boosted = elapsed < boostUntil;
        if (elapsed < multiplierUntil) combo = MAX_COMBO;
        score += dt * (18 + elapsed * 1.3) * combo * (boosted ? 1.5 : 1);
        distanceUnits += speed * dt;

        const px = laneX(playerLane);
        const py = playerY();
        const next: Entity[] = [];
        for (const e of entities) {
          if (e.drift > 0) e.lane += (e.driftTarget - e.lane) * Math.min(1, dt * e.drift);
          e.y += speed * dt;
          if (e.y > height + 50) continue;

          const ex = laneX(e.lane);
          const hit = Math.abs(e.y - py) < e.h * 0.5 + 18 && Math.abs(ex - px) < e.w * 0.5 + 20;
          if (hit) {
            if (e.kind === 'token') {
              const prev = combo;
              combo = Math.min(MAX_COMBO, combo + 1);
              score += 40 * combo;
              maxCombo = Math.max(maxCombo, combo);
              pickupFx.push({ x: ex, y: e.y, bornAt: elapsed });
              pulseScore();
              if (combo > prev) {
                playRef.current('combo');
                pulseCombo();
              } else {
                playRef.current('collect');
              }
              continue;
            }
            if (e.kind === 'shield') {
              shielded = true;
              pickupFx.push({ x: ex, y: e.y, bornAt: elapsed });
              playRef.current('powerup');
              continue;
            }
            if (e.kind === 'multiplier') {
              multiplierUntil = elapsed + 6;
              combo = MAX_COMBO;
              maxCombo = MAX_COMBO;
              pickupFx.push({ x: ex, y: e.y, bornAt: elapsed });
              playRef.current('powerup');
              pulseCombo();
              continue;
            }
            if (e.kind === 'boost') {
              boostUntil = elapsed + 4;
              pickupFx.push({ x: ex, y: e.y, bornAt: elapsed });
              playRef.current('powerup');
              continue;
            }
            // A real obstacle.
            if (shielded) {
              shielded = false;
              saveFlashUntil = elapsed + 0.25;
              continue; // discarded, run continues
            }
            if (!crashing) {
              crashing = true;
              crashAt = { x: px, y: py };
              playRef.current('crash');
            }
          }
          next.push(e);
        }
        entities = next;

        if (scoreElRef.current) scoreElRef.current.textContent = String(Math.floor(score));
        if (speedElRef.current) speedElRef.current.textContent = String(Math.round(speed * 0.75));
        if (comboElRef.current) comboElRef.current.textContent = `×${combo}`;
        if (distanceElRef.current) distanceElRef.current.textContent = (distanceUnits / 5000).toFixed(1);
      }

      // Pickup pop rings fade out over ~0.4s — filtered here rather than
      // in the simulation block above, since they must keep animating
      // even after `simulating` goes false (e.g. during the crash hang).
      const POP_FX_LIFE = 0.4;
      pickupFx = pickupFx.filter((fx) => elapsed - fx.bornAt < POP_FX_LIFE);

      // ---------------- render (every frame, active or not) ----------------
      const boostedNow = elapsed < boostUntil;
      let jx = 0;
      let jy = 0;
      if (crashing && !reducedMotion) {
        const shake = 7 * (1 - crashElapsed / Math.max(0.001, IMPACT_DURATION));
        jx = (Math.random() - 0.5) * shake;
        jy = (Math.random() - 0.5) * shake;
      } else if (!reducedMotion && speed > 620) {
        const jitter = Math.min(3, (speed - 620) / 60);
        jx = (Math.random() - 0.5) * jitter;
        jy = (Math.random() - 0.5) * jitter;
      }

      ctx.save();
      ctx.translate(jx, jy);

      ctx.fillStyle = '#0a0d0b';
      ctx.fillRect(-4, -4, width + 8, height + 8);

      ctx.strokeStyle = 'rgba(245,246,242,0.14)';
      ctx.lineWidth = 2;
      ctx.setLineDash([18, 22]);
      ctx.lineDashOffset = -((distanceUnits * 0.6) % 40);
      for (let i = 1; i < LANES; i++) {
        const x = (width / LANES) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Speed lines — density rises with speed, spikes further on boost.
      const lineHeat = Math.max(0, (speed - 380) / 380) + (boostedNow ? 0.5 : 0);
      if (lineHeat > 0.05) {
        const n = Math.min(9, Math.floor(lineHeat * 10));
        ctx.strokeStyle = `rgba(245,246,242,${Math.min(0.32, lineHeat * 0.26)})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < n; i++) {
          const lx = (i * 97 + Math.random() * 40) % width;
          const ly = (distanceUnits * 0.9 + i * 151) % (height + 60);
          ctx.beginPath();
          ctx.moveTo(lx, ly - 30 - lineHeat * 30);
          ctx.lineTo(lx, ly);
          ctx.stroke();
        }
      }

      for (const e of entities) {
        const x = laneX(e.lane);
        if (e.kind === 'token') {
          const grad = ctx.createRadialGradient(x, e.y, 2, x, e.y, 17);
          grad.addColorStop(0, 'rgba(0,212,71,0.95)');
          grad.addColorStop(1, 'rgba(0,212,71,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, e.y, 17, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#00d447';
          ctx.beginPath();
          ctx.arc(x, e.y, 6.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (e.kind === 'shield' || e.kind === 'multiplier' || e.kind === 'boost') {
          const grad = ctx.createRadialGradient(x, e.y, 2, x, e.y, 20);
          grad.addColorStop(0, 'rgba(0,212,71,0.55)');
          grad.addColorStop(1, 'rgba(0,212,71,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, e.y, 20, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#00d447';
          ctx.fillStyle = '#00d447';
          ctx.lineWidth = 2.2;
          if (e.kind === 'shield') {
            ctx.beginPath();
            ctx.moveTo(x, e.y - 10);
            ctx.lineTo(x + 8, e.y - 6);
            ctx.lineTo(x + 8, e.y + 3);
            ctx.quadraticCurveTo(x + 8, e.y + 10, x, e.y + 13);
            ctx.quadraticCurveTo(x - 8, e.y + 10, x - 8, e.y + 3);
            ctx.lineTo(x - 8, e.y - 6);
            ctx.closePath();
            ctx.stroke();
          } else if (e.kind === 'multiplier') {
            for (const dy of [-4, 4]) {
              ctx.beginPath();
              ctx.moveTo(x - 7, e.y + dy + 4);
              ctx.lineTo(x, e.y + dy - 3);
              ctx.lineTo(x + 7, e.y + dy + 4);
              ctx.stroke();
            }
          } else {
            ctx.beginPath();
            ctx.moveTo(x + 3, e.y - 12);
            ctx.lineTo(x - 6, e.y + 2);
            ctx.lineTo(x, e.y + 2);
            ctx.lineTo(x - 3, e.y + 12);
            ctx.lineTo(x + 7, e.y - 3);
            ctx.lineTo(x + 1, e.y - 3);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          ctx.fillStyle = '#1c1f1a';
          ctx.strokeStyle = 'rgba(224,64,47,0.55)';
          ctx.lineWidth = 1.5;
          if (e.kind === 'cone') {
            ctx.beginPath();
            ctx.moveTo(x, e.y - e.h / 2);
            ctx.lineTo(x + e.w / 2, e.y + e.h / 2);
            ctx.lineTo(x - e.w / 2, e.y + e.h / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else {
            roundRect(ctx, x - e.w / 2, e.y - e.h / 2, e.w, e.h, 10);
            ctx.fill();
            ctx.stroke();
            if (e.kind === 'moving') {
              ctx.strokeStyle = 'rgba(245,246,242,0.28)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x - e.w / 2 + 5, e.y);
              ctx.lineTo(x + e.w / 2 - 5, e.y);
              ctx.stroke();
            }
          }
        }
      }

      // Collect "pop" — a quick expanding, fading green ring at the pickup
      // point, giving token/power-up collection a real moment instead of
      // a silent instant disappearance.
      for (const fx of pickupFx) {
        const p = (elapsed - fx.bornAt) / POP_FX_LIFE;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.strokeStyle = '#00d447';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 8 + p * 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Impact flash at the crash site, fading over the hang window.
      if (crashing) {
        const p = Math.min(1, crashElapsed / Math.max(0.001, IMPACT_DURATION));
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.strokeStyle = '#e0402f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(crashAt.x, crashAt.y, 18 + p * 48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const px = currentLaneX;
      const py = playerY();
      const shieldSaving = elapsed < saveFlashUntil;
      ctx.save();
      ctx.shadowColor = boostedNow ? 'rgba(0,212,71,0.55)' : 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = boostedNow ? 26 : 18;
      ctx.shadowOffsetY = boostedNow ? 0 : 10;
      ctx.fillStyle = dead || crashing ? '#e0402f' : shieldSaving || shielded ? '#00d447' : '#f5f6f2';
      roundRect(ctx, px - CAR_W / 2, py - CAR_H / 2, CAR_W, CAR_H, 12);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#0a0d0b';
      roundRect(ctx, px - CAR_W / 2 + 8, py - CAR_H / 2 + 12, CAR_W - 16, 22, 6);
      ctx.fill();

      ctx.restore();

      if (!dead) {
        raf = requestAnimationFrame(loop);
      } else {
        onFinishRef.current({
          score: Math.floor(score),
          distance: Math.round((distanceUnits / 5000) * 10) / 10,
          maxCombo,
        });
      }
    }

    setReady(true);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <div className="relative h-full w-full touch-none select-none overscroll-none">
      <canvas ref={canvasRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-4 top-4 flex gap-2">
        <div ref={scoreChipRef} className="rounded-xl bg-black/50 px-3.5 py-2 backdrop-blur">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-white/55">Score</p>
          <p ref={scoreElRef} className="font-display text-xl font-semibold tabular-nums text-white">
            0
          </p>
        </div>
        <div ref={comboChipRef} className="rounded-xl bg-black/50 px-3.5 py-2 backdrop-blur">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-white/55">Combo</p>
          <p ref={comboElRef} className="font-display text-xl font-semibold tabular-nums text-accent-bright">
            &times;1
          </p>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-4 flex gap-2">
        <div className="rounded-xl bg-black/50 px-3.5 py-2 text-right backdrop-blur">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-white/55">Speed</p>
          <p ref={speedElRef} className="font-display text-xl font-semibold tabular-nums text-white">
            0<span className="ml-0.5 text-[11px] font-medium text-white/45">km/h</span>
          </p>
        </div>
        <div className="rounded-xl bg-black/50 px-3.5 py-2 text-right backdrop-blur">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-white/55">Distance</p>
          <p ref={distanceElRef} className="font-display text-xl font-semibold tabular-nums text-white">
            0.0<span className="ml-0.5 text-[11px] font-medium text-white/45">km</span>
          </p>
        </div>
      </div>

      {ready && (
        <>
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-2xl text-white/20 sm:hidden">
            &lsaquo;
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-2xl text-white/20 sm:hidden">
            &rsaquo;
          </span>
          <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[12.5px] font-medium text-white/45">
            <span className="hidden sm:inline">Steer with ← → or A / D</span>
            <span className="sm:hidden">Tap left or right to steer</span>
          </p>
        </>
      )}
    </div>
  );
}
