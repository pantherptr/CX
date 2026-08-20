import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
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
 * GAMEPLAY NOTE: traffic AI (per-vehicle speed/direction, lane-changing,
 * object pooling) was tried and reverted after it produced unstable
 * on-screen vehicle behavior — see git history if picking that back up.
 * Traffic here is deliberately the simple, previous model: every
 * obstacle scrolls at the shared road speed, and only the `moving` kind
 * drifts sideways (toward `driftTarget`, at a fixed `drift` rate). This
 * pass keeps the near-miss scoring/combo work (bonus fires on a close
 * pass, feeds the same 5x combo ceiling and HUD glow tiers as tokens do)
 * since that is scoring, not vehicle movement.
 *
 * IMPORTANT: every number that feeds scoring, rewards or difficulty
 * (`speedAt`, `spawnEveryAt`, `pickObstacleKind`, the score/combo/shield
 * formulas, the collision hit-test) is untouched — this file only draws
 * frames differently and adds the near-miss bonus described above.
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
/** Hard speedometer ceiling — no car, no boost, no calculation is ever
 *  allowed to display a number above this. Enforced at the single
 *  point the HUD number is computed (`kmhFor` in the effect below),
 *  not by trusting every value that feeds it to already be in range. */
const ABSOLUTE_MAX_KMH = 425;
/** Every run launches at this same reading regardless of car — only the
 *  ceiling differs per car, never the starting line. */
const START_KMH = 55;
/** Named checkpoints the speedometer calls out the first time a run
 *  crosses them — a slower car simply never reaches the later ones. */
const SPEED_MILESTONES_KMH = [200, 250, 300, 350, 400, 425];
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
  /** Assigned once at spawn for `car`/`moving` traffic — which of five
   *  body silhouettes (sedan/coupe/SUV/hatch/performance) this vehicle
   *  reads as, and for `truck` which cab style. Drawn entirely inside
   *  the unchanged `w`/`h` hitbox footprint — purely visual variety,
   *  never a gameplay effect. */
  variant?: number;
  /** Set once a near-miss/collision resolves for this entity, so the
   *  graze effect (streak + score bonus) can only ever fire once. */
  grazed?: boolean;
}

/** A transient "NEAR MISS +N" moment — a ring pop plus rising label,
 *  same short-lived-array pattern as `pickupFx` below. */
