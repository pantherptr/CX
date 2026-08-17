import { useEffect, useRef, useState } from 'react';
import type { GameSound } from './useGameAudio';

/**
 * The actual canvas game — code-split behind `React.lazy()` in
 * `DriveChallengeLauncher`, so none of this downloads until the player
 * taps "Play the Challenge".
 *
 * Deliberately plain `<canvas>` + `requestAnimationFrame`, no game
 * engine, no sprite sheets, no audio files — every visual is a drawn
 * primitive (layered gradients, paths and a small particle system) and
 * every sound is synthesized (`useGameAudio`). The one real asset is the
 * official CX logo, drawn onto the player car's grille via `drawImage`
 * rather than redrawn by hand. HUD text is mutated directly via refs
 * rather than React state: the loop ticks ~60x/second and routing that
 * through `setState` would re-render the whole component every frame
 * for no benefit.
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
 * IMPORTANT: every number that feeds scoring, rewards or difficulty
 * (`speedAt`, `spawnEveryAt`, `pickObstacleKind`, the score/combo/shield
 * formulas, the collision hit-test) is untouched from the previous
 * version of this file — this pass only changes how frames are *drawn*.
 * Anything purely cosmetic (particles, near-miss grazes, car lean) is
 * clearly separated from the simulation block below.
 *
 * `prefers-reduced-motion` is intentionally NOT used to slow or disable
 * the run itself — motion is the gameplay — but the purely decorative
 * touches (combo pop, high-speed camera jitter, particles, screen shake)
 * are gated on it.
 */

const LANES = 3;
const CAR_W = 52;
const CAR_H = 82;
const MAX_COMBO = 5;
const LEFT_KEYS = new Set(['ArrowLeft', 'a', 'A']);
const RIGHT_KEYS = new Set(['ArrowRight', 'd', 'D']);

// Traffic gets a fixed, varied, candy-bright palette — deliberately clear
// of white (the player's own color) and red (crash/danger) so at a glance
// nothing is confusable with "you" or "you just crashed".
const TRAFFIC_PALETTE = ['#2f8fe0', '#f5b73a', '#a06be0', '#2fb894', '#e0568f', '#f57b3a'];

type EntityKind = 'car' | 'truck' | 'cone' | 'moving' | 'token' | 'shield' | 'multiplier' | 'boost';

interface Entity {
  kind: EntityKind;
  lane: number; // fractional — 'moving' obstacles drift this toward driftTarget
  driftTarget: number;
  drift: number; // 0 = static
  y: number;
  w: number;
  h: number;
  /** Assigned once at spawn for traffic — purely visual variety. */
  color?: string;
  /** Cosmetic-only "you nearly hit this" flag so the graze effect fires once. */
  grazed?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  mode: 'dot' | 'streak';
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

/** Lightens (positive) or darkens (negative) a `#rrggbb` color — used to
 *  build the player car's paint gradient from a single base tone. */
function shade(hex: string, percent: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const r = clamp(((n >> 16) & 0xff) + Math.round(2.55 * percent));
  const g = clamp(((n >> 8) & 0xff) + Math.round(2.55 * percent));
  const b = clamp((n & 0xff) + Math.round(2.55 * percent));
  return `rgb(${r},${g},${b})`;
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
  bestScore = 0,
}: {
  /** True only while the phase is 'playing' — false during the
   *  pre-countdown mount and while paused. Gates simulation, not
   *  rendering or the animation-frame chain itself. */
  active: boolean;
  onFinish: (result: DriveChallengeResult) => void;
  play: (sound: GameSound) => void;
  /** Personal best going into this run — shown as a HUD target, and the
   *  score chip flashes once the live score actually clears it. Purely
   *  a display value, never fed back into scoring. */
  bestScore?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreElRef = useRef<HTMLParagraphElement>(null);
  const scoreChipRef = useRef<HTMLDivElement>(null);
  const bestElRef = useRef<HTMLParagraphElement>(null);
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
    // `window.resize` alone misses two real cases: the container's own
    // flex layout settling right after mount (before any window event
    // fires), and iOS Safari's address bar show/hide, which resizes the
    // *visual* viewport without always firing a plain `resize` event —
    // the canvas would otherwise keep the stale pre-toolbar-change size
    // until the next unrelated resize. Both are covered on top of the
    // window listener below.
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.visualViewport?.addEventListener('resize', resize);

    // The one real image asset — the official CX mark, badged onto the
    // player car's grille. Loaded once; `drawImage` on an undecoded
    // image is simply a no-op until `complete` flips true.
    const logoImg = new Image();
    logoImg.src = '/cx-logo-symbol.png';

    const laneX = (lane: number) => (width / LANES) * (lane + 0.5);
    const playerY = () => height - 120;

    let playerLane = 1;
    let currentLaneX = laneX(playerLane);
    let prevLane = playerLane;
    let carTilt = 0;
    let entities: Entity[] = [];
    let particles: Particle[] = [];
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
    let boostFxTimer = 0;
    let recordBroken = false;
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
      const color =
        kind === 'car' || kind === 'truck' || kind === 'moving'
          ? TRAFFIC_PALETTE[Math.floor(Math.random() * TRAFFIC_PALETTE.length)]
          : undefined;
      entities.push({ kind, lane, driftTarget, drift: kind === 'moving' ? 0.55 : 0, y: -50, w: size.w, h: size.h, color });
    };

