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
  /** Set the instant this entity's y first passes the player's own y —
   *  i.e. the moment it's actually behind the car, not just alongside
   *  it. Purely a one-shot cosmetic trigger (see the overtake flash
   *  below); never touches score, same as `grazed` never re-fires. */
  overtaken?: boolean;
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

/** The player car's five catalog silhouettes (see CAR_CATALOG in
 *  DriveChallengeLauncher.tsx) — every one drawn as vector paths, same
 *  technique as the traffic cars below, rather than a pre-rendered still.
 *  Each `right` profile lists half-width/height fractions (of CAR_W/
 *  CAR_H) from nose (always x=0) to tail, down the right side only; the
 *  left side is generated by exact mirroring, so the body is always
 *  perfectly symmetric by construction. */
type CarDesign = 'gt' | 'sport' | 'r' | 'hyper' | 'x';

interface BodyProfile {
  right: [number, number][];
  /** 0 = the tail comes to a point; 1 = a fully flat cut. */
  tailFlat: number;
  frontTrackW: number;
  rearTrackW: number;
  glassWidth: number;
  glassSpan: [number, number];
  accent: 'chrome' | 'stripes' | 'vents' | 'spine' | 'duotone';
  spoiler: 'none' | 'lip' | 'wing';
  /** Purely visual wheel-track widening for wide-body designs — the
   *  wheels are still drawn well inside the fixed CAR_W/CAR_H footprint
   *  every design shares, so this never touches the collision hit-test. */
  stance: number;
}

const CAR_DESIGNS: Record<CarDesign, BodyProfile> = {
  gt: {
    right: [[0, -0.5], [0.28, -0.3], [0.4, -0.06], [0.37, 0.14], [0.38, 0.32], [0.24, 0.48]],
    tailFlat: 0.35, frontTrackW: 0.28, rearTrackW: 0.38,
    glassWidth: 0.3, glassSpan: [-0.28, 0.1], accent: 'chrome', spoiler: 'none', stance: 1,
  },
  sport: {
    right: [[0, -0.5], [0.25, -0.3], [0.38, -0.06], [0.34, 0.14], [0.42, 0.32], [0.27, 0.48]],
    tailFlat: 0.45, frontTrackW: 0.25, rearTrackW: 0.42,
    glassWidth: 0.27, glassSpan: [-0.26, 0.08], accent: 'stripes', spoiler: 'lip', stance: 1.03,
  },
  r: {
    right: [[0, -0.5], [0.33, -0.3], [0.43, -0.06], [0.4, 0.14], [0.44, 0.32], [0.32, 0.48]],
    tailFlat: 0.6, frontTrackW: 0.33, rearTrackW: 0.44,
    glassWidth: 0.32, glassSpan: [-0.27, 0.09], accent: 'vents', spoiler: 'lip', stance: 1.06,
  },
  hyper: {
    right: [[0, -0.5], [0.29, -0.3], [0.33, -0.06], [0.4, 0.14], [0.46, 0.32], [0.38, 0.48]],
    tailFlat: 0.75, frontTrackW: 0.29, rearTrackW: 0.46,
    glassWidth: 0.24, glassSpan: [-0.24, 0.04], accent: 'spine', spoiler: 'wing', stance: 1.1,
  },
  x: {
    // Widened further from `hyper` than before — the flagship reads as
    // a substantial, wide-bodied GT (a genuinely different category:
    // presence over rawness) rather than a narrower reskin of the
    // extreme low/narrow hypercar it used to sit right next to.
    right: [[0, -0.5], [0.34, -0.3], [0.45, -0.06], [0.44, 0.14], [0.48, 0.32], [0.36, 0.48]],
    tailFlat: 0.5, frontTrackW: 0.34, rearTrackW: 0.48,
    glassWidth: 0.31, glassSpan: [-0.27, 0.09], accent: 'duotone', spoiler: 'lip', stance: 1.06,
  },
};

/** Builds the closed, mirror-symmetric body silhouette for the current
 *  path — a classic "rounded polygon" pass (curve through each profile
 *  point toward the midpoint of the next) rather than plain straight
 *  segments, which is what turns a handful of control points into a
 *  smooth fender/cabin/haunch line instead of a faceted outline. */
function traceBodyPath(ctx: CanvasRenderingContext2D, profile: BodyProfile, w: number, h: number) {
  const right = profile.right.map(([fx, fy]) => [fx * w, fy * h] as [number, number]);
  const stripTail = profile.tailFlat <= 0.02;
  const mirrorSource = right.slice(1, stripTail ? -1 : undefined);
  const left = mirrorSource.slice().reverse().map(([x, y]) => [-x, y] as [number, number]);
  const pts = [...right, ...left];
  const n = pts.length;
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath();
  const start = mid(pts[n - 1], pts[0]);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const m = mid(cur, next);
    ctx.quadraticCurveTo(cur[0], cur[1], m[0], m[1]);
  }
  ctx.closePath();
}

/** Draws the player's car body, in local car-space (already translated
 *  to the car's position and rotated to its lean) — wheels, painted
 *  body with a specular clear-coat sweep, a design-specific accent,
 *  glass canopy and, where the design calls for one, a spoiler/wing.
 *  Caller is expected to have already set the desired drop-shadow
 *  (boost glow vs. plain contact shadow) on `ctx` — that shadow is
 *  applied only to the body silhouette itself (cleared for the finer
 *  wheel/accent/glass detail below it) so it reads as one clean drop
 *  shadow rather than a stack of blurred layers. */