interface NearMissFx {
  x: number;
  y: number;
  bornAt: number;
  bonus: number;
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
  /** Peak displayed km/h reached during the run — the same conversion
   *  the Speed HUD chip uses (`speed * 0.75`), just tracked to a max
   *  instead of shown live. Purely a results-screen stat, never fed
   *  back into scoring. */
  maxSpeed: number;
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
/** `topSpeedMul`/`accelMul` are the Garage's per-car stat multipliers
 *  (both default to 1, matching the CX GT baseline exactly). Starting
 *  speed (220) is deliberately never scaled — every car launches at the
 *  same pace, so "top speed" only raises the ceiling and "acceleration"
 *  only changes how fast the run climbs toward it, exactly as the
 *  Garage's stat descriptions promise. The curve's shape (the same
 *  `Math.min(cap, base + ramp * rate)` climb) is untouched. */
function speedAt(t: number, topSpeedMul = 1, accelMul = 1) {
  const ramp = Math.max(0, t - 3);
  return Math.min(920 * topSpeedMul, 220 + ramp * 22 * accelMul);
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
  bodyColor = '#f2f4ee',
  topSpeedMul = 1,
  accelMul = 1,
  handlingMul = 1,
  topSpeedKmh = 280,
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
  /** Player car paint color, driven by the Garage's selected vehicle —
   *  purely a render input (crash/shield states still override it).
   *  Defaults to the original off-white paint so every existing caller
   *  that doesn't pass this looks exactly as before. */
  bodyColor?: string;
  /** Garage stat multipliers for the selected car — small, bounded
   *  scalers (roughly 0.9–1.15) around the CX GT baseline of 1 each, so
   *  every car stays "fun and playable" per the Garage's own design.
   *  `topSpeedMul` raises/lowers the speed ceiling, `accelMul` changes
   *  how fast the run climbs toward it (both feed `speedAt` only — the
   *  curve's shape and every difficulty/spawn function are untouched),
   *  `handlingMul` scales lane-change and tilt responsiveness. */
  topSpeedMul?: number;
  accelMul?: number;
  handlingMul?: number;
  /** This car's realistic speedometer ceiling in km/h — the internal
   *  `speed` unit above is rescaled to land exactly on this value at
   *  the car's own top speed (see `SPEEDO_MAX_KMH` and `kmhFor` in the
   *  effect below), so the number on screen is always a real,
   *  physically-plausible reading and never the old arbitrary
   *  `speed * 0.75` figure. Defaults to CX GT's own cap. */
  topSpeedKmh?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreElRef = useRef<HTMLParagraphElement>(null);
  const scoreChipRef = useRef<HTMLDivElement>(null);
  const bestElRef = useRef<HTMLParagraphElement>(null);
  const speedElRef = useRef<HTMLSpanElement>(null);
  const comboElRef = useRef<HTMLParagraphElement>(null);
  const comboChipRef = useRef<HTMLDivElement>(null);
  const comboTierElRef = useRef<HTMLParagraphElement>(null);
  const distanceElRef = useRef<HTMLSpanElement>(null);
  const milestoneElRef = useRef<HTMLDivElement>(null);
  const objectivePanelElRef = useRef<HTMLDivElement>(null);
  const objectiveLabelElRef = useRef<HTMLParagraphElement>(null);
  const objectiveFillElRef = useRef<HTMLDivElement>(null);
  const objectiveValueElRef = useRef<HTMLParagraphElement>(null);
  const steerHintElRef = useRef<HTMLParagraphElement>(null);
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
    // Purely a draw-size multiplier — entities feel closer/larger as they
    // near the bottom of the frame and smaller as they spawn near the top.
    // Never touches `e.w`/`e.h` themselves, so the hit-test above (which
    // reads those fields directly) is completely unaffected.
    const depthScale = (y: number) => 0.62 + Math.min(1, Math.max(0, y / height)) * 0.5;

    let playerLane = 1;
    let currentLaneX = laneX(playerLane);
    let prevLane = playerLane;
    let carTilt = 0;
    let entities: Entity[] = [];
    let particles: Particle[] = [];
    let elapsed = 0;
    let sinceSpawn = 0;
    // Fairness — the one lane this spawn tick is guaranteed not to place
    // an obstacle in, so a followable path always exists near the top of
    // the screen rather than relying on per-tick randomness alone to
    // avoid a 3-lane wall. Only rerolled when the top of the screen is
    // completely clear (see the spawn tick below), so swapping which
    // lane is "open" can never itself spring a surprise wall. Purely a
    // spawn-time lane *choice* — the movement math for every entity
    // (`e.y += speed * dt`, drift lerp, hit-test) is untouched.
    let guaranteedOpenLane = Math.floor(Math.random() * LANES);
    let score = 0;
    let combo = 1;
    let maxCombo = 1;
    let maxSpeedReached = 0;
    // The speedometer's own smoothed reading — deliberately a separate
    // value from the `speed` used for scroll rate/distance/thresholds
    // below, which keeps changing exactly as before (untouched
    // gameplay feel). This one eases toward its target each frame so a
    // boost's instant jump doesn't make the digits snap, the way a real
    // digital dash needle settles rather than teleporting.
    let speedKmhSmoothed = START_KMH;
    let speedMilestoneIdx = 0;
    let distanceUnits = 0;
    let dead = false;
    let shielded = false;
    let boostUntil = -1;
    let multiplierUntil = -1;
    let saveFlashUntil = -1;
    let boostFxTimer = 0;
    let recordBroken = false;
    let approachingBestShown = false;
    // Distance milestones — fixed early markers, then every +5km for a
    // long run. `distanceKm` uses the same /5000 conversion as the HUD's
    // own distance display, so a milestone fires exactly when the number
    // shown to the player crosses it.
    const MILESTONE_KM = [0.1, 0.5, 1, 2, 5];
    let milestoneIdx = 0;
    let nextMilestoneKm = MILESTONE_KM[0];
    // The lower bound of the *current* objective range — 0 to start, then
    // whatever the previous target was, so the HUD's Objective progress
    // bar always shows "how far into this leg", not "how far into the run".
    let prevMilestoneKm = 0;
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
    let pickupFx: { x: number; y: number; bornAt: number; bonus?: number }[] = [];
    let nearMissFx: NearMissFx[] = [];
    let last = performance.now();

    /** Cheap deterministic pseudo-random in [0,1) from an integer seed —
     *  same trick the asphalt grain already used inline, pulled out so
     *  the new roadside-variety and rain code can share it. Deterministic
     *  (not `Math.random()`) so a given tree/lamp/raindrop slot always
     *  looks the same from frame to frame instead of flickering. */
    const hash1 = (n: number) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;

    /** Keeps the combo HUD chip's glow tier — and its plain-language tier
     *  label — in sync with the live combo value. Called only when combo
     *  actually changes, not every frame. Labels are cosmetic only; the
     *  underlying combo number and score math are unaffected. */
    const COMBO_TIER_LABELS = ['', 'NORMAL', 'GOOD DRIVING', 'NEAR MISS', 'DANGER', 'PERFECT'];
    const applyComboTier = (value: number) => {
      const el = comboChipRef.current;
      if (el) {
        el.classList.toggle('drive-combo-max', value >= MAX_COMBO);
        el.classList.toggle('drive-combo-hot', value >= 3 && value < MAX_COMBO);
      }
      if (comboTierElRef.current) comboTierElRef.current.textContent = COMBO_TIER_LABELS[value] ?? '';
    };

    /** One-shot milestone toast (distance or speed) — imperative DOM
     *  update (no React state) so it costs nothing per frame; retriggers
     *  its own CSS animation on every call rather than relying on a
     *  timer, so a fast subsequent milestone still restarts it cleanly.
     *  `bonus` is optional — speed milestones are a pure callout with no
     *  score attached, distance milestones award one. */
    const showMilestone = (label: string, bonus?: number, big = false) => {
      const el = milestoneElRef.current;
      if (!el) return;
      el.textContent = bonus ? `${label} · +${bonus}` : label;
      el.classList.remove('drive-milestone-pop', 'drive-milestone-max');
      void el.offsetWidth;
      el.classList.add('drive-milestone-pop');
      el.classList.toggle('drive-milestone-max', big);
      playRef.current('record');
    };

    /** Brief completion glow on the persistent Objective panel the instant
     *  a distance leg is cleared — a quieter, always-visible companion to
     *  the `showMilestone` toast above rather than a replacement for it. */
    const flashObjective = () => {
      const el = objectivePanelElRef.current;
      if (!el || reducedMotion) return;
      el.classList.remove('drive-objective-complete');
      void el.offsetWidth;
      el.classList.add('drive-objective-complete');
    };

    /** Rescales the internal, unit-less `speed` (still driving scroll
     *  rate/distance/every existing threshold exactly as before) into a
     *  realistic km/h reading for THIS car: 220 (the shared, unscaled
     *  starting value every car launches at) maps to `START_KMH`, and
     *  this car's own asymptotic cap (`920 * topSpeedMul`) maps to its
     *  `topSpeedKmh` — then hard-clamped to `ABSOLUTE_MAX_KMH` as a last
     *  safety net so literally nothing can ever read above it. */
    const carCapInternal = 920 * topSpeedMul;
    const kmhFor = (s: number) => {
      const t = Math.max(0, Math.min(1, (s - 220) / Math.max(1, carCapInternal - 220)));
      const kmh = START_KMH + t * (topSpeedKmh - START_KMH);
      return Math.min(ABSOLUTE_MAX_KMH, Math.round(kmh));
    };

    // The "STEER ← → OR A / D" hint fades out the first time the player
    // actually steers, or after a short timeout regardless — whichever
    // comes first — so it never permanently sits over the car. A single
    // dismissed flag keeps repeat calls (every subsequent keypress) cheap
    // no-ops rather than re-touching the DOM every frame.
    let hintDismissed = false;
    const dismissHint = () => {
      if (hintDismissed) return;
      hintDismissed = true;
      steerHintElRef.current?.classList.add('opacity-0');
    };
    const hintTimer = window.setTimeout(dismissHint, 4200);

    const steer = (delta: number) => {
      if (!activeRef.current) return;
      dismissHint();
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
      let driftTarget = kind === 'moving' ? Math.min(LANES - 1, Math.max(0, lane + (Math.random() < 0.5 ? -1 : 1))) : lane;
      // A drifting obstacle must never end up sliding into the one lane
      // this tick is guaranteeing stays clear — same fairness contract
      // as the spawn lane itself, just applied to where it drifts *to*.
      if (kind === 'moving' && driftTarget === guaranteedOpenLane) driftTarget = lane;
      const color =
        kind === 'car' || kind === 'truck' || kind === 'moving'
          ? TRAFFIC_PALETTE[Math.floor(Math.random() * TRAFFIC_PALETTE.length)]
          : undefined;
      const variant =
        kind === 'car' || kind === 'moving' ? Math.floor(Math.random() * 5) : kind === 'truck' ? Math.floor(Math.random() * 2) : undefined;
      entities.push({ kind, lane, driftTarget, drift: kind === 'moving' ? 0.55 : 0, y: -50, w: size.w, h: size.h, color, variant });
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
      let speed = speedAt(elapsed, topSpeedMul, accelMul);

      if (simulating) {
        elapsed += dt;
        speed = speedAt(elapsed, topSpeedMul, accelMul) * (elapsed < boostUntil ? 1.35 : 1);
        sinceSpawn += dt;

        if (elapsed > 1.1 && sinceSpawn > spawnEveryAt(elapsed)) {
          sinceSpawn = 0;

          // Only ever reroll which lane is "guaranteed open" while the
          // top of the screen has nothing living in it — so the swap
          // itself can never create a surprise wall (the newly-open lane
          // was already clear, and the newly-closed one has a full
          // screen's travel time before it matters).
          if (!entities.some((e) => e.y < 30)) {
            guaranteedOpenLane = Math.floor(Math.random() * LANES);
          }

          const roll = Math.random();
          if (roll < 0.04) {
            const p = Math.random();
            const kind: EntityKind = p < 0.34 ? 'shield' : p < 0.67 ? 'multiplier' : 'boost';
            entities.push({ kind, lane: Math.floor(Math.random() * LANES), driftTarget: 0, drift: 0, y: -40, w: 30, h: 30 });
          } else if (roll < 0.3) {
            entities.push({ kind: 'token', lane: Math.floor(Math.random() * LANES), driftTarget: 0, drift: 0, y: -40, w: 34, h: 34 });
          } else {
            const kind = pickObstacleKind(elapsed);
            // Every obstacle placement below draws only from lanes other
            // than `guaranteedOpenLane` — that lane is this tick's
            // reserved, always-followable escape path.
            const blockable = [0, 1, 2].filter((l) => l !== guaranteedOpenLane);
            if (kind === 'cone') {
              // Needle-thread pair: the two non-open lanes get a cone,
              // leaving the guaranteed lane as the one real gap — tests
              // precise lane holding rather than a reactive dodge.
              spawnObstacle(blockable[0], 'cone');
              spawnObstacle(blockable[1], 'cone');
            } else {
              const firstLane = blockable[Math.floor(Math.random() * blockable.length)];
              spawnObstacle(firstLane, kind);
              const waveChance = elapsed > 14 ? Math.min(0.6, (elapsed - 14) * 0.018) : 0;
              if (Math.random() < waveChance) {
                // The only remaining non-open lane — still guaranteed
                // distinct from both `firstLane` and the open lane.
                const secondLane = blockable.find((l) => l !== firstLane);
                if (secondLane !== undefined) spawnObstacle(secondLane, pickObstacleKind(elapsed));
              }
            }
          }
        }

        const target = laneX(playerLane);
        currentLaneX += (target - currentLaneX) * Math.min(1, dt * 12 * handlingMul);

        // Cosmetic: lean the car into the turn, proportional to how far
        // it still has to travel to the target lane, then settle.
        const laneW = width / LANES;
        const leanTarget = Math.min(0.24, Math.max(-0.24, ((target - currentLaneX) / laneW) * 0.55));
        carTilt += (leanTarget - carTilt) * Math.min(1, dt * 9 * handlingMul);

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

        const distanceKm = distanceUnits / 5000;
        if (distanceKm >= nextMilestoneKm) {
          const bonus = Math.round(120 + nextMilestoneKm * 40);
          score += bonus;
          const label = nextMilestoneKm >= 1 ? `${nextMilestoneKm} KM` : `${Math.round(nextMilestoneKm * 1000)} M`;
          showMilestone(label, bonus);
          flashObjective();
          prevMilestoneKm = nextMilestoneKm;
          milestoneIdx++;
          nextMilestoneKm = milestoneIdx < MILESTONE_KM.length ? MILESTONE_KM[milestoneIdx] : nextMilestoneKm + 5;
        }

        // Objective panel — persistent progress toward the *current* leg
        // (prevMilestoneKm → nextMilestoneKm), updated every simulating
        // frame via the same imperative-DOM pattern as the rest of the
        // HUD. Purely a display of values already computed above.
        const objSpan = Math.max(0.0001, nextMilestoneKm - prevMilestoneKm);
        const objProgress = Math.max(0, Math.min(1, (distanceKm - prevMilestoneKm) / objSpan));
        if (objectiveFillElRef.current) objectiveFillElRef.current.style.width = `${(objProgress * 100).toFixed(1)}%`;
        if (objectiveValueElRef.current) {
          objectiveValueElRef.current.textContent = `${distanceKm.toFixed(2)} / ${nextMilestoneKm.toFixed(2)} KM`;
        }
        if (objectiveLabelElRef.current) {
          objectiveLabelElRef.current.textContent =
            nextMilestoneKm >= 1 ? `Drive ${nextMilestoneKm} km` : `Drive ${Math.round(nextMilestoneKm * 1000)} m`;
        }

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
              const tokenBonus = 40 * combo;
              score += tokenBonus;
              maxCombo = Math.max(maxCombo, combo);
              pickupFx.push({ x: ex, y: e.y, bornAt: elapsed, bonus: tokenBonus });
              spawnBurst(ex, e.y, 6, { spread: Math.PI * 2, speed: 80, size: 2.4, color: '#7dffb0', life: 0.4 });
              pulseScore();
              if (combo > prev) {
                playRef.current('combo');
                pulseCombo();
                applyComboTier(combo);
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
              applyComboTier(combo);
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
            // Near miss — a band just outside the real hitbox above,
            // flagged once per entity so it can't fire twice for the same
            // pass. `closeness` (0 at the outer edge of the band, 1 right
            // up against the real hitbox) scales the bonus: skirting the
            // edge is worth more than a wide, easy pass.
            e.grazed = true;
            const hitHalfW = e.w * 0.5 + 20;
            const grazeHalfW = e.w * 0.5 + 30;
            const margin = Math.abs(ex - px) - hitHalfW;
            const closeness = 1 - Math.min(1, Math.max(0, margin / Math.max(1, grazeHalfW - hitHalfW)));
            const prevCombo = combo;
            combo = Math.min(MAX_COMBO, combo + 1);
            maxCombo = Math.max(maxCombo, combo);
            const bonus = Math.round((10 + closeness * 22) * combo);
            score += bonus;
            nearMissFx.push({ x: (ex + px) / 2, y: (e.y + py) / 2, bornAt: elapsed, bonus });
            spawnBurst((ex + px) / 2, e.y, 3, { spread: 0.25, speed: 300, size: 2, color: 'rgba(255,255,255,0.85)', life: 0.22, mode: 'streak' });
            spawnBurst((ex + px) / 2, (e.y + py) / 2, 6, { spread: Math.PI * 2, speed: 85, size: 2.2, color: '#7dffb0', life: 0.4 });
            playRef.current('nearmiss');
            if (combo > prevCombo) {
              pulseCombo();
              applyComboTier(combo);
            }
          }
          next.push(e);
        }
        entities = next;

        // Ease the shown number toward its target rather than snapping —
        // the "real instrument" feel item 3 asks for, and it's what
        // keeps a boost's instant internal jump from reading as a jump
        // on the dash even though the actual scroll speed does jump.
        const targetKmh = kmhFor(speed);
        speedKmhSmoothed += (targetKmh - speedKmhSmoothed) * Math.min(1, dt * 4);
        const displaySpeed = Math.min(ABSOLUTE_MAX_KMH, Math.round(speedKmhSmoothed));
        maxSpeedReached = Math.max(maxSpeedReached, displaySpeed);
        if (speedMilestoneIdx < SPEED_MILESTONES_KMH.length && displaySpeed >= SPEED_MILESTONES_KMH[speedMilestoneIdx]) {
          const hit = SPEED_MILESTONES_KMH[speedMilestoneIdx];
          speedMilestoneIdx++;
          if (hit >= ABSOLUTE_MAX_KMH) {
            showMilestone(`MAX SPEED · ${ABSOLUTE_MAX_KMH} KM/H`, undefined, true);
          } else {
            showMilestone(`${hit} KM/H · HIGH SPEED`);
          }
        }
        if (scoreElRef.current) scoreElRef.current.textContent = String(Math.floor(score));
        if (speedElRef.current) speedElRef.current.textContent = String(displaySpeed);
        if (comboElRef.current) comboElRef.current.textContent = `×${combo}`;
        if (distanceElRef.current) distanceElRef.current.textContent = (distanceUnits / 5000).toFixed(1);
        if (!recordBroken && bestScore > 0 && score > bestScore) {
          recordBroken = true;
          if (bestElRef.current) bestElRef.current.textContent = 'New best!';
          scoreChipRef.current?.classList.remove('drive-hud-approaching');
          scoreChipRef.current?.classList.add('drive-hud-record');
          pulseScore();
        } else if (!recordBroken && !approachingBestShown && bestScore > 0 && score >= bestScore * 0.85) {
          // Not beaten yet, but close — a quieter cue than the full "New
          // best!" celebration, shown once per run rather than every frame.
          approachingBestShown = true;
          if (bestElRef.current) bestElRef.current.textContent = 'Personal best ahead';
          scoreChipRef.current?.classList.add('drive-hud-approaching');
        }
      }

      // Pickup pop rings fade out over ~0.4s — filtered here rather than
      // in the simulation block above, since they must keep animating
      // even after `simulating` goes false (e.g. during the crash hang).
      const POP_FX_LIFE = 0.4;
      pickupFx = pickupFx.filter((fx) => elapsed - fx.bornAt < POP_FX_LIFE);

      // Near-miss labels rise and fade over ~0.7s — longer than the pop
      // rings above since there's a short line of text to actually read.
      const NEAR_MISS_FX_LIFE = 0.7;
      nearMissFx = nearMissFx.filter((fx) => elapsed - fx.bornAt < NEAR_MISS_FX_LIFE);

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
      } else if (!reducedMotion) {
        // A barely-perceptible continuous zoom tied to speed — the
        // "subtle camera movement" that reads as momentum even when the
        // player isn't fast enough to trigger the sharper jitter below.
        punch = 1 + Math.min(0.018, Math.max(0, (speed - 260) / 700) * 0.018);
        if (speed > 620) {
          const jitter = Math.min(3, (speed - 620) / 60);
          jx = (Math.random() - 0.5) * jitter;
          jy = (Math.random() - 0.5) * jitter;
        }
      }

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(punch, punch);
      ctx.translate(-width / 2 + jx, -height / 2 + jy);