    const pulse = (el: HTMLElement | null) => {
      if (!el || reducedMotion) return;
      el.classList.remove('animate-heart-pop');
      void el.offsetWidth; // restart the animation on repeat triggers
      el.classList.add('animate-heart-pop');
    };
    const pulseCombo = () => pulse(comboChipRef.current);
    const pulseScore = () => pulse(scoreChipRef.current);

    // ------------------------- particles (cosmetic only) -------------------------
    const spawnBurst = (
      x: number,
      y: number,
      n: number,
      opts: { spread?: number; speed?: number; size?: number; color: string; life?: number; mode?: 'dot' | 'streak' },
    ) => {
      if (reducedMotion) return;
      const { spread = Math.PI * 2, speed = 140, size = 3, color, life = 0.5, mode = 'dot' } = opts;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
        const v = speed * (0.5 + Math.random() * 0.7);
        particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life,
          maxLife: life,
          size: size * (0.6 + Math.random() * 0.8),
          color,
          mode,
        });
      }
      if (particles.length > 160) particles.splice(0, particles.length - 160);
    };

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

        // Cosmetic: lean the car into the turn, proportional to how far
        // it still has to travel to the target lane, then settle.
        const laneW = width / LANES;
        const leanTarget = Math.min(0.24, Math.max(-0.24, ((target - currentLaneX) / laneW) * 0.55));
        carTilt += (leanTarget - carTilt) * Math.min(1, dt * 9);

        // Cosmetic: a couple of tire-smoke puffs the instant a lane
        // change actually starts — compared against last frame's lane,
        // not the (already-lerping) visual position.
        if (playerLane !== prevLane) {
          spawnBurst(currentLaneX, playerY() + CAR_H * 0.32, 5, {
            spread: 1.6,
            speed: 55,
            size: 5,
            color: 'rgba(210,210,204,0.55)',
            life: 0.5,
          });
          prevLane = playerLane;
        }

        const boosted = elapsed < boostUntil;
        if (boosted) {
          boostFxTimer -= dt;
          if (boostFxTimer <= 0) {
            boostFxTimer = 0.045;
            spawnBurst(currentLaneX + (Math.random() - 0.5) * CAR_W * 0.5, playerY() + CAR_H * 0.42, 1, {
              spread: 0.7,
              speed: 95,
              size: 4.2,
              color: Math.random() < 0.5 ? '#00d447' : '#eaffef',
              life: 0.32,
            });
          }
        }
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
              spawnBurst(ex, e.y, 6, { spread: Math.PI * 2, speed: 80, size: 2.4, color: '#7dffb0', life: 0.4 });
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
              spawnBurst(ex, e.y, 8, { spread: Math.PI * 2, speed: 90, size: 2.6, color: '#7dffb0', life: 0.45 });
              playRef.current('powerup');
              continue;
            }
            if (e.kind === 'multiplier') {
              multiplierUntil = elapsed + 6;
              combo = MAX_COMBO;
              maxCombo = MAX_COMBO;
              pickupFx.push({ x: ex, y: e.y, bornAt: elapsed });
              spawnBurst(ex, e.y, 8, { spread: Math.PI * 2, speed: 90, size: 2.6, color: '#7dffb0', life: 0.45 });
              playRef.current('powerup');
              pulseCombo();
              continue;
            }
            if (e.kind === 'boost') {
              boostUntil = elapsed + 4;
              pickupFx.push({ x: ex, y: e.y, bornAt: elapsed });
              spawnBurst(ex, e.y, 8, { spread: Math.PI * 2, speed: 90, size: 2.6, color: '#7dffb0', life: 0.45 });
              playRef.current('powerup');
              continue;
            }
            // A real obstacle.
            if (shielded) {
              shielded = false;
              saveFlashUntil = elapsed + 0.25;
              spawnBurst(ex, e.y, 10, { spread: Math.PI * 2, speed: 130, size: 3, color: '#00d447', life: 0.4 });
              continue; // discarded, run continues
            }
            if (!crashing) {
              crashing = true;
              crashAt = { x: px, y: py };
              playRef.current('crash');
              spawnBurst(px, py, 18, { spread: Math.PI * 2, speed: 230, size: 3.4, color: '#ffb199', life: 0.55 });
              spawnBurst(px, py, 7, { spread: 1.4, speed: 55, size: 8, color: 'rgba(50,48,44,0.55)', life: 0.9 });
            }
          } else if (
            !e.grazed &&
            (e.kind === 'car' || e.kind === 'truck' || e.kind === 'cone' || e.kind === 'moving') &&
            Math.abs(e.y - py) < e.h * 0.5 + 26 &&
            Math.abs(ex - px) < e.w * 0.5 + 30
          ) {
            // Cosmetic-only "close call" — a bit wider than the real
            // hitbox above, flagged once per entity so it can't spam.
            e.grazed = true;
            spawnBurst((ex + px) / 2, e.y, 3, { spread: 0.25, speed: 300, size: 2, color: 'rgba(255,255,255,0.85)', life: 0.22, mode: 'streak' });
          }
          next.push(e);
        }
        entities = next;

        if (scoreElRef.current) scoreElRef.current.textContent = String(Math.floor(score));
        if (speedElRef.current) speedElRef.current.textContent = String(Math.round(speed * 0.75));
        if (comboElRef.current) comboElRef.current.textContent = `×${combo}`;
        if (distanceElRef.current) distanceElRef.current.textContent = (distanceUnits / 5000).toFixed(1);
        if (!recordBroken && bestScore > 0 && score > bestScore) {
          recordBroken = true;
          if (bestElRef.current) bestElRef.current.textContent = 'New best!';
          scoreChipRef.current?.classList.add('drive-hud-record');
          pulseScore();
        }
      }

      // Pickup pop rings fade out over ~0.4s — filtered here rather than
      // in the simulation block above, since they must keep animating
      // even after `simulating` goes false (e.g. during the crash hang).
      const POP_FX_LIFE = 0.4;
      pickupFx = pickupFx.filter((fx) => elapsed - fx.bornAt < POP_FX_LIFE);

      // Particles keep aging/moving through the crash hang too, same
      // reasoning as the pickup rings above.
      particles = particles.filter((p) => {
        p.life -= dt;
        if (p.life <= 0) return false;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        return true;
      });

      // ---------------- render (every frame, active or not) ----------------
      const boostedNow = elapsed < boostUntil;
      let jx = 0;
      let jy = 0;
      let punch = 1;
      if (crashing && !reducedMotion) {
        const p = crashElapsed / Math.max(0.001, IMPACT_DURATION);
        const shake = 7 * (1 - p);
        jx = (Math.random() - 0.5) * shake;
        jy = (Math.random() - 0.5) * shake;
        punch = 1 + Math.max(0, 1 - p) * 0.035;
      } else if (!reducedMotion && speed > 620) {
        const jitter = Math.min(3, (speed - 620) / 60);
        jx = (Math.random() - 0.5) * jitter;
        jy = (Math.random() - 0.5) * jitter;
      }

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(punch, punch);
      ctx.translate(-width / 2 + jx, -height / 2 + jy);

      // ---- bright daylight coastal environment (sky, sun, clouds, verges) ----
      // A cheerful blue-to-mint sky wash instead of the old near-black fill —
      // this single gradient is what makes the whole scene read as "daylight"
      // even though the camera never shows a literal horizon line.
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#8fd6f2');
      sky.addColorStop(0.09, '#bfe8ee');
      sky.addColorStop(0.16, '#dff3e6');
      sky.addColorStop(0.5, '#5c6b78');
      sky.addColorStop(1, '#454f59');
      ctx.fillStyle = sky;
      ctx.fillRect(-4, -4, width + 8, height + 8);

      // Warm sun glow, upper corner.
      const sunX = width * 0.76;
      const sunGlow = ctx.createRadialGradient(sunX, height * 0.03, 2, sunX, height * 0.03, width * 0.42);
      sunGlow.addColorStop(0, 'rgba(255,248,214,0.95)');
      sunGlow.addColorStop(1, 'rgba(255,248,214,0)');
      ctx.fillStyle = sunGlow;
      ctx.fillRect(0, 0, width, height * 0.3);

      // A couple of soft clouds drifting through the sky band.
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 3; i++) {
        const drift = reducedMotion ? 0 : elapsed * 9;
        const cx = ((drift + i * 150 + 40) % (width + 160)) - 80;
        const cy = height * (0.035 + i * 0.028);
        for (const [dx, dy, r] of [[0, 0, 15], [16, 3, 11], [-14, 4, 10]] as const) {
          ctx.beginPath();
          ctx.ellipse(cx + dx, cy + dy, r, r * 0.62, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Grass/coastal verges — fills the trapezoid from the canvas edge out
      // to the guardrail, so the shoulders read as ground rather than void.
      const railInset = 10;
      const railTopInset = width * 0.09;
      const drawVerge = (side: -1 | 1) => {
        const bx = side === -1 ? railInset : width - railInset;
        const tx = side === -1 ? railTopInset : width - railTopInset;
        const grad = ctx.createLinearGradient(0, height * 0.14, 0, height);
        grad.addColorStop(0, '#7fd0ae');
        grad.addColorStop(1, '#3f9c5f');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(side === -1 ? 0 : width, height * 0.1);
        ctx.lineTo(tx, height * 0.1);
        ctx.lineTo(bx, height);
        ctx.lineTo(side === -1 ? 0 : width, height);
        ctx.closePath();
        ctx.fill();
        // mow-stripe texture
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 10;
        for (let y = height * 0.15; y < height; y += 34) {
          const t = y / height;
          const x = bx + (tx - bx) * (1 - t) * 0.4;
          ctx.beginPath();
          ctx.moveTo(side === -1 ? 0 : width, y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      };
      drawVerge(-1);
      drawVerge(1);

      // Guardrails — bright brushed-metal trapezoids that converge toward
      // the top of the frame, the cheapest reliable "depth" cue without
      // touching any lane-position math used by gameplay.
      const drawRail = (side: -1 | 1) => {
        const bx0 = side === -1 ? railInset : width - railInset;
        const bx1 = side === -1 ? railInset + 14 : width - railInset - 14;
        const tx0 = side === -1 ? railTopInset : width - railTopInset;
        const tx1 = side === -1 ? railTopInset + 6 : width - railTopInset - 6;
        const grad = ctx.createLinearGradient(bx0, 0, bx1, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0.85)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
        grad.addColorStop(1, 'rgba(255,255,255,0.85)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(tx0, 0);
        ctx.lineTo(tx1, 0);
        ctx.lineTo(bx1, height);
        ctx.lineTo(bx0, height);
        ctx.closePath();
        ctx.fill();

        // Scrolling reflective studs along the rail.
        ctx.fillStyle = 'rgba(0,212,71,0.85)';
        const spacing = 70;
        const offset = distanceUnits * 0.6;
        for (let y = -((offset % spacing)); y < height; y += spacing) {
          const t = y / height;
          const x = bx0 + (tx0 - bx0) * (1 - t);
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      drawRail(-1);
      drawRail(1);

      // Lane dividers — classic bright road-marking white.
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
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

      // Roadside props — light poles drifting past outside the rails,
      // purely decorative and positioned from `distanceUnits` alone (no
      // persistent array, same trick the speed-lines below already use).
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const poleSpacing = 260;
      const poleOffset = distanceUnits * 0.6;
      for (let y = -((poleOffset % poleSpacing)); y < height; y += poleSpacing) {
        for (const side of [-1, 1] as const) {
          const x = side === -1 ? railInset - 5 : width - railInset + 5;
          ctx.fillRect(x - 1, y, 2, 26);
          ctx.beginPath();
          ctx.arc(x, y, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Speed lines — density rises with speed, spikes further on boost,
      // tinted toward CX green when boosted for extra "surge" read.
      const lineHeat = Math.max(0, (speed - 380) / 380) + (boostedNow ? 0.5 : 0);
      if (lineHeat > 0.05) {
        const n = Math.min(9, Math.floor(lineHeat * 10));
        const tint = boostedNow ? '0,212,71' : '255,255,255';
        ctx.strokeStyle = `rgba(${tint},${Math.min(0.4, lineHeat * 0.32)})`;
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

      // ---- entities ----
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
        } else if (e.kind === 'cone') {
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.beginPath();
          ctx.ellipse(x, e.y + e.h / 2 - 2, e.w * 0.42, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          const coneGrad = ctx.createLinearGradient(x - e.w / 2, 0, x + e.w / 2, 0);
          coneGrad.addColorStop(0, '#c4532f');
          coneGrad.addColorStop(0.5, '#ef7143');
          coneGrad.addColorStop(1, '#b8492a');
          ctx.fillStyle = coneGrad;
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x, e.y - e.h / 2);
          ctx.lineTo(x + e.w / 2, e.y + e.h / 2);
          ctx.lineTo(x - e.w / 2, e.y + e.h / 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(245,246,242,0.85)';
          ctx.fillRect(x - e.w / 2 + 3, e.y + e.h * 0.08, e.w - 6, e.h * 0.14);
        } else {
          // 'car' / 'truck' / 'moving' traffic.
          const base = e.color ?? '#3b82c4';
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.32)';
          ctx.beginPath();
          ctx.ellipse(x, e.y + e.h / 2 - 2, e.w * 0.46, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          const bodyGrad = ctx.createLinearGradient(x - e.w / 2, e.y - e.h / 2, x + e.w / 2, e.y + e.h / 2);
          bodyGrad.addColorStop(0, shade(base, 16));
          bodyGrad.addColorStop(0.5, base);
          bodyGrad.addColorStop(1, shade(base, -20));
          ctx.fillStyle = bodyGrad;
          roundRect(ctx, x - e.w / 2, e.y - e.h / 2, e.w, e.h, 9);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1.2;
          roundRect(ctx, x - e.w / 2, e.y - e.h / 2, e.w, e.h, 9);
          ctx.stroke();

          // Windshield band + tail-light glow (top edge is the side
          // facing the player, since traffic scrolls downward).
          ctx.fillStyle = 'rgba(10,13,11,0.55)';
          roundRect(ctx, x - e.w * 0.36, e.y - e.h * 0.34, e.w * 0.72, e.h * 0.24, 4);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,120,120,0.85)';
          ctx.fillRect(x - e.w * 0.4, e.y - e.h / 2 + 3, e.w * 0.16, 3);
          ctx.fillRect(x + e.w * 0.24, e.y - e.h / 2 + 3, e.w * 0.16, 3);

          if (e.kind === 'truck') {
            ctx.strokeStyle = 'rgba(245,246,242,0.3)';
            ctx.lineWidth = 1;
            for (const dy of [0.05, 0.2, 0.35]) {
              ctx.beginPath();
              ctx.moveTo(x - e.w / 2 + 4, e.y - e.h / 2 + e.h * (0.5 + dy));
              ctx.lineTo(x + e.w / 2 - 4, e.y - e.h / 2 + e.h * (0.5 + dy));
              ctx.stroke();
            }
          }
          if (e.kind === 'moving') {
            // Small chevron pointing the way it's drifting — readability
            // for a hazard whose lane isn't fixed.
            const dir = e.driftTarget > e.lane ? 1 : e.driftTarget < e.lane ? -1 : 0;
            if (dir !== 0) {
              ctx.fillStyle = 'rgba(255,255,255,0.75)';
              ctx.beginPath();
              ctx.moveTo(x + dir * e.w * 0.05, e.y);
              ctx.lineTo(x - dir * e.w * 0.18, e.y - 6);
              ctx.lineTo(x - dir * e.w * 0.18, e.y + 6);
              ctx.closePath();
              ctx.fill();
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

      // Particles — sparks, tire smoke, boost embers, near-miss streaks.
      for (const p of particles) {
        const a = Math.max(0, p.life / p.maxLife);
        ctx.save();
        ctx.globalAlpha = a;
        if (p.mode === 'streak') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.4, p.size * a), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Impact flash + brief skid marks at the crash site, fading over
      // the hang window.
      if (crashing) {
        const p = Math.min(1, crashElapsed / Math.max(0.001, IMPACT_DURATION));
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.strokeStyle = '#e0402f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(crashAt.x, crashAt.y, 18 + p * 48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(10,6,6,0.5)';
        roundRect(ctx, crashAt.x - CAR_W * 0.42, crashAt.y + CAR_H * 0.3, 7, 22, 3);
        ctx.fill();
        roundRect(ctx, crashAt.x + CAR_W * 0.42 - 7, crashAt.y + CAR_H * 0.3, 7, 22, 3);
        ctx.fill();
        ctx.restore();
      }

      // ---- player car ----
      const px = currentLaneX;
      const py = playerY();
      const shieldSaving = elapsed < saveFlashUntil;
      const carState: 'normal' | 'shield' | 'crash' = dead || crashing ? 'crash' : shieldSaving || shielded ? 'shield' : 'normal';

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(carTilt);

      // Contact shadow.
      ctx.save();
      const shadowGrad = ctx.createRadialGradient(0, CAR_H * 0.4, 2, 0, CAR_H * 0.4, CAR_W * 0.8);
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0.45)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(0, CAR_H * 0.4, CAR_W * 0.62, CAR_H * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Ambient under-glow — faint always, brighter under boost.
      ctx.save();
      const underGrad = ctx.createRadialGradient(0, CAR_H * 0.44, 1, 0, CAR_H * 0.44, CAR_W * 0.7);
      underGrad.addColorStop(0, boostedNow ? 'rgba(0,212,71,0.55)' : 'rgba(0,212,71,0.14)');
      underGrad.addColorStop(1, 'rgba(0,212,71,0)');
      ctx.fillStyle = underGrad;
      ctx.beginPath();
      ctx.ellipse(0, CAR_H * 0.44, CAR_W * 0.7, CAR_H * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const bodyColor = carState === 'crash' ? '#e0402f' : carState === 'shield' ? '#00d447' : '#f2f4ee';

      // Body — a hood shape narrower at the top (front), flaring toward
      // the bottom, so it reads as the front 3/4 of the car even in this
      // top-down chase view.
      ctx.save();
      ctx.shadowColor = boostedNow ? 'rgba(0,212,71,0.6)' : 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = boostedNow ? 30 : 18;
      ctx.shadowOffsetY = boostedNow ? 0 : 9;
      const bodyGrad = ctx.createLinearGradient(-CAR_W / 2, -CAR_H / 2, CAR_W / 2, CAR_H / 2);
      bodyGrad.addColorStop(0, shade(bodyColor, 14));
      bodyGrad.addColorStop(0.45, bodyColor);
      bodyGrad.addColorStop(0.56, shade(bodyColor, -8));
      bodyGrad.addColorStop(1, shade(bodyColor, -20));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(-CAR_W * 0.36, -CAR_H / 2);
      ctx.quadraticCurveTo(-CAR_W / 2, -CAR_H * 0.3, -CAR_W / 2, -CAR_H * 0.05);
      ctx.quadraticCurveTo(-CAR_W / 2, CAR_H / 2 - 8, -CAR_W * 0.38, CAR_H / 2);
      ctx.lineTo(CAR_W * 0.38, CAR_H / 2);
      ctx.quadraticCurveTo(CAR_W / 2, CAR_H / 2 - 8, CAR_W / 2, -CAR_H * 0.05);
      ctx.quadraticCurveTo(CAR_W / 2, -CAR_H * 0.3, CAR_W * 0.36, -CAR_H / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Glossy diagonal highlight streak on the hood.
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-CAR_W * 0.18, -CAR_H * 0.42);
      ctx.lineTo(-CAR_W * 0.03, -CAR_H * 0.42);
      ctx.lineTo(-CAR_W * 0.11, CAR_H * 0.28);
      ctx.lineTo(-CAR_W * 0.26, CAR_H * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Windshield.
      const glassGrad = ctx.createLinearGradient(0, -CAR_H * 0.5, 0, -CAR_H * 0.2);
      glassGrad.addColorStop(0, '#0a0d0b');
      glassGrad.addColorStop(1, '#1c231d');
      ctx.fillStyle = glassGrad;
      roundRect(ctx, -CAR_W * 0.3, -CAR_H * 0.5, CAR_W * 0.6, CAR_H * 0.28, 8);
      ctx.fill();
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-CAR_W * 0.2, -CAR_H * 0.46);
      ctx.lineTo(-CAR_W * 0.05, -CAR_H * 0.28);
      ctx.stroke();
      ctx.restore();

      // Side mirrors.
      ctx.fillStyle = shade(bodyColor, -14);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * CAR_W * 0.55, -CAR_H * 0.08, 4, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Grille — dark inset housing the real CX badge.
      const grilleY = CAR_H * 0.02;
      const grilleW = CAR_W * 0.46;
      const grilleH = CAR_H * 0.2;
      ctx.fillStyle = '#0a0d0b';
      roundRect(ctx, -grilleW / 2, grilleY, grilleW, grilleH, 6);
      ctx.fill();
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        const lh = grilleH * 0.74;
        const lw = lh * (logoImg.naturalWidth / logoImg.naturalHeight);
        ctx.save();
        ctx.shadowColor = 'rgba(0,212,71,0.65)';
        ctx.shadowBlur = 5;
        ctx.drawImage(logoImg, -lw / 2, grilleY + (grilleH - lh) / 2, lw, lh);
        ctx.restore();
      }

      // Headlights — twin, glowing.
      const hlY = -CAR_H * 0.06;
      const hlColor = carState === 'crash' ? '#ffb199' : '#eaffef';
      for (const side of [-1, 1]) {
        const hx = side * CAR_W * 0.34;
        ctx.save();
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 11;
        ctx.fillStyle = hlColor;
        roundRect(ctx, hx - 6, hlY - 4, 12, 8, 3);
        ctx.fill();
        ctx.restore();
      }

      // Front pinstripe — the CX green trim line.
      ctx.strokeStyle = 'rgba(0,212,71,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-CAR_W * 0.3, CAR_H * 0.46);
      ctx.lineTo(CAR_W * 0.3, CAR_H * 0.46);
      ctx.stroke();

      // Tires peeking out at the sides.
      ctx.fillStyle = '#111';
      roundRect(ctx, -CAR_W * 0.58, -CAR_H * 0.02, 8, 20, 3);
      ctx.fill();
      roundRect(ctx, CAR_W * 0.58 - 8, -CAR_H * 0.02, 8, 20, 3);
      ctx.fill();

      // Brake-light glow when crashing.
      if (carState === 'crash') {
        ctx.save();
        ctx.globalAlpha = 0.6;
        const bg = ctx.createRadialGradient(0, CAR_H * 0.5, 2, 0, CAR_H * 0.5, CAR_W * 0.6);
        bg.addColorStop(0, 'rgba(224,64,47,0.75)');
        bg.addColorStop(1, 'rgba(224,64,47,0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.ellipse(0, CAR_H * 0.5, CAR_W * 0.6, CAR_H * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore(); // player car transform

      ctx.restore(); // camera punch/shake transform

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
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointer);
    };
  }, [bestScore]);

  return (
    <div className="relative h-full w-full touch-none select-none overscroll-none">
      <canvas ref={canvasRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-4 top-[max(1rem,env(safe-area-inset-top))] flex gap-2">
        <div
          ref={scoreChipRef}
          className="drive-hud-chip rounded-2xl border border-accent-bright/40 bg-black/60 px-3.5 py-2 shadow-[0_0_16px_rgba(0,212,71,0.25)] backdrop-blur"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-bright/80">Score</p>
          <p ref={scoreElRef} className="font-display text-xl font-bold tabular-nums text-white">
            0
          </p>
          {bestScore > 0 && (
            <p ref={bestElRef} className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-accent-bright/75">
              Best {bestScore.toLocaleString()}
            </p>
          )}
        </div>
        <div
          ref={comboChipRef}
          className="rounded-2xl border border-accent-bright/40 bg-black/60 px-3.5 py-2 shadow-[0_0_16px_rgba(0,212,71,0.25)] backdrop-blur"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-bright/80">Combo</p>
          <p ref={comboElRef} className="font-display text-xl font-bold tabular-nums text-accent-bright">
            &times;1
          </p>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex gap-2">
        <div className="rounded-2xl border border-accent-bright/40 bg-black/60 px-3.5 py-2 text-right shadow-[0_0_16px_rgba(0,212,71,0.25)] backdrop-blur">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-bright/80">Speed</p>
          <p ref={speedElRef} className="font-display text-xl font-bold tabular-nums text-white">
            0<span className="ml-0.5 text-[11px] font-medium text-white/45">km/h</span>
          </p>
        </div>
        <div className="rounded-2xl border border-accent-bright/40 bg-black/60 px-3.5 py-2 text-right shadow-[0_0_16px_rgba(0,212,71,0.25)] backdrop-blur">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-bright/80">Distance</p>
          <p ref={distanceElRef} className="font-display text-xl font-bold tabular-nums text-white">
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
          {/* Cleared to sit above the launcher's floating pause/mute/close
              cluster (bottom-right, ~64px tall including its own padding)
              rather than the plain 1.5rem used when nothing else shares
              this edge — this HUD doesn't know that cluster's exact
              markup, so it just reserves generous, safe-area-aware room. */}
          <p className="pointer-events-none absolute inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] text-center text-[12.5px] font-medium text-white/45">
            <span className="hidden sm:inline">Steer with ← → or A / D</span>
            <span className="sm:hidden">Tap left or right to steer</span>
          </p>
        </>
      )}
    </div>
  );
}
