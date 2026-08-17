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
 * GAMEPLAY NOTE (this pass): near-misses now feed score and combo (they
 * previously only spawned a cosmetic streak), and `spawnEveryAt` /
 * `pickObstacleKind` / the wave-spawn chance were tightened for a
 * smoother late-run difficulty ramp. Two numbers were deliberately left
 * alone despite the brief asking for "higher if appropriate" combo
 * tiers: `MAX_COMBO` (still 5x) and `speedAt`'s cap. Both the reward
 * tier thresholds and the server-side anti-cheat rate cap
 * (`max_score_per_second` in `game_config`) were tuned against the
 * existing 5x ceiling — raising it would shift the score economy behind
 * a check this file has no visibility into, so new scoring paths (near
 * misses) reuse that same ceiling rather than raising it further.
 * Everything else — the collision hit-test, shield/multiplier/boost
 * formulas, distance/score bookkeeping shape — is untouched.
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

/**
 * How a traffic vehicle drives. Only `car` / `truck` / `moving` entities
 * carry one — cones, tokens and power-ups stay road-fixed props with no
 * behavior at all (their `relSpeed` is left undefined, which the movement
 * step reads as 0 and therefore behaves exactly as it always has).
 *
 * `relSpeed` is a vehicle's own forward speed as a fraction of the
 * player's road speed, so the on-screen closing rate is
 * `speed * (1 - relSpeed)`:
 *   < 1  → the player is faster, the vehicle drifts back toward them
 *          (spawned ahead, off the top of the frame)
 *   > 1  → the vehicle is faster, it rises up the frame and overtakes
 *          (spawned behind, off the bottom of the frame)
 */
type TrafficBehavior = 'slow' | 'normal' | 'fast' | 'changer' | 'aggressive';

/** Body shape drawn inside the (unchanged) hitbox — variety is purely a
 *  render concern, so silhouettes never alter collision or difficulty. */
type Silhouette = 'sedan' | 'coupe' | 'suv' | 'sport';

const SILHOUETTES: Silhouette[] = ['sedan', 'coupe', 'suv', 'sport'];

/** Per-behavior `relSpeed` range (see `TrafficBehavior`). `fast` is the
 *  only band above 1.0 — i.e. the only one that overtakes from behind. */
const BEHAVIOR_SPEED: Record<TrafficBehavior, [number, number]> = {
  slow: [0.04, 0.22],
  normal: [0.30, 0.48],
  fast: [1.14, 1.34],
  changer: [0.28, 0.46],
  aggressive: [0.34, 0.60],
};

/** Seconds a vehicle telegraphs a lane change (blinker + a small lean
 *  toward the target lane) before the change itself actually starts, and
 *  how long the change then takes. Both are deliberately generous: the
 *  brief's "predictable and fair" requirement is enforced here, in time,
 *  as much as it is by the clearance checks in `wantsLaneChange`. */
const SIGNAL_TIME = 0.55;
const CHANGE_TIME = 0.85;

/** Hard ceiling on live entities. Spawning simply no-ops above this, so
 *  traffic density can never run away on a very long run (or on a slow
 *  device where frames — and therefore culling — fall behind). */
const MAX_ENTITIES = 26;

interface Entity {
  kind: EntityKind;
  /** Fractional while a lane change is interpolating; otherwise a whole
   *  lane index. Traffic AI drives this, gameplay reads it via `laneX`. */
  lane: number;
  y: number;
  w: number;
  h: number;
  /** Assigned once at spawn for traffic — purely visual variety. */
  color?: string;
  /** Assigned once at spawn for `car`/`moving` traffic. Visual only. */
  silhouette?: Silhouette;
  /** Set once a near-miss/collision resolves for this entity, so the
   *  graze effect (streak + score bonus) can only ever fire once. */
  grazed?: boolean;

  // ---- traffic AI (undefined on cones / tokens / power-ups) ----
  behavior?: TrafficBehavior;
  /** Current forward speed fraction; eased toward `targetRelSpeed` so
   *  vehicles accelerate and brake rather than snapping. */
  relSpeed?: number;
  targetRelSpeed?: number;
  /** Lane-change state machine. All three are set together at the moment
   *  a change is committed, and cleared together when it completes. */
  fromLane?: number;
  toLane?: number;
  signalUntil?: number;
  changeUntil?: number;
  /** Next `elapsed` at which this vehicle re-evaluates what to do —
   *  staggered per vehicle so the whole field never decides in lockstep. */
  nextDecisionAt?: number;
  /** While set and in the future, this vehicle is deliberately breaking
   *  out of a forming three-lane wall (see `dissolveWalls`). Its speed is
   *  protected from both the car-following brake and the aggressive
   *  behavior's speed re-rolls until it expires. */
  escapeUntil?: number;
}