      // ---- premium evening/night highway environment (sky, stars, verges) ----
      // A deep indigo-to-noir sky with a low, warm dusk band at the horizon —
      // this single gradient is what makes the whole scene read as "premium
      // night drive" even though the camera never shows a literal horizon line.
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#080b12');
      sky.addColorStop(0.07, '#0d1420');
      sky.addColorStop(0.13, '#182233');
      sky.addColorStop(0.17, '#2c2a3a');
      sky.addColorStop(0.2, '#241c22');
      sky.addColorStop(0.5, '#1a1d22');
      sky.addColorStop(1, '#121417');
      ctx.fillStyle = sky;
      ctx.fillRect(-4, -4, width + 8, height + 8);

      // A quiet CX-green wash low in the sky — brand presence in the
      // atmosphere itself, not just the HUD/car, kept subtle enough it
      // reads as "city glow on the horizon" rather than a green sky.
      const brandGlow = ctx.createRadialGradient(width * 0.28, height * 0.19, 2, width * 0.28, height * 0.19, width * 0.55);
      brandGlow.addColorStop(0, 'rgba(0,212,71,0.16)');
      brandGlow.addColorStop(1, 'rgba(0,212,71,0)');
      ctx.fillStyle = brandGlow;
      ctx.fillRect(0, 0, width, height * 0.26);