function drawPlayerBody(
  ctx: CanvasRenderingContext2D,
  design: CarDesign,
  bodyColor: string,
  w: number,
  h: number,
  wheelSteer: number,
) {
  const p = CAR_DESIGNS[design];
  const frontY = -0.3 * h;
  const rearY = 0.32 * h;

  const drawWheel = (wx: number, wy: number, steer: number) => {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(steer);
    ctx.fillStyle = '#0c0c0d';
    roundRect(ctx, -3.6, -8, 7.2, 16, 2.6);
    ctx.fill();
    const rim = ctx.createLinearGradient(-2, -6, 2, 6);
    rim.addColorStop(0, 'rgba(224,226,222,0.9)');
    rim.addColorStop(0.5, 'rgba(150,154,150,0.6)');
    rim.addColorStop(1, 'rgba(110,114,110,0.6)');
    ctx.fillStyle = rim;
    roundRect(ctx, -1.7, -5.6, 3.4, 11.2, 1.6);
    ctx.fill();
    ctx.restore();
  };

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  drawWheel(-p.frontTrackW * w, frontY, wheelSteer);
  drawWheel(p.frontTrackW * w, frontY, wheelSteer);
  drawWheel(-p.rearTrackW * w, rearY, 0);
  drawWheel(p.rearTrackW * w, rearY, 0);
  ctx.restore();

  // ---- painted body — the one shape that keeps the caller's shadow ----
  traceBodyPath(ctx, p, w, h);
  const bodyGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  bodyGrad.addColorStop(0, shade(bodyColor, 26));
  bodyGrad.addColorStop(0.38, bodyColor);
  bodyGrad.addColorStop(0.62, shade(bodyColor, -6));
  bodyGrad.addColorStop(1, shade(bodyColor, -26));
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;

  // Specular sweep — a soft diagonal band of light across the paint, the
  // cheap "clear-coat under a bright sky" read every hero render needs.
  traceBodyPath(ctx, p, w, h);
  ctx.clip();
  const sweep = ctx.createLinearGradient(-w * 0.5, -h * 0.5, w * 0.15, h * 0.1);
  sweep.addColorStop(0, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.42, 'rgba(255,255,255,0.32)');
  sweep.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  sweep.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sweep;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  // ---- design-specific accent, clipped to the same silhouette ----
  if (p.accent === 'stripes') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-w * 0.09, -h * 0.48, w * 0.07, h * 0.96);
    ctx.fillRect(w * 0.02, -h * 0.48, w * 0.07, h * 0.96);
  } else if (p.accent === 'vents') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(-w * 0.34, -h * 0.14, 4, h * 0.18);
    ctx.fillRect(w * 0.3, -h * 0.14, 4, h * 0.18);
    ctx.fillStyle = shade(bodyColor, -30);
    ctx.fillRect(-w * 0.06, -h * 0.42, w * 0.12, h * 0.14);
  } else if (p.accent === 'spine') {
    const spine = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
    spine.addColorStop(0, 'rgba(0,0,0,0.55)');
    spine.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = spine;
    ctx.fillRect(-w * 0.035, -h * 0.46, w * 0.07, h * 0.92);
  } else if (p.accent === 'duotone') {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(-w * 0.5, -h * 0.5, w, h * 0.3);
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, h * 0.08);
    ctx.lineTo(w * 0.4, h * 0.08);
    ctx.stroke();
  }
  ctx.restore();

  // ---- glass canopy ----
  const [gy0, gy1] = p.glassSpan;
  ctx.save();
  roundRect(ctx, -p.glassWidth * w, gy0 * h, p.glassWidth * w * 2, (gy1 - gy0) * h, w * 0.12);
  const glassGrad = ctx.createLinearGradient(0, gy0 * h, 0, gy1 * h);
  glassGrad.addColorStop(0, 'rgba(16,20,24,0.94)');
  glassGrad.addColorStop(1, 'rgba(40,48,54,0.85)');
  ctx.fillStyle = glassGrad;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(-p.glassWidth * w, gy0 * h);
  ctx.lineTo(-p.glassWidth * w * 0.2, gy0 * h);
  ctx.lineTo(-p.glassWidth * w * 0.6, gy1 * h);
  ctx.lineTo(-p.glassWidth * w, gy1 * h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ---- spoiler / rear wing ----
  if (p.spoiler === 'lip') {
    ctx.fillStyle = shade(bodyColor, -32);
    roundRect(ctx, -w * 0.36, h * 0.42, w * 0.72, h * 0.045, 2);
    ctx.fill();
  } else if (p.spoiler === 'wing') {
    ctx.fillStyle = '#111214';
    roundRect(ctx, -w * 0.32, h * 0.3, w * 0.04, h * 0.16, 1);
    ctx.fill();
    roundRect(ctx, w * 0.28, h * 0.3, w * 0.04, h * 0.16, 1);
    ctx.fill();
    const wingGrad = ctx.createLinearGradient(-w * 0.42, 0, w * 0.42, 0);
    wingGrad.addColorStop(0, shade(bodyColor, -20));
    wingGrad.addColorStop(0.5, shade(bodyColor, 12));
    wingGrad.addColorStop(1, shade(bodyColor, -20));
    ctx.fillStyle = wingGrad;
    roundRect(ctx, -w * 0.42, h * 0.3, w * 0.84, h * 0.055, 2);
    ctx.fill();
  }

  // Crisp hairline redrawn on top so accents/glass/spoiler never visually
  // bleed past the true silhouette edge.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  traceBodyPath(ctx, p, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
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
  startEngine = () => {},
  updateEngine = () => {},
  stopEngine = () => {},
  bestScore = 0,
  bodyColor = '#f2f4ee',
  carId,
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
  /** Continuous speed-drone controls (see `useGameAudio`) — started the
   *  first simulating frame, retuned every simulating frame after with
   *  the same 0–1 speed fraction the camera-punch effect already uses,
   *  and stopped the instant simulation isn't running (paused, crashed,
   *  or the run just plain hasn't started yet). All three default to a
   *  no-op so a caller that doesn't care about the drone — there is
   *  none today, but the props are optional for the same reason `play`
   *  itself only needs a real implementation from the one real caller. */
  startEngine?: () => void;
  updateEngine?: (intensity: number) => void;
  stopEngine?: () => void;
  /** Personal best going into this run — shown as a HUD target, and the
   *  score chip flashes once the live score actually clears it. Purely
   *  a display value, never fed back into scoring. */
  bestScore?: number;
  /** Player car paint color, driven by the Garage's selected vehicle —
   *  purely a render input (crash/shield states still override it).
   *  Defaults to the original off-white paint so every existing caller
   *  that doesn't pass this looks exactly as before. */
  bodyColor?: string;
  /** Which of the five catalog silhouettes (see `CAR_DESIGNS` above) to
   *  draw — authoritative over the `bodyColor`-keyed fallback lookup so a
   *  future catalog entry that reuses an existing paint color still gets
   *  its own body shape. Optional purely for the type to accept an older
   *  caller; every real call site (the Launcher) always passes it. */
  carId?: string;
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
  const speedChipRef = useRef<HTMLDivElement>(null);
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
  const startEngineRef = useRef(startEngine);
  startEngineRef.current = startEngine;
  const updateEngineRef = useRef(updateEngine);
  updateEngineRef.current = updateEngine;
  const stopEngineRef = useRef(stopEngine);
  stopEngineRef.current = stopEngine;
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

    // The player car itself is drawn entirely as vector paths (see
    // `drawPlayerBody` below) — matching the rest of this scene (traffic,
    // road, roadside dressing) rather than the flat, low-poly pre-rendered
    // stills a Blender pass produced. `carDesign` picks which of the five
    // catalog silhouettes to build (see CAR_CATALOG in
    // DriveChallengeLauncher.tsx); `carId` is authoritative when passed,
    // falling back to a colour lookup for defensiveness the same way
    // `bodyColor` itself already defaults to the GT hex when no prop is
    // passed.
    const CAR_DESIGN_BY_COLOR: Record<string, CarDesign> = {
      '#f2f4ee': 'gt',
      '#00d447': 'sport',
      '#2f6fe0': 'r',
      '#1c1f1c': 'hyper',
      '#c9d8f5': 'x',
    };
    const carDesign: CarDesign =
      (carId && CAR_DESIGNS[carId as CarDesign] ? (carId as CarDesign) : undefined) ??
      CAR_DESIGN_BY_COLOR[bodyColor] ??
      'gt';

    // Roadside prop sprites — real Blender models (street_lamp.glb,
    // guardrail.glb, road_sign.glb from the CX_DRIVE_ASSETS Road Pack),
    // rendered from the side/perspective angle this game's roadside
    // props already use (not the car's top-down framing). Same
    // undecoded-image-is-a-no-op contract as `logoImg` above.
    const lampImg = new Image();
    lampImg.src = '/sprites/cx-drive-prop-lamp.png';
    const barrierImg = new Image();
    barrierImg.src = '/sprites/cx-drive-prop-barrier.png';
    const signImg = new Image();
    signImg.src = '/sprites/cx-drive-prop-sign.png';

    const laneX = (lane: number) => (width / LANES) * (lane + 0.5);
    const playerY = () => height - 120;
    // Purely a draw-size multiplier — entities feel closer/larger as they
    // near the bottom of the frame and smaller as they spawn near the top.
    // Never touches `e.w`/`e.h` themselves, so the hit-test above (which
    // reads those fields directly) is completely unaffected.
    const depthScale = (y: number) => 0.62 + Math.min(1, Math.max(0, y / height)) * 0.5;

    let playerLane = 1;
    let currentLaneX = laneX(playerLane);
    // The lateral speed `currentLaneX` is moving at — the one extra bit
    // of state a spring-damper needs over a plain lerp. Lets a lane
    // change carry a touch of weight (a small, controlled overshoot as
    // the car settles into the new lane) instead of gliding to a stop
    // exactly on target, the way a real chassis settling on its
    // suspension would rather than teleporting along an eased curve.
    let laneVelocity = 0;
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
    // Tracks whether the engine drone is currently playing — started the
    // first simulating frame, stopped the instant simulation isn't
    // running (paused, crashed, or not yet begun), independent of every
    // other piece of state here so pause/resume can toggle it freely.
    let engineOn = false;
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

      if (simulating && !engineOn) {
        engineOn = true;
        startEngineRef.current();
      } else if (!simulating && engineOn) {
        engineOn = false;
        stopEngineRef.current();
      }

      if (simulating) {
        elapsed += dt;
        speed = speedAt(elapsed, topSpeedMul, accelMul) * (elapsed < boostUntil ? 1.35 : 1);
        // Same 0–1 speed fraction the camera-punch/speed-line effects
        // further down already derive from `speed` — retunes the engine
        // drone every simulating frame so the note and the visual sense
        // of speed always rise together.
        updateEngineRef.current(Math.min(1, Math.max(0, (speed - 220) / 700)));
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

        // Slightly under-damped spring-mass instead of a plain lerp — the
        // car still snaps toward the target lane about as quickly as the
        // old `dt * 12` factor did, but now carries a small, controlled
        // overshoot-and-settle rather than gliding to a dead stop exactly
        // on target. `omega0` sets how snappy the response is (scaled by
        // `handlingMul`, same knob the old lerp used); `zeta` just under
        // 1 keeps the overshoot subtle — a real damping ratio, not just
        // a fudge factor, so it can't blow up even at the loop's worst-
        // case clamped `dt`.
        const target = laneX(playerLane);
        const omega0 = 13 * handlingMul;
        const zeta = 0.88;
        const springAccel = (target - currentLaneX) * (omega0 * omega0) - laneVelocity * (2 * zeta * omega0);
        laneVelocity += springAccel * dt;
        currentLaneX += laneVelocity * dt;

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
          // A sharp lane change only chirps the tires once the run is
          // genuinely fast (matches the speed-lines' own 380 threshold
          // below) — at low speed the same move is just a lane change,
          // not hard enough cornering to earn the sound.
          if (speed > 380) playRef.current('screech');
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

          // Overtake acknowledgment — the instant a real traffic vehicle's
          // y first reaches the player's own (i.e. it's actually behind
          // the car now, not just alongside it), a quick quiet streak
          // marks the moment. No score change: passing a car at a
          // comfortable distance is already its own reward via not
          // crashing into it, and the near-miss system above already
          // pays out for anything close enough to matter. `overtaken`
          // guards it the same way `grazed` guards near-miss — once
          // per entity, never re-fires as it keeps scrolling past.
          if (!e.overtaken && e.y >= py && (e.kind === 'car' || e.kind === 'truck' || e.kind === 'moving')) {
            e.overtaken = true;
            spawnBurst(ex, py, 3, { spread: 0.4, speed: 140, size: 1.8, color: 'rgba(0,212,71,0.55)', life: 0.28, mode: 'streak' });
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
        // A warm "redline" glow once the car is deep into its own top-
        // speed range — the same escalating-feedback idea the combo chip
        // already uses, just tied to velocity. `topSpeedKmh` is this
        // car's own realistic cap, so a slower car redlines at its own
        // pace rather than needing the absolute 425 ceiling every time.
        speedChipRef.current?.classList.toggle('drive-speed-redline', displaySpeed >= topSpeedKmh * 0.82);
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
        if (speed > 680) {
          const jitter = Math.min(2, (speed - 680) / 80);
          jx = (Math.random() - 0.5) * jitter;
          jy = (Math.random() - 0.5) * jitter;
        }
      }

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(punch, punch);
      ctx.translate(-width / 2 + jx, -height / 2 + jy);

      // ---- premium evening/night highway environment (road, verges) ----
      // The road/verge/guardrail fills all start at y=0 now — no sky-only
      // band above them at all. There used to be one (first shrunk, then
      // still visibly a separate strip): a flat-colored area above the
      // painted road that read as a disconnected section rather than the
      // road continuing naturally to the top of the frame. Removing it
      // outright is what actually fixes that, rather than shrinking it
      // and hoping it reads as a natural horizon — the road surface (and
      // the depth cue of the guardrails converging toward the top) is now
      // the ONLY thing above the car, all the way to y=0.
      const horizonY = 0;
      // A deep indigo-to-noir base tone, painted once as a safety
      // background under the (now full-height) road fills — practically
      // never visible itself, but keeps the canvas from ever showing a
      // default/transparent color at a seam or on the very first frame
      // before anything else has painted.
      ctx.fillStyle = '#141821';
      ctx.fillRect(-4, -4, width + 8, height + 8);

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
        const grad = ctx.createLinearGradient(0, horizonY + height * 0.04, 0, height);
        grad.addColorStop(0, '#1f3a2c');
        grad.addColorStop(1, '#12261c');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(side === -1 ? 0 : width, horizonY);
        ctx.lineTo(tx, horizonY);
        ctx.lineTo(bx, height);
        ctx.lineTo(side === -1 ? 0 : width, height);
        ctx.closePath();
        ctx.fill();
        // mow-stripe texture — quieter than the daylight version, just
        // enough to read as tended grass rather than a flat fill.
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 10;
        for (let y = horizonY + height * 0.05; y < height; y += 34) {
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
        const grad = ctx.createLinearGradient(0, horizonY, 0, height);
        grad.addColorStop(0, '#3a3f45');
        grad.addColorStop(1, '#54595f');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(tx0, horizonY);
        ctx.lineTo(tx1, horizonY);
        ctx.lineTo(bx1, height);
        ctx.lineTo(bx0, height);
        ctx.closePath();
        ctx.fill();

        const seamSpacing = 46;
        const seamOffset = distanceUnits * 0.6;
        for (let y = ((seamOffset % seamSpacing) - seamSpacing); y < height; y += seamSpacing) {
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
      const roadGrad = ctx.createLinearGradient(0, horizonY, 0, height);
      roadGrad.addColorStop(0, '#2b3038');
      roadGrad.addColorStop(0.55, '#20242a');
      roadGrad.addColorStop(1, '#131518');
      ctx.fillStyle = roadGrad;
      ctx.beginPath();
      ctx.moveTo(railTopInset + 5, horizonY);
      ctx.lineTo(width - railTopInset - 5, horizonY);
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
      ctx.moveTo(railTopInset + 5, horizonY);
      ctx.lineTo(width - railTopInset - 5, horizonY);
      ctx.lineTo(width - railInset - 13, height);
      ctx.lineTo(railInset + 13, height);
      ctx.closePath();
      ctx.clip();
      const reflectDrift = reducedMotion ? 0.5 : 0.5 + Math.sin(elapsed * 0.17) * 0.5;
      const reflectX = width * (0.15 + reflectDrift * 0.7);
      const sheen = ctx.createLinearGradient(reflectX - width * 0.3, horizonY, reflectX + width * 0.3, height);
      sheen.addColorStop(0, 'rgba(180,200,255,0)');
      sheen.addColorStop(0.5, 'rgba(180,200,255,0.06)');
      sheen.addColorStop(1, 'rgba(180,200,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, horizonY, width, height - horizonY);
      // A second, quieter warm sheen from the dusk glow overhead — two
      // overlapping reflections read as "wet", one alone reads as "shiny".
      const sheen2 = ctx.createLinearGradient(0, horizonY, width, height);
      sheen2.addColorStop(0.6, 'rgba(255,210,160,0)');
      sheen2.addColorStop(0.72, 'rgba(255,210,160,0.035)');
      sheen2.addColorStop(0.84, 'rgba(255,210,160,0)');
      ctx.fillStyle = sheen2;
      ctx.fillRect(0, horizonY, width, height - horizonY);
      ctx.restore();

      // Asphalt grain — a handful of short, faint streaks scrolling with
      // the road (same distanceUnits-offset trick as the guardrail studs
      // below), deterministic per slot rather than re-randomized every
      // frame so it reads as texture, not flicker. Cheap: ~14 tiny
      // strokes, no per-pixel work.
      const grainSpacing = 90;
      const grainOffset = distanceUnits * 0.6;
      let grainSeed = Math.round(grainOffset / grainSpacing);
      for (let gy = ((grainOffset % grainSpacing) - grainSpacing); gy < height; gy += grainSpacing, grainSeed++) {
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
        ctx.moveTo(tx, horizonY);
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
        for (let y = ((offset % spacing) - spacing); y < height; y += spacing) {
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
      //
      // Each line follows the road's own converging edges (the exact
      // same taper `drawRail` uses for the guardrails) instead of a
      // plain vertical line at a fixed fraction of the canvas width —
      // a vertical line drifts outside the actual painted lane near the
      // top of the frame, since the road itself narrows there but a
      // vertical line doesn't. Width also eases down via `depthScale`
      // as each dash recedes, the same depth cue every roadside prop
      // here already uses. Segments are drawn individually rather than
      // one `setLineDash` stroke specifically so each can carry its own
      // tapered width — canvas has no per-dash line-width control.
      const roadTopL = railTopInset + 5;
      const roadTopR = width - railTopInset - 5;
      const roadBotL = railInset + 13;
      const roadBotR = width - railInset - 13;
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.55)';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineCap = 'butt';
      const DASH_CYCLE = 40;
      const DASH_ON = 18;
      const dashOffset = (distanceUnits * 0.6) % DASH_CYCLE;
      const roadSpan = Math.max(1, height - horizonY);
      for (let i = 1; i < LANES; i++) {
        const f = i / LANES;
        const xTop = roadTopL + (roadTopR - roadTopL) * f;
        const xBot = roadBotL + (roadBotR - roadBotL) * f;
        for (let y = dashOffset - DASH_CYCLE; y < height; y += DASH_CYCLE) {
          const y0 = Math.max(horizonY, y);
          const y1 = Math.min(height, y + DASH_ON);
          if (y1 <= y0) continue;
          const t0 = (y0 - horizonY) / roadSpan;
          const t1 = (y1 - horizonY) / roadSpan;
          const x0 = xTop + (xBot - xTop) * t0;
          const x1 = xTop + (xBot - xTop) * t1;
          ctx.lineWidth = 3 * depthScale(y0);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
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

      // ---- neighborhoods — the mix of roadside props shifts every leg of
      // the drive, so a long run reads as passing through different parts
      // of a city rather than one procedural strip on a loop. Six weights
      // per zone — [villa, premium villa, condo, urban block, hedge,
      // barrier] — the remainder always falls to lamps, so the deliberate
      // choice per zone is really "how much of the skyline vs. how much
      // low-rise/greenery", not lamp density (a good lit rhythm matters
      // in every zone). Computed ONCE per frame (not per building), and
      // blended smoothly into the next zone over the back stretch of the
      // current one rather than cutting hard at the boundary.
      const ZONE_LENGTH_KM = 0.7;
      const ZONE_WEIGHTS: [number, number, number, number, number, number][] = [
        [0.28, 0.06, 0.08, 0.02, 0.12, 0.06], // modern residential
        [0.18, 0.3, 0.02, 0, 0.18, 0.08], // luxury villa district
        [0.08, 0.04, 0.26, 0.14, 0.04, 0.06], // modern city district
        [0.04, 0.02, 0.12, 0.3, 0.02, 0.04], // commercial strip
        [0.02, 0, 0.2, 0.34, 0, 0.02], // high-rise skyline
      ];
      const zonePos = distanceUnits / 5000 / ZONE_LENGTH_KM;
      const zoneIdx = Math.floor(zonePos) % ZONE_WEIGHTS.length;
      const nextZoneIdx = (zoneIdx + 1) % ZONE_WEIGHTS.length;
      const zoneBlend = Math.max(0, (zonePos - Math.floor(zonePos) - 0.75) / 0.25);
      const zoneW = ZONE_WEIGHTS[zoneIdx];
      const nextZoneW = ZONE_WEIGHTS[nextZoneIdx];
      // Cumulative thresholds a per-slot hash roll is compared against
      // below — villaCut, then +premium, +condo, +urban, +hedge, +barrier;
      // anything past the last one is a lamp.
      let zoneAcc = 0;
      const zoneCuts = zoneW.map((v, i) => (zoneAcc += v + (nextZoneW[i] - v) * zoneBlend));

      // ---- roadside urban district: villas, condos, low-rise blocks ----
      // Four building kinds, each a width/height/floor-count range rather
      // than a fixed size — every instance still comes out different.
      // Heights are free to be tall (nothing above the roadside limits
      // that), but *widths* are kept inside the same narrow verge margin
      // vegetation used to fight — see the inner-edge anchoring below,
      // which is the part that actually keeps buildings off the asphalt.
      type BuildingKind = 'villa' | 'villaPremium' | 'condo' | 'urban';
      interface BuildingSpec {
        width: [number, number];
        height: [number, number];
        floors: [number, number];
        windowsPerFloor: number;
        glassFront: boolean;
        shopfront: boolean;
        balconies: boolean;
      }
      const BUILDING_SPECS: Record<BuildingKind, BuildingSpec> = {
        villa: { width: [16, 20], height: [16, 24], floors: [1, 2], windowsPerFloor: 2, glassFront: false, shopfront: false, balconies: false },
        villaPremium: { width: [19, 24], height: [22, 32], floors: [2, 3], windowsPerFloor: 2, glassFront: true, shopfront: false, balconies: true },
        condo: { width: [15, 19], height: [42, 64], floors: [4, 6], windowsPerFloor: 2, glassFront: false, shopfront: false, balconies: true },
        urban: { width: [17, 21], height: [66, 96], floors: [6, 8], windowsPerFloor: 3, glassFront: false, shopfront: true, balconies: false },
      };
      // Muted, varied night facade tones — none of them saturated, so the
      // warm lit windows are always what actually reads as bright.
      const FACADE_TONES = ['#3a3f4a', '#333e49', '#413a3c', '#2f3a40', '#3b3535', '#39424c'];
      const SIGN_COLORS = ['rgba(0,212,71,0.85)', 'rgba(255,180,90,0.85)', 'rgba(120,180,255,0.8)'];
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

      // `innerEdge` is this building's road-facing edge — the ONE number
      // that actually has to be right for "buildings never enter the
      // lanes". The building is built outward from it (away from the
      // road), so no matter how wide a given instance rolls, its footprint
      // can only ever grow further from the asphalt, never closer to it.
      const drawBuilding = (kind: BuildingKind, innerEdge: number, side: -1 | 1, groundY: number, ds: number, slot: number) => {
        const spec = BUILDING_SPECS[kind];
        const w = lerp(spec.width[0], spec.width[1], hash1(slot * 3.3 + 1)) * ds;
        const h = lerp(spec.height[0], spec.height[1], hash1(slot * 4.4 + 2)) * ds;
        const floors = Math.max(1, Math.round(lerp(spec.floors[0], spec.floors[1], hash1(slot * 5.5 + 3))));
        const tx = innerEdge - (side === -1 ? w / 2 : -w / 2);
        const top = groundY - h;
        const tone = FACADE_TONES[Math.floor(hash1(slot * 7.7 + 5) * FACADE_TONES.length)];

        // Ground shadow — deliberately narrower than the footprint itself
        // (0.46 vs the building's own 0.5 half-width) and centered on the
        // building, not biased toward the road, so it always stays fully
        // inside the building's own footprint and can never bleed onto
        // the asphalt beside it.
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(tx, groundY + 1.5 * ds, w * 0.46, 2.2 * ds, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Facade — a subtle vertical gradient (a touch darker toward the
        // roofline) instead of a flat fill, plus a crisp dark outline so
        // each building reads as a distinct volume against its neighbors.
        const facadeGrad = ctx.createLinearGradient(0, top, 0, groundY);
        facadeGrad.addColorStop(0, shade(tone, -8));
        facadeGrad.addColorStop(1, shade(tone, 10));
        ctx.fillStyle = facadeGrad;
        ctx.beginPath();
        roundRect(ctx, tx - w / 2, top, w, h, 1.4 * ds);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        roundRect(ctx, tx - w / 2, top, w, h, 1.4 * ds);
        ctx.stroke();

        // Windows — most lit warm, some dark (occupied vs not), a small
        // fraction tinted CX green; premium villas get one big glazed
        // front instead of small panes, urban blocks get a bright
        // shopfront + a small discreet sign on the ground floor.
        const floorH = h / floors;
        const cols = spec.windowsPerFloor;
        const winW = (w / cols) * 0.5;
        const winH = floorH * 0.42;
        for (let f = 0; f < floors; f++) {
          const floorTop = top + h - (f + 1) * floorH;
          if (spec.glassFront && f < 2) {
            const lit = hash1(slot * 11 + f * 3.1) > 0.15;
            ctx.fillStyle = lit ? 'rgba(255,214,150,0.55)' : 'rgba(20,26,22,0.7)';
            roundRect(ctx, tx - w * 0.42, floorTop + floorH * 0.1, w * 0.84, floorH * 0.8, 1 * ds);
            ctx.fill();
            continue;
          }
          if (spec.shopfront && f === 0) {
            ctx.fillStyle = 'rgba(255,200,130,0.4)';
            roundRect(ctx, tx - w * 0.44, floorTop + floorH * 0.15, w * 0.88, floorH * 0.6, 1 * ds);
            ctx.fill();
            const signColor = SIGN_COLORS[Math.floor(hash1(slot * 9.1) * SIGN_COLORS.length)];
            ctx.save();
            ctx.shadowColor = signColor;
            ctx.shadowBlur = 2.5 * ds;
            ctx.fillStyle = signColor;
            roundRect(ctx, tx - w * 0.3, floorTop - floorH * 0.16, w * 0.6, floorH * 0.16, 0.8 * ds);
            ctx.fill();
            ctx.restore();
            continue;
          }
          for (let c = 0; c < cols; c++) {
            const wx = tx - w / 2 + (w / cols) * (c + 0.5) - winW / 2;
            const wy = floorTop + floorH * 0.29;
            const roll = hash1(slot * 13 + f * 5.3 + c * 2.1);
            if (roll < 0.3) ctx.fillStyle = 'rgba(14,18,16,0.75)';
            else if (roll > 0.92) ctx.fillStyle = 'rgba(0,212,71,0.55)';
            else ctx.fillStyle = 'rgba(255,214,150,0.6)';
            roundRect(ctx, wx, wy, winW, winH, 0.6 * ds);
            ctx.fill();
          }
          if (spec.balconies && f > 0 && f % 2 === 0) {
            ctx.fillStyle = 'rgba(210,214,218,0.35)';
            ctx.fillRect(tx - w / 2 - 1 * ds, floorTop + floorH, w + 2 * ds, 1.1 * ds);
          }
        }

        // Roof — a thin bright parapet edge, plus a small rooftop utility
        // block on the taller kinds for a less boxy silhouette.
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(tx - w / 2, top - 1 * ds, w, 1.4 * ds);
        if (kind === 'condo' || kind === 'urban') {
          const boxW = w * 0.28;
          const boxH = floorH * 0.4;
          ctx.fillStyle = shade(tone, -18);
          ctx.fillRect(tx - boxW / 2, top - boxH, boxW, boxH);
        }

        // A soft warm ground-level glow for the low-rise kinds — reads as
        // a lit entrance/garden without needing separate path geometry.
        // Same "stay inside the footprint" rule as the shadow above.
        if (kind === 'villa' || kind === 'villaPremium') {
          const glow = ctx.createRadialGradient(tx, groundY, 0, tx, groundY, w * 0.55);
          glow.addColorStop(0, 'rgba(255,214,150,0.16)');
          glow.addColorStop(1, 'rgba(255,214,150,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.ellipse(tx, groundY, w * 0.55, 2.6 * ds, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Atmospheric haze — a soft dark-blue wash over the whole facade,
        // strength tied to the same `ds` depth cue everything here already
        // scales by. A building at the top of the frame (small `ds`, far
        // away) reads noticeably hazier and less distinct than one at the
        // bottom — real atmospheric perspective, the actual cue that sells
        // "distance" rather than just "this happens to be a smaller copy
        // of the same building". One extra fill, reusing the same rounded
        // rect already built above.
        const haze = Math.max(0, Math.min(1, (1.12 - ds) / 0.5));
        if (haze > 0.04) {
          ctx.save();
          ctx.globalAlpha = haze * 0.5;
          ctx.fillStyle = '#151b26';
          ctx.beginPath();
          roundRect(ctx, tx - w / 2, top, w, h, 1.4 * ds);
          ctx.fill();
          ctx.restore();
        }
      };

      // A trimmed hedge/fence line — cheap (one shadow + one rounded
      // fill), built outward from the same inner-edge anchor as the
      // buildings so it never reaches the road either.
      const drawHedge = (innerEdge: number, side: -1 | 1, groundY: number, ds: number, slot: number) => {
        const w = (16 + hash1(slot * 2.9) * 8) * ds;
        const hh = (4 + hash1(slot * 2.2) * 2.5) * ds;
        const tx = innerEdge - (side === -1 ? w / 2 : -w / 2);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(tx, groundY + ds, w * 0.42, 1.5 * ds, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const grad = ctx.createLinearGradient(0, groundY - hh, 0, groundY);
        grad.addColorStop(0, '#4a7a58');
        grad.addColorStop(1, '#213c29');
        ctx.fillStyle = grad;
        ctx.beginPath();
        roundRect(ctx, tx - w / 2, groundY - hh, w, hh, hh * 0.4);
        ctx.fill();
      };

      for (let y = ((poleOffset % poleSpacing) - poleSpacing); y < height; y += poleSpacing, poleIndex++) {
        // Roadside objects grow as they near the bottom of the frame,
        // same depth-scale idea as the entities — the clearest "they're
        // approaching" cue this fixed-position scroll trick can offer.
        const ds = depthScale(Math.max(0, y));
        // Same taper the asphalt/guardrails themselves use — the actual
        // road-facing edge at this row, so "outward from here" always
        // means "outward from where the pavement really is right now",
        // not a fixed x that's only correct at one distance.
        const t = Math.max(0, Math.min(1, y / height));
        const roadEdgeSpan = railInset + 13 - railTopInset;
        const roadEdgeL = railTopInset + roadEdgeSpan * t - 3;
        const roadEdgeR = width - railTopInset - roadEdgeSpan * t + 3;
        for (const side of [-1, 1] as const) {
          const slot = poleIndex * 2 + (side === -1 ? 0 : 1);
          const x = side === -1 ? railInset - 5 : width - railInset + 5;
          const innerEdge = side === -1 ? roadEdgeL : roadEdgeR;

          // What this slot becomes is a weighted hash roll, not a
          // mechanical alternation — a strict every-other-pole pattern
          // reads as an obvious repeat the moment you notice it, where a
          // hash-driven roll (deterministic per slot, so still stable
          // frame to frame) never lines up into a visible rhythm.
          const roll = hash1(slot * 13.7 + 0.9);
          if (roll < zoneCuts[0]) {
            drawBuilding('villa', innerEdge, side, y, ds, slot);
            continue;
          }
          if (roll < zoneCuts[1]) {
            drawBuilding('villaPremium', innerEdge, side, y, ds, slot);
            continue;
          }
          if (roll < zoneCuts[2]) {
            drawBuilding('condo', innerEdge, side, y, ds, slot);
            continue;
          }
          if (roll < zoneCuts[3]) {
            drawBuilding('urban', innerEdge, side, y, ds, slot);
            continue;
          }
          if (roll < zoneCuts[4]) {
            drawHedge(innerEdge, side, y, ds, slot);
            continue;
          }

          // A small fraction of the remaining slots become a barrier
          // segment instead — "road barriers where appropriate" without
          // crowding out the lamps that do the actual lighting work. The
          // real Blender guardrail (CX_DRIVE_ASSETS/Barriers/guardrail.glb)
          // rendered to a sprite, replacing the old striped-panel shape.
          const isBarrier = roll < zoneCuts[5];
          if (isBarrier) {
            if (barrierImg.complete && barrierImg.naturalWidth > 0) {
              const bw = 30 * ds;
              const bh = (bw * barrierImg.naturalHeight) / barrierImg.naturalWidth;
              ctx.drawImage(barrierImg, x - bw / 2, y - bh / 2, bw, bh);
            }
            continue;
          }

          // Real Blender street lamp (CX_DRIVE_ASSETS/Lighting/street_lamp.glb)
          // in place of the old drawn shaft/arm/head — mirrored per side so
          // the arm always curls toward the road rather than away from it.
          if (lampImg.complete && lampImg.naturalWidth > 0) {
            const lh = 58 * ds;
            const lw = (lh * lampImg.naturalWidth) / lampImg.naturalHeight;
            const baseY = y + 24 * ds;
            ctx.save();
            ctx.translate(x, 0);
            if (side === 1) ctx.scale(-1, 1);
            ctx.drawImage(lampImg, -lw * 0.28, baseY - lh, lw, lh);
            ctx.restore();
          }
          // The glow is still a pure light effect layered over the
          // sprite's own baked-in lamp head, positioned to roughly match
          // where that head sits in the rendered image.
          const headX = x + side * 8 * ds;
          const headY = y - 22 * ds;
          const lampGlow = ctx.createRadialGradient(headX, headY, 0, headX, headY, 10 * ds);
          lampGlow.addColorStop(0, 'rgba(255,238,190,0.65)');
          lampGlow.addColorStop(1, 'rgba(255,238,190,0)');
          ctx.fillStyle = lampGlow;
          ctx.beginPath();
          ctx.arc(headX, headY, 10 * ds, 0, Math.PI * 2);
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
            // Real Blender CX road sign (CX_DRIVE_ASSETS/Signs/road_sign.glb)
            // for the post + green board shape; the "CX" mark stays a crisp
            // drawn text layer on top, same reasoning as the car's grille
            // badge — legible brand text beats baking it into a tiny sprite.
            if (signImg.complete && signImg.naturalWidth > 0) {
              const sh = 26 * ds;
              const sw = (sh * signImg.naturalWidth) / signImg.naturalHeight;
              ctx.drawImage(signImg, x - sw / 2, signY - sh * 0.62, sw, sh);
            }
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

          // Contact shadow — a tight dark core plus a softer outer
          // falloff (same two-stop treatment the player car's own shadow
          // uses) so traffic reads as resting its weight on the asphalt
          // rather than a flat cutout hovering over a generic blob.
          ctx.save();
          const shGrad = ctx.createRadialGradient(x, e.y + ch * 0.42, 1, x, e.y + ch * 0.42, cw * 0.7);
          shGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
          shGrad.addColorStop(0.4, 'rgba(0,0,0,0.34)');
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
          // A bright glow on the light bar — the small extra touch that
          // makes it read as an actual lit lamp against the dark asphalt
          // rather than a flat red rectangle. Same technique the player
          // car's own lights already use.
          ctx.save();
          ctx.shadowColor = 'rgba(255,80,70,0.75)';
          ctx.shadowBlur = 4.5 * ds;
          ctx.fillStyle = 'rgba(255,90,80,0.92)';
          ctx.fillRect(x - cw * 0.4, e.y - ch / 2 + 3 * ds, cw * 0.16, 3.2 * ds);
          ctx.fillRect(x + cw * 0.24, e.y - ch / 2 + 3 * ds, cw * 0.16, 3.2 * ds);
          ctx.restore();
          // A faint red reflection trailing onto the asphalt directly
          // behind the lights — kept tiny and tight to the car's own
          // footprint (never a standalone shape on open road) so it
          // reads as "this car's own light on the ground", not another
          // stray mark on the driving surface.
          ctx.save();
          ctx.globalAlpha = 0.22;
          const tailReflGrad = ctx.createLinearGradient(x, e.y - ch * 0.44, x, e.y - ch * 0.18);
          tailReflGrad.addColorStop(0, 'rgba(255,90,80,0.6)');
          tailReflGrad.addColorStop(1, 'rgba(255,90,80,0)');
          ctx.fillStyle = tailReflGrad;
          ctx.fillRect(x - cw * 0.32, e.y - ch * 0.44, cw * 0.64, ch * 0.26);
          ctx.restore();

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

      // Contact shadow — a tight, dark core right under the belly plus a
      // softer outer falloff, rather than one flat-peaked gradient, so
      // the car reads as actually resting its weight on the asphalt
      // instead of hovering a couple of pixels above a generic blob.
      ctx.save();
      const shadowGrad = ctx.createRadialGradient(0, CAR_H * 0.4, 2, 0, CAR_H * 0.4, CAR_W * 0.8);
      shadowGrad.addColorStop(0, `rgba(0,0,0,${(0.6 + susSquat * 0.12).toFixed(3)})`);
      shadowGrad.addColorStop(0.35, `rgba(0,0,0,${(0.42 + susSquat * 0.08).toFixed(3)})`);
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(0, CAR_H * 0.4, CAR_W * 0.64 * (1 - susSquat * 0.12), CAR_H * 0.21, 0, 0, Math.PI * 2);
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

      // Headlight beams — two short, soft cones sweeping just ahead of the
      // car, additively blended so they brighten the asphalt and lane-
      // dashes they cross rather than painting flat color over them. Kept
      // deliberately modest (under 2 car-lengths, low peak opacity) —
      // this scene's own forward motion (world scrolling toward the
      // player) is what actually sells "driving forward"; the beam is
      // only ever a small supporting detail on top of that, never a
      // dominant shape competing with the road's own perspective.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const beamLen = CAR_H * 1.9;
      const beamNearHalf = CAR_W * 0.13;
      const beamFarHalf = CAR_W * 0.36;
      const beamNearY = -CAR_H * 0.47;
      const beamFarY = beamNearY - beamLen;
      for (const side of [-1, 1] as const) {
        const hx = side * CAR_W * 0.27;
        const beamGrad = ctx.createLinearGradient(hx, beamNearY, hx, beamFarY);
        beamGrad.addColorStop(0, 'rgba(255,246,214,0.16)');
        beamGrad.addColorStop(0.5, 'rgba(255,240,200,0.08)');
        beamGrad.addColorStop(1, 'rgba(255,235,185,0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(hx - beamNearHalf, beamNearY);
        ctx.lineTo(hx + beamNearHalf, beamNearY);
        ctx.lineTo(hx + beamFarHalf * 0.6, beamFarY);
        ctx.lineTo(hx - beamFarHalf * 0.6, beamFarY);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // The player's car — one of five hand-drawn vector silhouettes (see
      // `drawPlayerBody`/`CAR_DESIGNS` above), matching the same drawn-
      // primitive technique as every traffic car, roadway and prop in
      // this scene rather than a flat pre-rendered still. Front wheels
      // visibly turn into the lane change (`wheelSteer`, derived from the
      // same `carTilt` the body lean already uses) — a small tactile
      // detail a static sprite could never carry.
      const wheelSteer = Math.max(-0.5, Math.min(0.5, carTilt * 2.4));
      ctx.save();
      ctx.shadowColor = boostedNow ? 'rgba(0,212,71,0.6)' : 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = boostedNow ? 30 : 18;
      ctx.shadowOffsetY = boostedNow ? 0 : 9;
      drawPlayerBody(ctx, carDesign, bodyColor, CAR_W, CAR_H, wheelSteer);
      ctx.restore();

      // Crash/shield feedback — dynamically traced from the CURRENT car's
      // own silhouette (`CAR_DESIGNS[carDesign]`, the exact same profile
      // `drawPlayerBody` itself just used two lines up), not a hard-coded
      // shape. Change the Garage selection and this follows with zero
      // special-casing here — the same `traceBodyPath` helper that builds
      // the paint fill and hairline outline is reused as-is. A
      // 'source-atop' tint colors the body's own already-drawn pixels
      // (paint, glass, accents keep showing through, never a flat
      // rectangle laid over the car), and a glowing outline stroked
      // along that same path is what actually sells "the car itself is
      // lit up" rather than just tinted.
      if (carState !== 'normal') {
        const profile = CAR_DESIGNS[carDesign];
        if (carState === 'crash') {
          // A sharp flicker through the impact hang — a couple of fast
          // flashes, not a steady glow, reading as "critical damage"
          // rather than a calm state change.
          const flicker = 0.55 + 0.35 * Math.abs(Math.sin(crashElapsed * 26));
          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';
          ctx.globalAlpha = flicker;
          ctx.fillStyle = '#e0402f';
          ctx.fillRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);
          ctx.restore();

          ctx.save();
          traceBodyPath(ctx, profile, CAR_W, CAR_H);
          ctx.shadowColor = 'rgba(224,64,47,0.95)';
          ctx.shadowBlur = 16 + flicker * 10;
          ctx.strokeStyle = `rgba(255,90,70,${flicker.toFixed(3)})`;
          ctx.lineWidth = 2.2;
          ctx.stroke();
          ctx.restore();
        } else {
          // Shield — a calm, continuous pulse (a deliberately different
          // pace from the crash flicker above) plus an outer halo a
          // touch larger than the body itself: the closest read this
          // silhouette-tracing technique has to "an energy field around
          // the car" without falling back to a generic circle that has
          // nothing to do with the car's actual shape.
          const pulse = 0.5 + 0.5 * Math.sin(elapsed * 5);
          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';
          ctx.globalAlpha = 0.22 + pulse * 0.12;
          ctx.fillStyle = '#00d447';
          ctx.fillRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);
          ctx.restore();

          ctx.save();
          traceBodyPath(ctx, profile, CAR_W, CAR_H);
          ctx.shadowColor = 'rgba(0,212,71,0.9)';
          ctx.shadowBlur = 10 + pulse * 8;
          ctx.strokeStyle = `rgba(125,255,176,${(0.7 + pulse * 0.3).toFixed(3)})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.scale(1.09, 1.06);
          traceBodyPath(ctx, profile, CAR_W, CAR_H);
          ctx.shadowColor = 'rgba(0,212,71,0.7)';
          ctx.shadowBlur = 14;
          ctx.strokeStyle = `rgba(0,212,71,${(0.25 + pulse * 0.2).toFixed(3)})`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.restore();
        }
      }

      // The real CX badge on the grille reads as a small dot at this
      // sprite's resolution — the logo image is still worth compositing
      // on top at game scale so it's crisp and unmistakably the real mark.
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        const grilleY = CAR_H * 0.04;
        const lh = CAR_H * 0.12;
        const lw = lh * (logoImg.naturalWidth / logoImg.naturalHeight);
        ctx.save();
        ctx.shadowColor = 'rgba(0,212,71,0.65)';
        ctx.shadowBlur = 5;
        ctx.drawImage(logoImg, -lw / 2, grilleY, lw, lh);
        ctx.restore();
      }

      // Taillights — a slim always-on bar at the rear (the wide end,
      // closest to camera in this chase view), dim in normal driving,
      // full brake-red on impact via the glow pass below.
      ctx.fillStyle = carState === 'crash' ? '#ff5540' : 'rgba(224,64,47,0.55)';
      roundRect(ctx, -CAR_W * 0.34, CAR_H * 0.5 - 5, CAR_W * 0.2, 3.4, 1.5);
      ctx.fill();
      roundRect(ctx, CAR_W * 0.14, CAR_H * 0.5 - 5, CAR_W * 0.2, 3.4, 1.5);
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
      // Covers unmounting mid-run (e.g. closing the modal while playing)
      // — every other path already stops the drone via the `simulating`
      // check above, but that check only runs inside `loop`, which this
      // teardown also just cancelled.
      if (engineOn) stopEngineRef.current();
    };
  }, [bestScore, bodyColor, carId, topSpeedMul, accelMul, handlingMul, topSpeedKmh]);

  return (
    <div className="relative h-full w-full touch-none select-none overscroll-none">
      <canvas ref={canvasRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-4 top-[max(1rem,env(safe-area-inset-top))] flex gap-2">
        <div ref={scoreChipRef} className="drive-hud-chip rounded-2xl px-3.5 py-2 backdrop-blur-xl">
          <p className="text-nano font-bold uppercase tracking-[0.16em] text-accent-bright/75">Score</p>
          <p ref={scoreElRef} className="font-display text-2xl font-bold leading-none tabular-nums text-white">
            0
          </p>
          {bestScore > 0 && (
            <p ref={bestElRef} className="mt-1 text-nano font-semibold uppercase tracking-wide text-accent-bright/70">
              Best {bestScore.toLocaleString()}
            </p>
          )}
        </div>
        <div ref={comboChipRef} className="drive-hud-chip rounded-2xl px-3.5 py-2 backdrop-blur-xl">
          <p className="text-nano font-bold uppercase tracking-[0.16em] text-accent-bright/75">Combo</p>
          <p ref={comboElRef} className="font-display text-2xl font-bold leading-none tabular-nums text-accent-bright">
            &times;1
          </p>
          <p ref={comboTierElRef} className="mt-1 text-nano font-semibold uppercase tracking-wide text-white/40">
            Normal
          </p>
        </div>
      </div>

      <div
        ref={milestoneElRef}
        className="drive-milestone pointer-events-none absolute inset-x-0 top-[max(4.75rem,calc(env(safe-area-inset-top)+4rem))] mx-auto w-fit rounded-full border border-accent-bright/30 bg-black/60 px-4 py-1.5 text-caption font-bold uppercase tracking-wide text-accent-bright opacity-0 backdrop-blur-xl"
      />

      {/* Objective — persistent progress toward the current distance leg.
          Stacked under the Score/Combo chips rather than centered over
          the road: centered, it sat directly in the middle lane's path,
          right where oncoming traffic needs to be seen. Off to the side
          with the rest of the HUD, it's out of the way of every lane on
          any screen shape (phone or a wide desktop window alike), not
          just the aspect ratio it happened to be tuned against. Values
          are pushed in imperatively from the loop, same pattern as
          every other HUD number on this screen. */}
      <div
        ref={objectivePanelElRef}
        className="drive-hud-chip pointer-events-none absolute left-4 top-[max(6.25rem,calc(env(safe-area-inset-top)+5.5rem))] w-[12.5rem] rounded-2xl px-3.5 py-2 backdrop-blur-xl"
      >
        <p className="flex items-center gap-1 text-nano font-bold uppercase tracking-[0.16em] text-accent-bright/75">
          <Icon name="star" size={10} fill className="text-accent-bright" /> Objective
        </p>
        <p ref={objectiveLabelElRef} className="mt-0.5 truncate text-caption font-semibold text-white">
          Drive 100 m
        </p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            ref={objectiveFillElRef}
            className="drive-objective-fill h-full rounded-full bg-accent-bright transition-[width] duration-300 ease-out"
            style={{ width: '0%' }}
          />
        </div>
        <p
          ref={objectiveValueElRef}
          className="mt-1 text-right text-nano font-semibold uppercase tracking-wide text-white/40 tabular-nums"
        >
          0.00 / 0.10 KM
        </p>
      </div>

      <div className="pointer-events-none absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex gap-2">
        <div ref={speedChipRef} className="drive-hud-chip rounded-2xl px-3.5 py-2 text-right backdrop-blur-xl">
          <p className="text-nano font-bold uppercase tracking-[0.16em] text-accent-bright/75">Speed</p>
          <p className="font-display text-2xl font-bold leading-none tabular-nums text-white">
            <span ref={speedElRef}>0</span>
          </p>
          <p className="mt-1 text-nano font-semibold uppercase tracking-wide text-white/40">km/h</p>
        </div>
        <div className="drive-hud-chip rounded-2xl px-3.5 py-2 text-right backdrop-blur-xl">
          <p className="text-nano font-bold uppercase tracking-[0.16em] text-accent-bright/75">Distance</p>
          <p className="font-display text-2xl font-bold leading-none tabular-nums text-white">
            <span ref={distanceElRef}>0.0</span>
          </p>
          <p className="mt-1 text-nano font-semibold uppercase tracking-wide text-white/40">km</p>
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
            className="pointer-events-none absolute inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] text-center text-caption font-medium text-white/45 transition-opacity duration-700 ease-out"
          >
            <span className="hidden sm:inline">Steer with ← → or A / D</span>
            <span className="sm:hidden">Tap left or right to steer</span>
          </p>
        </>
      )}
    </div>
  );
}