/** True for anything the player can actually crash into — the set that
 *  spacing, wall-off and lane-clearance checks all reason about. */
function isBlocking(e: Entity) {
  return e.kind === 'car' || e.kind === 'truck' || e.kind === 'cone' || e.kind === 'moving';
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
  return Math.max(0.16, 0.85 - t * 0.023);
}

/** Obstacle variety unlocks progressively rather than all at once — cars
 *  only for the first ~6s, trucks join, cone clusters after 12s,
 *  drifting "moving" traffic once the run is already demanding (30s+),
 *  and past a minute the pool leans harder into the two hardest kinds so
 *  a long run keeps getting tougher instead of plateauing. */
function pickObstacleKind(t: number): EntityKind {
  const pool: EntityKind[] = ['car'];
  if (t > 6) pool.push('car', 'truck');
  if (t > 12) pool.push('cone');
  if (t > 30) pool.push('moving', 'moving');
  if (t > 50) pool.push('moving', 'truck');
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Which driving behaviors are in play, and how common each is, at time
 *  `t`. Deliberately the same weighted-pool shape as `pickObstacleKind`
 *  above: early runs are slow/normal only, overtakers appear once the
 *  player has settled in, lane-changers later still, and genuinely
 *  unpredictable traffic only deep into a run. */
function pickBehavior(t: number): TrafficBehavior {
  const pool: TrafficBehavior[] = ['slow', 'slow', 'normal', 'normal'];
  if (t > 14) pool.push('fast');
  if (t > 24) pool.push('changer', 'normal');
  if (t > 45) pool.push('aggressive', 'changer');
  if (t > 70) pool.push('fast', 'aggressive');
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Minimum vertical clearance enforced between two vehicles sharing a
 *  lane, in px. Tightens as the run progresses — this is what turns
 *  "more vehicles" into "less space between cars" without ever letting
 *  two of them overlap. */
function minGapAt(t: number) {
  return Math.max(62, 170 - t * 1.8);
}

/** How much room a lane-changer must leave the player before it may move
 *  into their lane. Scales with the closing speed so the player always
 *  gets roughly the same *time* to react regardless of how fast the run
 *  has become — the core "challenging but fair" guarantee. */
function fairCutInGap(closingSpeed: number) {
  return Math.max(150, Math.abs(closingSpeed) * 0.85);
}

export default function DriveChallengeGame({
  active,
  onFinish,
  play,
  bestScore = 0,
  bodyColor = '#f2f4ee',
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
    let nearMissFx: NearMissFx[] = [];
    let last = performance.now();

    /** Keeps the combo HUD chip's glow tier in sync with the live combo
     *  value — called only when combo actually changes, not every frame. */
    const applyComboTier = (value: number) => {
      const el = comboChipRef.current;
      if (!el) return;
      el.classList.toggle('drive-combo-max', value >= MAX_COMBO);
      el.classList.toggle('drive-combo-hot', value >= 3 && value < MAX_COMBO);
    };

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

    // ---------------------- traffic spawn safety ----------------------
    // Every one of these is a *fairness* rule, not a difficulty knob: the
    // run is meant to get hard because reacting gets hard, never because
    // something spawned somewhere the player could not have survived.

    /** Is `lane` free of blocking traffic within `gap` px of `y`? Uses each
     *  vehicle's own half-height so a long truck reserves more room than a
     *  cone does. */
    const laneFreeAt = (lane: number, y: number, h: number, gap: number) => {
      for (const o of entities) {
        if (!isBlocking(o)) continue;
        // A vehicle mid-change occupies both lanes for the duration.
        const occupies = o.toLane !== undefined
          ? [Math.round(o.lane), o.toLane]
          : [Math.round(o.lane)];
        if (!occupies.includes(lane)) continue;
        if (Math.abs(o.y - y) < (o.h + h) * 0.5 + gap) return false;
      }
      return true;
    };

    /** Would occupying `lane` at `y` leave the player no gap at all across
     *  the full width of the road? A three-lane wall is unsurvivable by
     *  definition, so it is refused outright — at spawn time and again
     *  before any lane change is committed. */
    const wouldWallOff = (lane: number, y: number, ignore?: Entity) => {
      const blocked = new Set<number>([lane]);
      for (const o of entities) {
        if (o === ignore || !isBlocking(o)) continue;
        if (Math.abs(o.y - y) > 100) continue;
        blocked.add(Math.round(o.lane));
        if (o.toLane !== undefined) blocked.add(o.toLane);
      }
      return blocked.size >= LANES;
    };

    /**
     * Places one entity if — and only if — doing so is safe.
     *
     * `fromBehind` spawns below the frame for overtaking traffic. That
     * case carries one extra hard rule: never behind the player in the
     * player's own lane. A vehicle closing from off-screen behind is the
     * one thing the player genuinely cannot see coming, so it is simply
     * never allowed to start there.
     *
     * Returns whether it actually spawned, so callers can skip their
     * follow-up spawns rather than force them through.
     */
    const spawnTraffic = (
      lane: number,
      kind: EntityKind,
      t: number,
      opts: { fromBehind?: boolean; behavior?: TrafficBehavior } = {},
    ) => {
      if (entities.length >= MAX_ENTITIES) return false;
      const size = kind === 'truck' ? { w: 58, h: 80 } : kind === 'cone' ? { w: 28, h: 32 } : { w: 48, h: 60 };
      const fromBehind = opts.fromBehind ?? false;
      const y = fromBehind ? height + size.h : -size.h;

      if (fromBehind && lane === playerLane) return false;
      const gap = minGapAt(t);
      if (!laneFreeAt(lane, y, size.h, gap)) return false;
      if (wouldWallOff(lane, y)) return false;

      const isVehicle = kind === 'car' || kind === 'truck' || kind === 'moving';
      const e: Entity = {
        kind,
        lane,
        y,
        w: size.w,
        h: size.h,
        color: isVehicle ? TRAFFIC_PALETTE[Math.floor(Math.random() * TRAFFIC_PALETTE.length)] : undefined,
        silhouette:
          kind === 'car' || kind === 'moving'
            ? SILHOUETTES[Math.floor(Math.random() * SILHOUETTES.length)]
            : undefined,
      };

      if (isVehicle) {
        // `moving` is the kind the obstacle pool uses for "this one will
        // change lanes", so it always gets a lane-changing behavior; every
        // other vehicle draws from the time-gated behavior pool.
        const behavior: TrafficBehavior =
          opts.behavior ?? (kind === 'moving' ? (t > 45 && Math.random() < 0.4 ? 'aggressive' : 'changer') : pickBehavior(t));
        const [lo, hi] = BEHAVIOR_SPEED[behavior];
        const rel = lo + Math.random() * (hi - lo);
        e.behavior = behavior;
        e.relSpeed = rel;
        e.targetRelSpeed = rel;
        e.nextDecisionAt = t + 0.6 + Math.random() * 1.4;
      }

      entities.push(e);
      return true;
    };

    /** Picks a lane that is currently safe to spawn into, preferring a
     *  random order so traffic doesn't bias toward lane 0. Returns -1 when
     *  the road is genuinely too busy — the caller then simply skips this
     *  spawn tick, which is what keeps density self-limiting. */
    const pickSpawnLane = (kind: EntityKind, t: number, fromBehind = false) => {
      const h = kind === 'truck' ? 80 : kind === 'cone' ? 32 : 60;
      const y = fromBehind ? height + h : -h;
      const gap = minGapAt(t);
      const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
      for (const lane of lanes) {
        if (fromBehind && lane === playerLane) continue;
        if (!laneFreeAt(lane, y, h, gap)) continue;
        if (wouldWallOff(lane, y)) continue;
        return lane;
      }
      return -1;
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

    // ------------------------- traffic AI -------------------------

    /** Decides whether `e` may begin a lane change to `target` right now.
     *  Every rejection here is a fairness rule; none of them are random,
     *  so a vehicle that *can* legally merge always will, and one that
     *  can't simply waits and re-checks on its next decision tick. */
    const canChangeInto = (e: Entity, target: number, closing: number) => {
      if (target < 0 || target >= LANES) return false;
      // Never cut into the player's lane without leaving reaction room.
      if (target === playerLane && Math.abs(e.y - playerY()) < fairCutInGap(closing)) return false;
      // Never merge onto another vehicle.
      if (!laneFreeAt(target, e.y, e.h, 46)) return false;
      // Never complete a three-lane wall.
      if (wouldWallOff(target, e.y, e)) return false;
      return true;
    };

    /** Advances one vehicle's speed easing and lane-change state machine.
     *  Called only while simulating, once per vehicle per frame. */
    const driveTraffic = (e: Entity, dt: number, speed: number) => {
      if (e.relSpeed === undefined || e.targetRelSpeed === undefined) return;

      // --- car following ---
      // Vehicles now travel at differing speeds, so a faster one will
      // otherwise drive straight through a slower one ahead of it in the
      // same lane. Find the nearest vehicle ahead and, if closing, match
      // its pace. This is what produces natural convoys and spacing
      // instead of cars ghosting through each other.
      const myLane = e.toLane ?? Math.round(e.lane);
      let lead: Entity | null = null;
      for (const o of entities) {
        if (o === e || !isBlocking(o)) continue;
        const oLane = Math.round(o.lane);
        if (oLane !== myLane && o.toLane !== myLane) continue;
        if (o.y >= e.y) continue; // must be ahead on the road (higher up the frame)
        if (!lead || o.y > lead.y) lead = o;
      }
      // Car-following is bypassed only for an *accelerating* break-away,
      // where braking would undo the escape. A decelerating one is left
      // under normal following rules: braking further can only increase
      // the gap, so suppressing it there just caused overlaps.
      const inEscape = e.escapeUntil !== undefined && elapsed < e.escapeUntil;
      const escaping = inEscape && e.targetRelSpeed > e.relSpeed;
      if (e.escapeUntil !== undefined && !inEscape) {
        // Escape over — hand the vehicle back to its own behavior band.
        // Without this it kept the extreme break-away speed permanently,
        // which both looked wrong and (because the band it was rescued
        // from kept re-triggering) starved its lane-change decisions.
        e.escapeUntil = undefined;
        const [lo, hi] = BEHAVIOR_SPEED[e.behavior ?? 'normal'];
        e.targetRelSpeed = lo + Math.random() * (hi - lo);
      }
      if (lead) {
        const gap = e.y - lead.y - (e.h + lead.h) * 0.5;
        const leadRel = lead.relSpeed ?? 0; // a cone has no forward speed
        if (!escaping && leadRel < e.relSpeed && gap < 140) {
          const urgency = Math.min(1, Math.max(0, 1 - gap / 140));
          e.targetRelSpeed = Math.max(0.02, e.relSpeed + (leadRel - e.relSpeed) * (0.45 + urgency * 0.55));
          // Inside braking distance the eased approach below is too slow
          // to stop a visible overlap, so pace is matched outright — at
          // this range the speeds are already close enough not to pop.
          if (gap < 42) e.relSpeed = Math.max(0.02, leadRel);
        }
        // Already touching. Matching pace locks the pair together for
        // good, so the follower is pushed strictly below the leader's
        // speed until the gap physically reopens. This runs even mid
        // break-away — an escape must never drive through anything.
        //
        // The floor is negative on purpose: a cone sits at an effective
        // relSpeed of 0, so a follower clamped at 0.02 could never drop
        // back faster than one and stayed welded to it for the rest of
        // the run. A slightly negative value just reads as the vehicle
        // braking hard, and is what actually guarantees separation.
        if (gap < 4) {
          e.relSpeed = Math.max(-0.15, leadRel - 0.28);
          e.targetRelSpeed = Math.max(-0.15, Math.min(e.targetRelSpeed, leadRel - 0.12));
        }
      }

      // Smooth acceleration / braking rather than instant speed snaps.
      e.relSpeed += (e.targetRelSpeed - e.relSpeed) * Math.min(1, dt * 1.6);

      // --- mid-change: interpolate, then settle ---
      if (e.toLane !== undefined && e.fromLane !== undefined && e.signalUntil !== undefined && e.changeUntil !== undefined) {
        if (elapsed >= e.changeUntil) {
          e.lane = e.toLane;
          e.fromLane = undefined;
          e.toLane = undefined;
          e.signalUntil = undefined;
          e.changeUntil = undefined;
          e.nextDecisionAt = elapsed + 1.4 + Math.random() * 2.2;
        } else if (elapsed >= e.signalUntil) {
          const p = (elapsed - e.signalUntil) / (e.changeUntil - e.signalUntil);
          const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          e.lane = e.fromLane + (e.toLane - e.fromLane) * eased;
        } else {
          // Signalling: lean a fraction of a lane toward the target so the
          // intent is legible from the car's *movement*, not just its
          // blinker — the brief's "signal through movement" requirement.
          const p = 1 - (e.signalUntil - elapsed) / SIGNAL_TIME;
          e.lane = e.fromLane + Math.sign(e.toLane - e.fromLane) * Math.sin(p * Math.PI) * 0.16;
        }
        return;
      }

      if (e.nextDecisionAt === undefined || elapsed < e.nextDecisionAt) return;
      // (decision tick continues below)
      e.nextDecisionAt = elapsed + 0.7 + Math.random() * 1.3;

      const closing = speed * (1 - e.relSpeed);

      // Aggressive traffic also varies its pace, so it can surge or back
      // off unpredictably (within its own behavior band — never beyond).
      if (e.behavior === 'aggressive' && !inEscape && Math.random() < 0.45) {
        const [lo, hi] = BEHAVIOR_SPEED.aggressive;
        e.targetRelSpeed = lo + Math.random() * (hi - lo);
      }

      const mayChange =
        e.behavior === 'changer' ? 0.55 : e.behavior === 'aggressive' ? 0.4 : 0;
      if (Math.random() > mayChange) return;

      const base = Math.round(e.lane);
      // Try the preferred direction first, then the other one, so a
      // blocked vehicle still merges when the opposite side is clear.
      const first = Math.random() < 0.5 ? -1 : 1;
      for (const dir of [first, -first]) {
        const target = base + dir;
        if (!canChangeInto(e, target, closing)) continue;
        e.fromLane = base;
        e.toLane = target;
        e.signalUntil = elapsed + SIGNAL_TIME;
        e.changeUntil = e.signalUntil + CHANGE_TIME;
        return;
      }
    };

    /**
     * The one guarantee `wouldWallOff` alone can't make.
     *
     * That check runs when a vehicle is *placed* or *starts a merge*, but
     * traffic now travels at differing speeds, so three vehicles that were
     * each individually legal can still converge into a three-lane wall
     * further down the road. Left alone that's an unavoidable crash — the
     * exact "difficult because of bad spawning" failure the brief rules
     * out.
     *
     * So the corridor between the horizon and the player is swept a few
     * times a second, and the moment a band goes fully blocked one of its
     * vehicles is told to accelerate away. On screen that reads as a car
     * simply pulling ahead; mechanically it re-opens a lane well before
     * the band ever reaches the player.
     */
    let nextWallCheck = 0;
    const dissolveWalls = (t: number) => {
      if (t < nextWallCheck) return;
      nextWallCheck = t + 0.1;
      const py = playerY();

      // An overtaker sitting off-screen below the player, in the player's
      // own lane, is the one hazard that can never be seen coming — it is
      // refused at spawn, but the player can still change lanes into one.
      // Moving it aside while it is still off-screen costs nothing
      // visually and removes the blind rear-end entirely.
      for (const o of entities) {
        if (o.relSpeed === undefined || o.relSpeed <= 1) continue;
        if (o.y < height + 10) continue; // already on screen — leave it alone
        if (Math.round(o.lane) !== playerLane) continue;
        const alt = [playerLane - 1, playerLane + 1].filter((l) => l >= 0 && l < LANES);
        const free = alt.find((l) => laneFreeAt(l, o.y, o.h, 40));
        if (free !== undefined) o.lane = free;
      }

      for (const a of entities) {
        // Only bands still ahead of the player can still be escaped.
        if (!isBlocking(a) || a.y > py - 40 || a.y < -100) continue;

        // A tight band — roughly one car length. A wider window flagged
        // ordinary staggered traffic (which the player can still thread
        // diagonally) as impassable, so this fired almost every sweep and
        // kept half the field locked at break-away speed.
        const group: Entity[] = [];
        const lanes = new Set<number>();
        for (const o of entities) {
          if (!isBlocking(o) || Math.abs(o.y - a.y) > 48) continue;
          group.push(o);
          lanes.add(Math.round(o.lane));
          if (o.toLane !== undefined) lanes.add(o.toLane);
        }
        if (lanes.size < LANES) continue;

        // Cones can't move, so only a real vehicle can break the wall.
        // Prefer one that isn't already mid-merge; fall back to a merging
        // one (aborting its merge) rather than giving up on the band.
        // A vehicle already breaking away is mid-solution — re-tagging it
        // every sweep is what previously pinned traffic at escape speed
        // and starved its decision timer, so those are skipped outright.
        // If the whole group is already escaping, the band is resolving
        // on its own and needs nothing further.
        const candidates = group.filter(
          (o) => o.relSpeed !== undefined && !(o.escapeUntil !== undefined && t < o.escapeUntil),
        );
        const mover =
          candidates.find((o) => o.toLane === undefined) ?? candidates[0];
        if (!mover) continue;

        mover.fromLane = undefined;
        mover.toLane = undefined;
        mover.signalUntil = undefined;
        mover.changeUntil = undefined;

        // The escape has to be one car-following will not immediately undo.
        // Accelerating away only works with clear road ahead — otherwise
        // the follow logic brakes it straight back into the wall, which is
        // exactly the deadlock this used to create. With traffic ahead,
        // dropping back is always available and just as effective: the
        // vehicle falls out of the band, reopening a lane above it, and
        // becomes a single avoidable obstacle rather than part of a wall.
        const lane = Math.round(mover.lane);
        const blocked = entities.some(
          (o) => o !== mover && isBlocking(o) && Math.round(o.lane) === lane && o.y < mover.y && mover.y - o.y < 190,
        );
        if (blocked) {
          mover.targetRelSpeed = 0.02;
          mover.relSpeed = Math.min(mover.relSpeed ?? 0, 0.1);
        } else {
          mover.targetRelSpeed = 1.45;
          mover.relSpeed = Math.max(mover.relSpeed ?? 0, 1.05);
        }
        // Deliberately NOT rewriting `behavior` — doing so used to convert
        // lane-changers into 'fast' permanently, silently removing merging
        // traffic from the rest of the run. `escapeUntil` instead protects
        // the new speed from being re-randomised on the next decision tick.
        mover.escapeUntil = t + 1.6;
        // `nextDecisionAt` is deliberately left alone — pushing it here
        // meant a vehicle rescued repeatedly never reached its own
        // decision tick, and so never changed lanes for the whole run.
        // Keep sweeping: with several bands in flight at once, fixing only
        // the first still left later ones to reach the player intact.
      }
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
          if (entities.length >= MAX_ENTITIES) {
            // Road is already at capacity — skip this tick entirely rather
            // than letting pickups slip past the cap that traffic respects.
          } else if (roll < 0.04) {
            const p = Math.random();
            const kind: EntityKind = p < 0.34 ? 'shield' : p < 0.67 ? 'multiplier' : 'boost';
            entities.push({ kind, lane: Math.floor(Math.random() * LANES), y: -40, w: 30, h: 30 });
          } else if (roll < 0.3) {
            entities.push({ kind: 'token', lane: Math.floor(Math.random() * LANES), y: -40, w: 34, h: 34 });
          } else {
            const kind = pickObstacleKind(elapsed);
            if (kind === 'cone') {
              // Needle-thread pair: two of the three lanes get a cone,
              // leaving exactly one gap — tests precise lane holding
              // rather than a reactive dodge.
              const lanes = [0, 1, 2];
              const a = lanes.splice(Math.floor(Math.random() * lanes.length), 1)[0];
              const b = lanes[Math.floor(Math.random() * lanes.length)];
              spawnTraffic(a, 'cone', elapsed);
              spawnTraffic(b, 'cone', elapsed);
            } else {
              // `moving` is the obstacle pool's "this one changes lanes"
              // kind, so it keeps the lane-changer behavior `spawnTraffic`
              // assigns it rather than drawing from the general pool —
              // otherwise it could come out 'slow' and never merge at all,
              // silently removing the hardest traffic type from late runs.
              // Everything else draws from the pool, and overtakers come up
              // from behind instead of drifting back.
              const behavior = kind === 'moving' ? undefined : pickBehavior(elapsed);
              const fromBehind = behavior === 'fast';
              const firstLane = pickSpawnLane(kind, elapsed, fromBehind);
              if (firstLane >= 0) {
                const placed = spawnTraffic(firstLane, kind, elapsed, { fromBehind, behavior });
                const waveChance = elapsed > 14 ? Math.min(0.7, (elapsed - 14) * 0.02) : 0;
                if (placed && !fromBehind && Math.random() < waveChance) {
                  // A second, distinct lane — `pickSpawnLane` re-runs every
                  // clearance check against the vehicle just placed, so a
                  // wave can tighten the road without ever sealing it off.
                  const secondKind = pickObstacleKind(elapsed);
                  const secondLane = pickSpawnLane(secondKind, elapsed);
                  if (secondLane >= 0 && secondLane !== firstLane) {
                    spawnTraffic(secondLane, secondKind, elapsed);
                  }
                }
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

        dissolveWalls(elapsed);

        const px = laneX(playerLane);
        const py = playerY();
        const next: Entity[] = [];
        for (const e of entities) {
          driveTraffic(e, dt, speed);
          // A vehicle's own forward speed subtracts from the road's, so
          // relSpeed < 1 drifts back toward the player and > 1 pulls away
          // up the frame. Props (cones/tokens/power-ups) have no relSpeed
          // and therefore still scroll at exactly the road speed.
          e.y += speed * (1 - (e.relSpeed ?? 0)) * dt;
          // Culled at both ends now that traffic can leave via the top.
          if (e.y > height + 60 || e.y < -160) continue;

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

      // A couple of soft clouds drifting through the sky band — drift now
      // has a distance-linked component on top of the ambient baseline,
      // so the sky visibly speeds up along with everything else.
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 3; i++) {
        const drift = reducedMotion ? 0 : elapsed * 5 + distanceUnits * 0.006;
        const cx = ((drift + i * 150 + 40) % (width + 160)) - 80;
        const cy = height * (0.035 + i * 0.028);
        for (const [dx, dy, r] of [[0, 0, 15], [16, 3, 11], [-14, 4, 10]] as const) {
          ctx.beginPath();
          ctx.ellipse(cx + dx, cy + dy, r, r * 0.62, 0, 0, Math.PI * 2);
          ctx.fill();
        }
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
        const tone = i % 2 === 0 ? '#8b9aa6' : '#a3b0ba';
        ctx.fillStyle = tone;
        ctx.beginPath();
        roundRect(ctx, bx, by, bw, bh, 2);
        ctx.fill();
        // A few lit windows — every other one tinted CX green, faint.
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let wy = by + 6; wy < by + bh - 5; wy += 9) {
          for (let wx = bx + 5; wx < bx + bw - 5; wx += 9) {
            ctx.fillStyle = (wx + wy) % 27 < 9 ? 'rgba(0,212,71,0.35)' : 'rgba(255,255,255,0.4)';
            ctx.fillRect(wx, wy, 2.6, 3.4);
          }
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

      // Roadside props — street lamps (pole + arm + glowing head) drifting
      // past outside the rails, plus a CX-branded sign every third pole on
      // alternating sides. All positioned from `distanceUnits` alone (no
      // persistent array, same trick the speed-lines below already use);
      // `poleIndex` only needs to be stable frame-to-frame, which the loop
      // already guarantees since it's derived from the same offset.
      const poleSpacing = 260;
      const poleOffset = distanceUnits * 0.6;
      let poleIndex = Math.round(poleOffset / poleSpacing);
      for (let y = -((poleOffset % poleSpacing)); y < height; y += poleSpacing, poleIndex++) {
        for (const side of [-1, 1] as const) {
          const x = side === -1 ? railInset - 5 : width - railInset + 5;
          // Shaft.
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(x - 1, y, 2, 26);
          // Short arm curling toward the road, then a glowing lamp head —
          // reads as an actual street light rather than a bare dot.
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + side * 7, y - 3);
          ctx.stroke();
          const lampGlow = ctx.createRadialGradient(x + side * 8, y - 3, 0, x + side * 8, y - 3, 9);
          lampGlow.addColorStop(0, 'rgba(255,250,220,0.55)');
          lampGlow.addColorStop(1, 'rgba(255,250,220,0)');
          ctx.fillStyle = lampGlow;
          ctx.beginPath();
          ctx.arc(x + side * 8, y - 3, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff8e0';
          ctx.beginPath();
          ctx.arc(x + side * 8, y - 3, 2, 0, Math.PI * 2);
          ctx.fill();

          // A CX road sign on every third pole, alternating sides so it
          // doesn't read as a mirrored repeat of the lamp above it.
          if (poleIndex % 3 === 0 && side === (poleIndex % 6 === 0 ? -1 : 1)) {
            const signY = y + 34;
            ctx.fillStyle = '#00893f';
            roundRect(ctx, x - 13, signY, 26, 15, 3);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            roundRect(ctx, x - 13, signY, 26, 15, 3);
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.font = "700 9px system-ui, -apple-system, 'Segoe UI', sans-serif";
            ctx.fillStyle = '#fff';
            ctx.fillText('CX', x, signY + 11);
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

          // Body radius carries a lot of the silhouette read: a boxy SUV
          // and a low sports car are the same hitbox, drawn differently.
          const sil = e.silhouette ?? 'sedan';
          const radius = e.kind === 'truck' ? 7 : sil === 'suv' ? 5 : sil === 'sport' ? 13 : sil === 'coupe' ? 11 : 9;

          const bodyGrad = ctx.createLinearGradient(x - e.w / 2, e.y - e.h / 2, x + e.w / 2, e.y + e.h / 2);
          bodyGrad.addColorStop(0, shade(base, 16));
          bodyGrad.addColorStop(0.5, base);
          bodyGrad.addColorStop(1, shade(base, -20));
          ctx.fillStyle = bodyGrad;
          roundRect(ctx, x - e.w / 2, e.y - e.h / 2, e.w, e.h, radius);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1.2;
          roundRect(ctx, x - e.w / 2, e.y - e.h / 2, e.w, e.h, radius);
          ctx.stroke();

          // Glass band — position/width per silhouette (top edge is the
          // side facing the player, since traffic scrolls downward).
          ctx.fillStyle = 'rgba(10,13,11,0.55)';
          if (e.kind === 'truck') {
            roundRect(ctx, x - e.w * 0.36, e.y - e.h * 0.34, e.w * 0.72, e.h * 0.24, 4);
          } else if (sil === 'coupe') {
            roundRect(ctx, x - e.w * 0.3, e.y - e.h * 0.26, e.w * 0.6, e.h * 0.17, 5);
          } else if (sil === 'suv') {
            roundRect(ctx, x - e.w * 0.38, e.y - e.h * 0.36, e.w * 0.76, e.h * 0.29, 3);
          } else if (sil === 'sport') {
            roundRect(ctx, x - e.w * 0.27, e.y - e.h * 0.2, e.w * 0.54, e.h * 0.15, 5);
          } else {
            roundRect(ctx, x - e.w * 0.36, e.y - e.h * 0.34, e.w * 0.72, e.h * 0.24, 4);
          }
          ctx.fill();

          // Tail lights.
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
          } else if (sil === 'suv') {
            // Roof rails.
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = 1.4;
            for (const sx of [-0.3, 0.3]) {
              ctx.beginPath();
              ctx.moveTo(x + e.w * sx, e.y - e.h * 0.38);
              ctx.lineTo(x + e.w * sx, e.y + e.h * 0.06);
              ctx.stroke();
            }
          } else if (sil === 'sport') {
            // Rear wing across the trailing edge + a centre racing stripe.
            ctx.fillStyle = shade(base, -34);
            roundRect(ctx, x - e.w * 0.42, e.y + e.h * 0.3, e.w * 0.84, 4.5, 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(x - e.w * 0.05, e.y - e.h * 0.44, e.w * 0.1, e.h * 0.66);
          } else if (sil === 'coupe') {
            // A single shoulder crease down the flank.
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x - e.w * 0.4, e.y - e.h * 0.06);
            ctx.lineTo(x + e.w * 0.4, e.y - e.h * 0.06);
            ctx.stroke();
          }

          // Turn signal — blinks on the side a vehicle is about to move
          // toward, from the moment it commits until the change finishes.
          // Paired with the small lean `driveTraffic` applies during the
          // same window, this is what makes a merge readable in advance.
          if (e.toLane !== undefined && e.fromLane !== undefined) {
            const dir = Math.sign(e.toLane - e.fromLane);
            const on = Math.floor(elapsed * 6) % 2 === 0;
            if (dir !== 0 && on) {
              const bx = x + dir * e.w * 0.42;
              ctx.save();
              ctx.shadowColor = 'rgba(255,176,46,0.9)';
              ctx.shadowBlur = 8;
              ctx.fillStyle = '#ffb02e';
              ctx.beginPath();
              ctx.arc(bx, e.y - e.h * 0.34, 3.2, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(bx, e.y + e.h * 0.34, 3.2, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
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

      // Ambient under-glow — scales with speed (the car visibly "heats
      // up" as it accelerates through the run, not just during boost),
      // brightest of all under an actual boost.
      const speedT = Math.min(1, Math.max(0, (speed - 220) / 700));
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

      // Headlights — twin, glowing, and a touch brighter at speed.
      const hlY = -CAR_H * 0.06;
      const hlColor = carState === 'crash' ? '#ffb199' : '#eaffef';
      for (const side of [-1, 1]) {
        const hx = side * CAR_W * 0.34;
        ctx.save();
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 11 + speedT * 7;
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
  }, [bestScore, bodyColor]);

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