      // Warm dusk glow, upper corner — a low sun/streetlamp-district haze
      // rather than a bright daytime sun.
      const sunX = width * 0.76;
      const sunGlow = ctx.createRadialGradient(sunX, height * 0.05, 2, sunX, height * 0.05, width * 0.36);
      sunGlow.addColorStop(0, 'rgba(255,196,130,0.28)');
      sunGlow.addColorStop(1, 'rgba(255,196,130,0)');
      ctx.fillStyle = sunGlow;
      ctx.fillRect(0, 0, width, height * 0.24);

      // Stars — fixed slots (deterministic hash, not re-randomized per
      // frame) so they read as a static field rather than static noise;
      // a slow per-star twinkle is the only thing that changes frame to
      // frame, skipped under reduced motion in favor of a fixed brightness.
      // Confined to the upper sky band, above the skyline.
      for (let i = 0; i < 34; i++) {
        const sx = hash1(i * 3.1 + 1) * width;
        const sy = hash1(i * 7.7 + 2) * height * 0.13;
        const tw = reducedMotion ? 0.55 : 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(elapsed * (0.6 + hash1(i) * 0.8) + i));
        ctx.fillStyle = `rgba(255,255,255,${tw.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.6 + hash1(i * 1.7) * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // City skyline — a cheap, distant parallax layer (scrolls slower
      // than the guardrails/verges in front of it) that's the one real
      // depth cue this scene was missing: near things now visibly move
      // faster than far things, not just "things converge toward a point".
      const skylineOffset = (distanceUnits * 0.09) % (width * 1.4);
      for (let i = -1; i < 5; i++) {
        const bw = 34 + (i % 3) * 10;
        const bh = height * (0.05 + ((i * 37) % 5) * 0.014);
        const bx = ((i * 92 - skylineOffset) % (width + 200)) - 100;
        const by = height * 0.145 - bh;
        // Dark building silhouettes against the night sky — the lit
        // windows (below) are what carries all the detail now, the same
        // way a real night skyline reads as near-black shapes punctuated
        // by light rather than lit concrete.
        const tone = i % 2 === 0 ? '#161c26' : '#1c222d';
        ctx.fillStyle = tone;
        ctx.beginPath();
        roundRect(ctx, bx, by, bw, bh, 2);
        ctx.fill();
        // Lit windows — every so many tinted CX green, the rest a warm
        // interior white, both bright against the near-black tower.
        for (let wy = by + 6; wy < by + bh - 5; wy += 9) {
          for (let wx = bx + 5; wx < bx + bw - 5; wx += 9) {
            const lit = hash1(wx * 0.31 + wy * 0.7 + i * 5.1) > 0.22;
            if (!lit) continue;
            ctx.fillStyle = (wx + wy) % 27 < 9 ? 'rgba(0,212,71,0.65)' : 'rgba(255,222,168,0.8)';
            ctx.fillRect(wx, wy, 2.6, 3.4);
          }
        }
      }

      // Grass verges — fills the trapezoid from the canvas edge out to the
      // sidewalk, so the shoulders read as ground rather than void. Night-
      // toned (deep moonlit green) rather than the old bright daylight fill.
      const railInset = 10;
      const railTopInset = width * 0.09;
      // A dedicated sidewalk band sits between the grass and the guardrail —
      // its own trapezoid, converging the same way, so the roadside reads
      // as a real street cross-section (grass → sidewalk → barrier → road)
      // instead of grass running straight up to the rail.
      const sidewalkBottomInset = railInset + 26;
      const sidewalkTopInset = railTopInset + width * 0.016;
      const drawVerge = (side: -1 | 1) => {
        const bx = side === -1 ? sidewalkBottomInset : width - sidewalkBottomInset;
        const tx = side === -1 ? sidewalkTopInset : width - sidewalkTopInset;
        const grad = ctx.createLinearGradient(0, height * 0.14, 0, height);
        grad.addColorStop(0, '#1f3a2c');
        grad.addColorStop(1, '#12261c');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(side === -1 ? 0 : width, height * 0.1);
        ctx.lineTo(tx, height * 0.1);
        ctx.lineTo(bx, height);
        ctx.lineTo(side === -1 ? 0 : width, height);
        ctx.closePath();
        ctx.fill();
        // mow-stripe texture — quieter than the daylight version, just
        // enough to read as tended grass rather than a flat fill.
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
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

      // Sidewalk — pale concrete strip between the grass and the guardrail,
      // with scrolling tile-seam lines (same distanceUnits-offset trick as
      // the asphalt grain) so it visibly moves with the world instead of
      // reading as a static painted border.
      const drawSidewalk = (side: -1 | 1) => {
        const bx0 = side === -1 ? sidewalkBottomInset : width - sidewalkBottomInset;
        const bx1 = side === -1 ? railInset : width - railInset;
        const tx0 = side === -1 ? sidewalkTopInset : width - sidewalkTopInset;
        const tx1 = side === -1 ? railTopInset : width - railTopInset;
        const grad = ctx.createLinearGradient(0, height * 0.1, 0, height);
        grad.addColorStop(0, '#3a3f45');
        grad.addColorStop(1, '#54595f');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(tx0, height * 0.1);
        ctx.lineTo(tx1, height * 0.1);
        ctx.lineTo(bx1, height);
        ctx.lineTo(bx0, height);
        ctx.closePath();
        ctx.fill();

        const seamSpacing = 46;
        const seamOffset = distanceUnits * 0.6;
        for (let y = -((seamOffset % seamSpacing)); y < height; y += seamSpacing) {
          const t = Math.max(0, Math.min(1, y / height));
          const x0 = tx0 + (bx0 - tx0) * t;
          const x1 = tx1 + (bx1 - tx1) * t;
          ctx.strokeStyle = 'rgba(0,0,0,0.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
          ctx.stroke();
        }
      };
      drawSidewalk(-1);
      drawSidewalk(1);

      // Asphalt carriageway — a dedicated fill between where the rails
      // will land, so the road itself reads as pavement rather than a
      // continuation of the sky wash bleeding through underneath it.
      // Purely a background layer: lane positions used by gameplay are
      // untouched (they're computed from `laneX`, not from this shape).
      const roadGrad = ctx.createLinearGradient(0, height * 0.1, 0, height);
      roadGrad.addColorStop(0, '#2b3038');
      roadGrad.addColorStop(0.55, '#20242a');
      roadGrad.addColorStop(1, '#131518');
      ctx.fillStyle = roadGrad;
      ctx.beginPath();
      ctx.moveTo(railTopInset + 5, height * 0.1);
      ctx.lineTo(width - railTopInset - 5, height * 0.1);
      ctx.lineTo(width - railInset - 13, height);
      ctx.lineTo(railInset + 13, height);
      ctx.closePath();
      ctx.fill();

      // Wet-asphalt reflection — a soft band of "sky light" sliding slowly
      // side to side, as if the damp road surface is catching the ambient
      // glow above it. Slow, continuous drift (not tied to distance) reads
      // as a real reflection shifting with a moving light source rather
      // than road texture scrolling past.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(railTopInset + 5, height * 0.1);
      ctx.lineTo(width - railTopInset - 5, height * 0.1);
      ctx.lineTo(width - railInset - 13, height);
      ctx.lineTo(railInset + 13, height);
      ctx.closePath();
      ctx.clip();
      const reflectDrift = reducedMotion ? 0.5 : 0.5 + Math.sin(elapsed * 0.17) * 0.5;
      const reflectX = width * (0.15 + reflectDrift * 0.7);
      const sheen = ctx.createLinearGradient(reflectX - width * 0.3, height * 0.1, reflectX + width * 0.3, height);
      sheen.addColorStop(0, 'rgba(180,200,255,0)');
      sheen.addColorStop(0.5, 'rgba(180,200,255,0.06)');
      sheen.addColorStop(1, 'rgba(180,200,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, height * 0.1, width, height * 0.9);
      // A second, quieter warm sheen from the dusk glow overhead — two
      // overlapping reflections read as "wet", one alone reads as "shiny".
      const sheen2 = ctx.createLinearGradient(0, height * 0.1, width, height);
      sheen2.addColorStop(0.6, 'rgba(255,210,160,0)');
      sheen2.addColorStop(0.72, 'rgba(255,210,160,0.035)');
      sheen2.addColorStop(0.84, 'rgba(255,210,160,0)');
      ctx.fillStyle = sheen2;
      ctx.fillRect(0, height * 0.1, width, height * 0.9);
      ctx.restore();

      // Asphalt grain — a handful of short, faint streaks scrolling with
      // the road (same distanceUnits-offset trick as the guardrail studs
      // below), deterministic per slot rather than re-randomized every
      // frame so it reads as texture, not flicker. Cheap: ~14 tiny
      // strokes, no per-pixel work.
      const grainSpacing = 90;
      const grainOffset = distanceUnits * 0.6;
      let grainSeed = Math.round(grainOffset / grainSpacing);
      for (let gy = -((grainOffset % grainSpacing)); gy < height; gy += grainSpacing, grainSeed++) {
        const t = Math.max(0, Math.min(1, gy / height));
        const spanX0 = railTopInset + (railInset + 13 - railTopInset) * t;
        const spanX1 = width - railTopInset - (railInset + 13 - railTopInset) * t;
        for (let k = 0; k < 2; k++) {
          const rnd = hash1(grainSeed * 2 + k);
          const gx = spanX0 + rnd * (spanX1 - spanX0);
          ctx.strokeStyle = k === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.16)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx, gy + 7 + t * 7);
          ctx.stroke();
        }
      }

      // Larger, sparser dark asphalt patches — resurfacing seams/wear
      // marks, coarser spacing than the grain streaks above so they read
      // as patches rather than more of the same texture.
      const patchSpacing = 340;
      const patchOffset = distanceUnits * 0.6;
      let patchSeed = Math.round(patchOffset / patchSpacing);
      for (let py = -((patchOffset % patchSpacing)); py < height; py += patchSpacing, patchSeed++) {
        const t = Math.max(0, Math.min(1, py / height));
        const spanX0 = railTopInset + (railInset + 13 - railTopInset) * t;
        const spanX1 = width - railTopInset - (railInset + 13 - railTopInset) * t;
        const px = spanX0 + hash1(patchSeed * 3.3) * (spanX1 - spanX0);
        const pw = (26 + hash1(patchSeed * 5.1) * 30) * (0.5 + t * 0.7);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.ellipse(px, py, pw, pw * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Solid road-edge markings, just inside each rail — a faint glow so
      // they read crisply against the dark night asphalt rather than just
      // relying on raw contrast.
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.5)';
      ctx.shadowBlur = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.72)';
      ctx.lineWidth = 2.5;
      for (const side of [-1, 1] as const) {
        const bx = side === -1 ? railInset + 13 : width - railInset - 13;
        const tx = side === -1 ? railTopInset + 5 : width - railTopInset - 5;
        ctx.beginPath();
        ctx.moveTo(tx, height * 0.1);
        ctx.lineTo(bx, height);
        ctx.stroke();
      }
      ctx.restore();

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

      // Lane dividers — classic bright road-marking white, with a soft
      // glow so each lane is unmistakable at a glance against the dark
      // asphalt (the one visual requirement this whole pass leads with).
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.55)';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
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
      ctx.restore();

      // Roadside props — street lamps (pole + arm + glowing head) drifting
      // past outside the rails, plus a CX-branded sign every third pole on
      // alternating sides. All positioned from `distanceUnits` alone (no
      // persistent array, same trick the speed-lines below already use);
      // `poleIndex` only needs to be stable frame-to-frame, which the loop
      // already guarantees since it's derived from the same offset.
      const poleSpacing = 260;
      const poleOffset = distanceUnits * 0.6;
      let poleIndex = Math.round(poleOffset / poleSpacing);
      // Two canopy tones so the treeline doesn't read as one shade copy-
      // pasted down the road — picked per-tree via the same deterministic
      // hash everything else here uses.
      const CANOPY_TONES: [string, string][] = [
        ['#8fd99f', '#2f6f47'],
        ['#7ccf9a', '#276140'],
      ];
      for (let y = -((poleOffset % poleSpacing)); y < height; y += poleSpacing, poleIndex++) {
        // Roadside objects grow as they near the bottom of the frame,
        // same depth-scale idea as the entities — the clearest "they're
        // approaching" cue this fixed-position scroll trick can offer.
        const ds = depthScale(Math.max(0, y));
        for (const side of [-1, 1] as const) {
          const slot = poleIndex * 2 + (side === -1 ? 0 : 1);
          const x = side === -1 ? railInset - 5 : width - railInset + 5;

          // Every other pole is a tree instead of a lamp, alternating
          // which side gets which so the roadside doesn't read as a
          // mechanical repeat of one prop.
          const isTree = (poleIndex + (side === -1 ? 0 : 1)) % 2 === 0;
          if (isTree) {
            // Size and position vary per tree (deterministic hash, not
            // re-rolled per frame) so the treeline reads as planted
            // rather than a single stamped asset repeated down the road.
            const sizeT = hash1(slot * 3.7 + 1.1);
            const canopyR = (10 + sizeT * 9) * ds;
            const xJitter = (hash1(slot * 5.3 + 2.4) - 0.5) * 9 * ds;
            const tx = x + xJitter;
            const trunkH = (13 + hash1(slot * 4.1) * 7) * ds;
            const [c0, c1] = CANOPY_TONES[Math.floor(hash1(slot * 6.6) * CANOPY_TONES.length)];
            ctx.fillStyle = '#4a3320';
            ctx.fillRect(tx - 1.4 * ds, y, 2.8 * ds, trunkH);
            const canopyY = y - canopyR * 0.4;
            const canopyGrad = ctx.createRadialGradient(tx - canopyR * 0.3, canopyY - canopyR * 0.3, 1, tx, canopyY, canopyR);
            canopyGrad.addColorStop(0, c0);
            canopyGrad.addColorStop(1, c1);
            ctx.fillStyle = canopyGrad;
            for (const [dx, dy, r] of [[0, 0, 1], [-0.5, 0.3, 0.72], [0.55, 0.25, 0.68]] as const) {
              ctx.beginPath();
              ctx.arc(tx + dx * canopyR, canopyY + dy * canopyR, canopyR * r, 0, Math.PI * 2);
              ctx.fill();
            }
            continue;
          }

          // A small fraction of lamp slots become a low striped barrier
          // segment instead — "road barriers where appropriate" without
          // crowding out the lamps that do the actual lighting work.
          const isBarrier = hash1(slot * 9.3 + 0.5) < 0.14;
          if (isBarrier) {
            const bw = 16 * ds;
            const bh = 7 * ds;
            ctx.save();
            roundRect(ctx, x - bw / 2, y - bh / 2, bw, bh, 2 * ds);
            ctx.clip();
            ctx.fillStyle = '#e0a52a';
            ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
            ctx.fillStyle = '#1a1c1e';
            for (let sx = -bw / 2 - bh; sx < bw / 2; sx += bh * 0.9) {
              ctx.beginPath();
              ctx.moveTo(x + sx, y - bh / 2);
              ctx.lineTo(x + sx + bh * 0.45, y - bh / 2);
              ctx.lineTo(x + sx + bh * 0.45 + bh, y + bh / 2);
              ctx.lineTo(x + sx + bh, y + bh / 2);
              ctx.closePath();
              ctx.fill();
            }
            ctx.restore();
            continue;
          }

          // Shaft.
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(x - 1, y, 2 * ds, 26 * ds);
          // Short arm curling toward the road, then a glowing lamp head —
          // reads as an actual street light rather than a bare dot.
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1.6 * ds;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + side * 7 * ds, y - 3 * ds);
          ctx.stroke();
          const headX = x + side * 8 * ds;
          const headY = y - 3 * ds;
          const lampGlow = ctx.createRadialGradient(headX, headY, 0, headX, headY, 10 * ds);
          lampGlow.addColorStop(0, 'rgba(255,238,190,0.65)');
          lampGlow.addColorStop(1, 'rgba(255,238,190,0)');
          ctx.fillStyle = lampGlow;
          ctx.beginPath();
          ctx.arc(headX, headY, 10 * ds, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff8e0';
          ctx.beginPath();
          ctx.arc(headX, headY, 2 * ds, 0, Math.PI * 2);
          ctx.fill();

          // Warm light pool on the asphalt beneath the lamp — the "street
          // lighting reflected on the road" cue, flattened and low-opacity
          // so it reads as a soft glow underfoot, not a solid shape.
          const poolX = x + side * 20 * ds;
          const poolY = y + 10 * ds;
          const poolGlow = ctx.createRadialGradient(poolX, poolY, 0, poolX, poolY, 24 * ds);
          poolGlow.addColorStop(0, 'rgba(255,220,160,0.14)');
          poolGlow.addColorStop(1, 'rgba(255,220,160,0)');
          ctx.save();
          ctx.fillStyle = poolGlow;
          ctx.beginPath();
          ctx.ellipse(poolX, poolY, 24 * ds, 8 * ds, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // A CX road sign on every third pole, alternating sides so it
          // doesn't read as a mirrored repeat of the lamp above it.
          if (poleIndex % 3 === 0 && side === (poleIndex % 6 === 0 ? -1 : 1)) {
            const signY = y + 34 * ds;
            ctx.fillStyle = '#00893f';
            roundRect(ctx, x - 13 * ds, signY, 26 * ds, 15 * ds, 3 * ds);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            roundRect(ctx, x - 13 * ds, signY, 26 * ds, 15 * ds, 3 * ds);
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.font = `700 ${9 * ds}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.fillText('CX', x, signY + 11 * ds);
          }
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

      // Rain — a sparse field of falling streaks behind the traffic layer,
      // subtle enough that lane markings and vehicles stay fully readable.
      // Fixed slot count, each slot's x/phase from the same deterministic
      // hash as the rest of the environment, so there's no persistent
      // particle array to allocate or age — just a per-frame position
      // computed from `elapsed` (which already freezes on pause, same as
      // every other background element here). Skipped under reduced
      // motion, same convention as every other purely decorative touch.
      if (!reducedMotion) {
        const RAIN_COUNT = 40;
        const rainFall = elapsed * 900;
        ctx.save();
        ctx.strokeStyle = 'rgba(200,215,255,0.14)';
        ctx.lineWidth = 1;
        for (let i = 0; i < RAIN_COUNT; i++) {
          const rx = hash1(i * 2.13 + 5) * width;
          const dropSpeed = 700 + hash1(i * 3.71) * 500;
          const ry = ((rainFall * (dropSpeed / 900) + hash1(i * 1.37) * (height + 40)) % (height + 40)) - 20;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 4, ry + 16);
          ctx.stroke();
        }
        ctx.restore();
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
          const ds = depthScale(e.y);
          const cw = e.w * ds, ch = e.h * ds;
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.beginPath();
          ctx.ellipse(x, e.y + ch / 2 - 2, cw * 0.42, 4 * ds, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          const coneGrad = ctx.createLinearGradient(x - cw / 2, 0, x + cw / 2, 0);
          coneGrad.addColorStop(0, '#c4532f');
          coneGrad.addColorStop(0.5, '#ef7143');
          coneGrad.addColorStop(1, '#b8492a');
          ctx.fillStyle = coneGrad;
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x, e.y - ch / 2);
          ctx.lineTo(x + cw / 2, e.y + ch / 2);
          ctx.lineTo(x - cw / 2, e.y + ch / 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(245,246,242,0.85)';
          ctx.fillRect(x - cw / 2 + 3 * ds, e.y + ch * 0.08, cw - 6 * ds, ch * 0.14);
        } else {
          // 'car' / 'truck' / 'moving' traffic — five purely-visual body
          // silhouettes (sedan/coupe/SUV/hatch/performance for cars, two
          // cab styles for trucks) drawn at a depth-scaled size, always
          // centered inside the entity's real, unscaled hitbox — variety
          // and perspective never touch collision.
          const base = e.color ?? '#3b82c4';
          const ds = depthScale(e.y);
          const sil = e.kind === 'truck' ? -1 : ((e.variant ?? 0) % 5);
          // SUVs/performance read a touch wider than the lane-safe hitbox;
          // hatch/coupe a touch narrower — kept small (±7%) so it never
          // looks like it's fouling a neighboring lane.
          const wMul = e.kind === 'truck' ? 1 : sil === 2 ? 1.07 : sil === 4 ? 1.05 : sil === 1 ? 0.94 : 1;
          const cw = e.w * ds * wMul, ch = e.h * ds;

          ctx.save();
          const shGrad = ctx.createRadialGradient(x, e.y + ch * 0.42, 1, x, e.y + ch * 0.42, cw * 0.7);
          shGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
          shGrad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = shGrad;
          ctx.beginPath();
          ctx.ellipse(x, e.y + ch * 0.42, cw * 0.5, ch * 0.16, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Wet-road reflection smear — a soft, elongated streak of the
          // vehicle's own color underneath it, the cheap "mirrored on wet
          // asphalt" cue without literally drawing a flipped car.
          ctx.save();
          ctx.globalAlpha = 0.16;
          const reflGrad = ctx.createLinearGradient(x, e.y + ch * 0.35, x, e.y + ch * 1.5);
          reflGrad.addColorStop(0, base);
          reflGrad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = reflGrad;
          ctx.beginPath();
          ctx.ellipse(x, e.y + ch * 0.75, cw * 0.32, ch * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Body radius/taper varies a little by silhouette — SUVs read
          // boxier, hatch/performance taper more toward the nose.
          const radius = sil === 2 ? 6 : sil === 3 || sil === 4 ? 11 : 9;
          const bodyGrad = ctx.createLinearGradient(x - cw / 2, e.y - ch / 2, x + cw / 2, e.y + ch / 2);
          bodyGrad.addColorStop(0, shade(base, 16));
          bodyGrad.addColorStop(0.5, base);
          bodyGrad.addColorStop(1, shade(base, -20));
          ctx.fillStyle = bodyGrad;
          roundRect(ctx, x - cw / 2, e.y - ch / 2, cw, ch, radius);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1.2;
          roundRect(ctx, x - cw / 2, e.y - ch / 2, cw, ch, radius);
          ctx.stroke();

          // Wheels — four small tire/rim pairs peeking past the body
          // edges, front and rear, same corner logic as the player car.
          for (const [wx, wy] of [
            [-cw * 0.5, -ch * 0.26], [cw * 0.5, -ch * 0.26],
            [-cw * 0.5, ch * 0.3], [cw * 0.5, ch * 0.3],
          ] as const) {
            ctx.fillStyle = '#111';
            roundRect(ctx, x + wx - 2.4 * ds, e.y + wy - 6.5 * ds, 4.8 * ds, 13 * ds, 2 * ds);
            ctx.fill();
            ctx.fillStyle = 'rgba(170,174,168,0.7)';
            roundRect(ctx, x + wx - 1.2 * ds, e.y + wy - 3.8 * ds, 2.4 * ds, 7.6 * ds, 1.2 * ds);
            ctx.fill();
          }

          // Windshield glass — shape/position is the main silhouette read
          // (top edge faces the player, since traffic scrolls downward):
          // 0 sedan — tall, centered, upright; 1 coupe — low and pushed
          // rearward; 2 SUV — wide with roof rails; 3 hatch — short nose,
          // large rear glass; 4 performance — low, wide, aggressive rake.
          ctx.fillStyle = 'rgba(10,13,11,0.58)';
          if (sil === 1) {
            roundRect(ctx, x - cw * 0.3, e.y - ch * 0.22, cw * 0.6, ch * 0.16, 4);
            ctx.fill();
          } else if (sil === 2) {
            roundRect(ctx, x - cw * 0.34, e.y - ch * 0.32, cw * 0.68, ch * 0.42, 5);
            ctx.fill();
            ctx.strokeStyle = 'rgba(245,246,242,0.4)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(x - cw * 0.28, e.y - ch * 0.34);
            ctx.lineTo(x - cw * 0.28, e.y + ch * 0.06);
            ctx.moveTo(x + cw * 0.28, e.y - ch * 0.34);
            ctx.lineTo(x + cw * 0.28, e.y + ch * 0.06);
            ctx.stroke();
          } else if (sil === 3) {
            roundRect(ctx, x - cw * 0.33, e.y - ch * 0.18, cw * 0.66, ch * 0.36, 5);
            ctx.fill();
          } else if (sil === 4) {
            ctx.beginPath();
            ctx.moveTo(x - cw * 0.28, e.y - ch * 0.14);
            ctx.lineTo(x - cw * 0.22, e.y - ch * 0.3);
            ctx.lineTo(x + cw * 0.22, e.y - ch * 0.3);
            ctx.lineTo(x + cw * 0.28, e.y - ch * 0.14);
            ctx.closePath();
            ctx.fill();
            // Center hood stripe — the "performance" accent.
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(x - cw * 0.05, e.y - ch * 0.48, cw * 0.1, ch * 0.34);
          } else {
            roundRect(ctx, x - cw * 0.36, e.y - ch * 0.34, cw * 0.72, ch * 0.24, 4);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,120,120,0.85)';
          ctx.fillRect(x - cw * 0.4, e.y - ch / 2 + 3 * ds, cw * 0.16, 3 * ds);
          ctx.fillRect(x + cw * 0.24, e.y - ch / 2 + 3 * ds, cw * 0.16, 3 * ds);

          if (e.kind === 'truck') {
            if (e.variant === 1) {
              // Van cab — a single wide windshield band up front instead
              // of the box-truck's cargo slats.
              ctx.fillStyle = 'rgba(10,13,11,0.5)';
              roundRect(ctx, x - cw * 0.32, e.y - ch * 0.32, cw * 0.64, ch * 0.16, 4);
              ctx.fill();
            }
            ctx.strokeStyle = 'rgba(245,246,242,0.3)';
            ctx.lineWidth = 1;
            for (const dy of [0.05, 0.2, 0.35]) {
              ctx.beginPath();
              ctx.moveTo(x - cw / 2 + 4, e.y - ch / 2 + ch * (0.5 + dy));
              ctx.lineTo(x + cw / 2 - 4, e.y - ch / 2 + ch * (0.5 + dy));
              ctx.stroke();
            }
          }
          if (sil === 3 || sil === 4) {
            // Small rear spoiler hint on hatch/performance builds.
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(x - cw * 0.32, e.y + ch * 0.42, cw * 0.64, 2.4 * ds);
          }
          if (e.kind === 'moving') {
            // Small chevron pointing the way it's drifting — readability
            // for a hazard whose lane isn't fixed.
            const dir = e.driftTarget > e.lane ? 1 : e.driftTarget < e.lane ? -1 : 0;
            if (dir !== 0) {
              ctx.fillStyle = 'rgba(255,255,255,0.75)';
              ctx.beginPath();
              ctx.moveTo(x + dir * cw * 0.05, e.y);
              ctx.lineTo(x - dir * cw * 0.18, e.y - 6 * ds);
              ctx.lineTo(x - dir * cw * 0.18, e.y + 6 * ds);
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

        if (fx.bonus) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - p * 1.3);
          ctx.textAlign = 'center';
          ctx.font = "700 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
          ctx.fillStyle = '#0a0d0b';
          ctx.fillText(`+${fx.bonus}`, fx.x + 0.6, fx.y - p * 18 + 0.6);
          ctx.fillStyle = '#eaffef';
          ctx.fillText(`+${fx.bonus}`, fx.x, fx.y - p * 18);
          ctx.restore();
        }
      }

      // "NEAR MISS +N" — a quick ring plus a rising, fading label. The
      // ring reads as instant feedback even for a player not looking
      // straight at the text; the label carries the actual bonus.
      for (const fx of nearMissFx) {
        const p = (elapsed - fx.bornAt) / NEAR_MISS_FX_LIFE;
        const rise = p * 34;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p * 1.15);
        ctx.strokeStyle = '#eaffef';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 10 + p * 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85));
        ctx.textAlign = 'center';
        ctx.font = "700 12px system-ui, -apple-system, 'Segoe UI', sans-serif";
        ctx.fillStyle = '#0a0d0b';
        ctx.fillText('NEAR MISS', fx.x + 0.6, fx.y - rise + 0.6);
        ctx.fillStyle = '#eaffef';
        ctx.fillText('NEAR MISS', fx.x, fx.y - rise);
        ctx.font = "700 10.5px system-ui, -apple-system, 'Segoe UI', sans-serif";
        ctx.fillStyle = '#00d447';
        ctx.fillText(`+${fx.bonus}`, fx.x, fx.y - rise + 14);
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

      const speedT = Math.min(1, Math.max(0, (speed - 220) / 700));

      // Suspension — a small continuous vertical bob (quicker and a touch
      // taller at higher speed) applied only to this car's own draw calls
      // via a local translate. Never touches `px`/`py`/`carTilt` — those
      // stay exactly what steering/collision already compute.
      const susBob = reducedMotion ? 0 : Math.sin(elapsed * 6.2) * (0.5 + speedT * 1.6);
      // Squat — shadow tightens/darkens slightly as the body leans into a
      // lane change, reading as weight transfer rather than a flat cutout.
      const susSquat = Math.min(1, Math.abs(carTilt) * 2.6);
      ctx.translate(0, susBob);

      // Contact shadow.
      ctx.save();
      const shadowGrad = ctx.createRadialGradient(0, CAR_H * 0.4, 2, 0, CAR_H * 0.4, CAR_W * 0.8);
      shadowGrad.addColorStop(0, `rgba(0,0,0,${(0.45 + susSquat * 0.1).toFixed(3)})`);
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(0, CAR_H * 0.4, CAR_W * 0.62 * (1 - susSquat * 0.12), CAR_H * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Wet-road reflection smear — the player's own paint color bleeding
      // faintly into the asphalt behind it, same technique as traffic's
      // reflection below but a touch stronger since this is the car the
      // player is meant to be looking at.
      ctx.save();
      ctx.globalAlpha = 0.2;
      const playerReflGrad = ctx.createLinearGradient(0, CAR_H * 0.32, 0, CAR_H * 1.35);
      playerReflGrad.addColorStop(0, bodyColor);
      playerReflGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = playerReflGrad;
      ctx.beginPath();
      ctx.ellipse(0, CAR_H * 0.72, CAR_W * 0.36, CAR_H * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Ambient under-glow — scales with speed (the car visibly "heats
      // up" as it accelerates through the run, not just during boost),
      // brightest of all under an actual boost.
      ctx.save();
      const underGrad = ctx.createRadialGradient(0, CAR_H * 0.44, 1, 0, CAR_H * 0.44, CAR_W * 0.7);
      underGrad.addColorStop(0, boostedNow ? 'rgba(0,212,71,0.55)' : `rgba(0,212,71,${(0.1 + speedT * 0.16).toFixed(3)})`);
      underGrad.addColorStop(1, 'rgba(0,212,71,0)');
      ctx.fillStyle = underGrad;
      ctx.beginPath();
      ctx.ellipse(0, CAR_H * 0.44, CAR_W * 0.7, CAR_H * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Tail heat-glow — a second, higher, narrower bloom right behind
      // the car that only shows up once speed is meaningfully up, the
      // closest read this top-down view has to "exhaust/acceleration".
      if (speedT > 0.15) {
        ctx.save();
        const tailGrad = ctx.createRadialGradient(0, CAR_H * 0.56, 1, 0, CAR_H * 0.56, CAR_W * 0.4 * speedT);
        tailGrad.addColorStop(0, `rgba(0,212,71,${(speedT * 0.4).toFixed(3)})`);
        tailGrad.addColorStop(1, 'rgba(0,212,71,0)');
        ctx.fillStyle = tailGrad;
        ctx.beginPath();
        ctx.ellipse(0, CAR_H * 0.56, CAR_W * 0.4 * speedT, CAR_H * 0.12 * speedT, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const paintColor = carState === 'crash' ? '#e0402f' : carState === 'shield' ? '#00d447' : bodyColor;

      // Wheel-arch shading — four soft dark blobs under where the body
      // will be drawn, at roughly the same corners the wheel ellipses
      // land at below, so the paint reads as flared over them rather
      // than the tires just floating beside a flat slab.
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (const [ax, ay] of [
        [-CAR_W * 0.52, -CAR_H * 0.24], [CAR_W * 0.52, -CAR_H * 0.24],
        [-CAR_W * 0.52, CAR_H * 0.3], [CAR_W * 0.52, CAR_H * 0.3],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(ax, ay, 9, 13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Body — a hood shape narrower at the top (front), flaring toward
      // the bottom, so it reads as the front 3/4 of the car even in this
      // top-down chase view.
      ctx.save();
      ctx.shadowColor = boostedNow ? 'rgba(0,212,71,0.6)' : 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = boostedNow ? 30 : 18;
      ctx.shadowOffsetY = boostedNow ? 0 : 9;
      const bodyGrad = ctx.createLinearGradient(-CAR_W / 2, -CAR_H / 2, CAR_W / 2, CAR_H / 2);
      bodyGrad.addColorStop(0, shade(paintColor, 14));
      bodyGrad.addColorStop(0.45, paintColor);
      bodyGrad.addColorStop(0.56, shade(paintColor, -8));
      bodyGrad.addColorStop(1, shade(paintColor, -20));
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

      // A second, fainter streak on the opposite flank — one highlight
      // reads as a sticker, two reads as curved, reflective paint.
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(CAR_W * 0.22, -CAR_H * 0.3);
      ctx.lineTo(CAR_W * 0.32, -CAR_H * 0.3);
      ctx.lineTo(CAR_W * 0.24, CAR_H * 0.36);
      ctx.lineTo(CAR_W * 0.14, CAR_H * 0.36);
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
      ctx.fillStyle = shade(paintColor, -14);
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

      // Headlights — slim LED blades rather than rounded boxes, glowing
      // and a touch brighter at speed.
      const hlY = -CAR_H * 0.06;
      const hlColor = carState === 'crash' ? '#ffb199' : '#eaffef';
      for (const side of [-1, 1]) {
        const hx = side * CAR_W * 0.34;
        ctx.save();
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 11 + speedT * 7;
        ctx.fillStyle = hlColor;
        roundRect(ctx, hx - 7, hlY - 3, 14, 4.5, 2.2);
        ctx.fill();
        // A tighter, brighter inner core reads as an LED strip rather
        // than a single flat block.
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, hx - 5.5, hlY - 2, 11, 2, 1);
        ctx.fill();
        ctx.restore();
      }

      // Front splitter — a dark accent bar right at the nose, under the
      // headlights, giving the front end a finished, performance-car edge.
      ctx.fillStyle = 'rgba(10,13,11,0.55)';
      roundRect(ctx, -CAR_W * 0.32, -CAR_H * 0.5 + 1, CAR_W * 0.64, 3, 1.5);
      ctx.fill();

      // Front pinstripe — the CX green trim line.
      ctx.strokeStyle = 'rgba(0,212,71,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-CAR_W * 0.3, CAR_H * 0.46);
      ctx.lineTo(CAR_W * 0.3, CAR_H * 0.46);
      ctx.stroke();

      // Taillights — a slim always-on bar at the rear (the wide end,
      // closest to camera in this chase view), dim in normal driving,
      // full brake-red on impact via the glow pass below.
      ctx.fillStyle = carState === 'crash' ? '#ff5540' : 'rgba(224,64,47,0.55)';
      roundRect(ctx, -CAR_W * 0.34, CAR_H * 0.5 - 5, CAR_W * 0.2, 3.4, 1.5);
      ctx.fill();
      roundRect(ctx, CAR_W * 0.14, CAR_H * 0.5 - 5, CAR_W * 0.2, 3.4, 1.5);
      ctx.fill();

      // Wheels — four real tire/rim ellipses at the corners (matching the
      // arch shading drawn under the body) instead of two flat side bars.
      for (const [wx, wy] of [
        [-CAR_W * 0.53, -CAR_H * 0.24], [CAR_W * 0.53, -CAR_H * 0.24],
        [-CAR_W * 0.53, CAR_H * 0.3], [CAR_W * 0.53, CAR_H * 0.3],
      ] as const) {
        ctx.fillStyle = '#111';
        roundRect(ctx, wx - 4, wy - 10, 8, 20, 3.5);
        ctx.fill();
        ctx.fillStyle = 'rgba(180,184,178,0.85)';
        roundRect(ctx, wx - 2.1, wy - 6, 4.2, 12, 2);
        ctx.fill();
      }

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

      // Cinematic corner vignette — screen-space, applied after the
      // camera transform restores so it never shifts with the punch/
      // shake, just a quiet frame that reads as "shot on a camera" rather
      // than a flat top-down render.
      ctx.save();
      const vignette = ctx.createRadialGradient(
        width / 2, height * 0.44, height * 0.35,
        width / 2, height * 0.5, height * 0.82,
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.32)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      if (!dead) {
        raf = requestAnimationFrame(loop);
      } else {
        onFinishRef.current({
          score: Math.floor(score),
          distance: Math.round((distanceUnits / 5000) * 10) / 10,
          maxCombo,
          maxSpeed: maxSpeedReached,
        });
      }
    }

    setReady(true);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hintTimer);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointer);
    };
  }, [bestScore, bodyColor, topSpeedMul, accelMul, handlingMul, topSpeedKmh]);

  return (
    <div className="relative h-full w-full touch-none select-none overscroll-none">
      <canvas ref={canvasRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-4 top-[max(1rem,env(safe-area-inset-top))] flex gap-2">
        <div ref={scoreChipRef} className="drive-hud-chip rounded-2xl px-3.5 py-2 backdrop-blur-xl">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-accent-bright/75">Score</p>
          <p ref={scoreElRef} className="font-display text-2xl font-bold leading-none tabular-nums text-white">
            0
          </p>
          {bestScore > 0 && (
            <p ref={bestElRef} className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-accent-bright/70">
              Best {bestScore.toLocaleString()}
            </p>
          )}
        </div>
        <div ref={comboChipRef} className="drive-hud-chip rounded-2xl px-3.5 py-2 backdrop-blur-xl">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-accent-bright/75">Combo</p>
          <p ref={comboElRef} className="font-display text-2xl font-bold leading-none tabular-nums text-accent-bright">
            &times;1
          </p>
          <p ref={comboTierElRef} className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-white/40">
            Normal
          </p>
        </div>
      </div>

      <div
        ref={milestoneElRef}
        className="drive-milestone pointer-events-none absolute inset-x-0 top-[max(4.75rem,calc(env(safe-area-inset-top)+4rem))] mx-auto w-fit rounded-full border border-accent-bright/30 bg-black/60 px-4 py-1.5 text-[12.5px] font-bold uppercase tracking-wide text-accent-bright opacity-0 backdrop-blur-xl"
      />

      {/* Objective — persistent progress toward the current distance leg,
          sitting below the milestone toast so a pop-in callout never
          collides with it. Values are pushed in imperatively from the
          loop, same pattern as every other HUD number on this screen. */}
      <div
        ref={objectivePanelElRef}
        className="drive-hud-chip pointer-events-none absolute left-1/2 top-[max(7.25rem,calc(env(safe-area-inset-top)+6.5rem))] w-[12.5rem] -translate-x-1/2 rounded-2xl px-3.5 py-2 backdrop-blur-xl"
      >
        <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.16em] text-accent-bright/75">
          <Icon name="star" size={10} fill className="text-accent-bright" /> Objective
        </p>
        <p ref={objectiveLabelElRef} className="mt-0.5 truncate text-[12px] font-semibold text-white">
          Drive 100 m
        </p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            ref={objectiveFillElRef}
            className="h-full rounded-full bg-accent-bright transition-[width] duration-300 ease-out"
            style={{ width: '0%' }}
          />
        </div>
        <p
          ref={objectiveValueElRef}
          className="mt-1 text-right text-[9.5px] font-semibold uppercase tracking-wide text-white/40 tabular-nums"
        >
          0.00 / 0.10 KM
        </p>
      </div>

      <div className="pointer-events-none absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex gap-2">
        <div className="drive-hud-chip rounded-2xl px-3.5 py-2 text-right backdrop-blur-xl">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-accent-bright/75">Speed</p>
          <p className="font-display text-2xl font-bold leading-none tabular-nums text-white">
            <span ref={speedElRef}>0</span>
          </p>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-white/40">km/h</p>
        </div>
        <div className="drive-hud-chip rounded-2xl px-3.5 py-2 text-right backdrop-blur-xl">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-accent-bright/75">Distance</p>
          <p className="font-display text-2xl font-bold leading-none tabular-nums text-white">
            <span ref={distanceElRef}>0.0</span>
          </p>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-white/40">km</p>
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
          {/* Auto-fades the first time the player steers (or after a short
              timeout regardless — see `dismissHint` above) so it never
              permanently sits over the car once the controls are learned. */}
          <p
            ref={steerHintElRef}
            className="pointer-events-none absolute inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] text-center text-[12.5px] font-medium text-white/45 transition-opacity duration-700 ease-out"
          >
            <span className="hidden sm:inline">Steer with ← → or A / D</span>
            <span className="sm:hidden">Tap left or right to steer</span>
          </p>
        </>
      )}
    </div>
  );
}
