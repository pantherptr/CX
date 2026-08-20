import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Leaderboard } from './Leaderboard';
import { useGameAudio } from './useGameAudio';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../lib/store';
import {
  startGameSession,
  submitGameScore,
  claimGameReward,
  useRewardTiers,
  useGameConfig,
  bestQualifyingTier,
  stashPendingClaim,
  type GameSession,
  type Reward,
} from '../../lib/data/rewards';
import type { DriveChallengeResult } from './DriveChallengeGame';

// Code-split — this is the entire point of the launcher/game split: none
// of the actual game logic downloads until "Play the Challenge" is
// clicked. Mounted as soon as the countdown starts (not only once
// gameplay begins) so the chunk is loading in parallel with "3… 2… 1…".
const DriveChallengeGame = lazy(() => import('./DriveChallengeGame'));

type Phase = 'intro' | 'countdown' | 'playing' | 'paused' | 'ended' | 'claimed';

const BEST_KEY = 'cx-drive-best-score';
const BEST_DISTANCE_KEY = 'cx-drive-best-distance';
const BEST_COMBO_KEY = 'cx-drive-best-combo';
const BEST_SPEED_KEY = 'cx-drive-best-speed';
// Kept its original name from the single-livery Garage this replaces —
// it already IS the "selected car" persistence key, so reusing it here
// avoids a second, conflicting storage entry for the same concept.
const VEHICLE_KEY = 'cx-drive-vehicle';
const UNLOCKED_CARS_KEY = 'cx-drive-unlocked-cars';
const CRASH_FLASH_MS = 420;

const CONFETTI_COLORS = ['#00d447', '#ffffff', '#e0a52a', '#7dffb0'];

interface CarStats {
  topSpeed: number;
  acceleration: number;
  handling: number;
}

interface CarDef {
  id: string;
  name: string;
  tagline: string;
  /** Player-car paint color, passed straight through to
   *  `DriveChallengeGame`'s `bodyColor` prop. */
  bodyColor: string;
  rarity: number;
  /** 0–100 values shown on the card as progress bars. */
  stats: CarStats;
  /** Small, bounded gameplay multipliers (~0.85–1.15) actually fed into
   *  `DriveChallengeGame` — kept deliberately separate from the display
   *  `stats` above so every car can look dramatically different on the
   *  card while staying close in real feel, per "every car must remain
   *  fun and playable". CX GT is exactly 1/1/1 — the untouched baseline
   *  every existing run already used before the Garage existed. */
  mult: CarStats;
  /** The realistic speedometer ceiling this car can reach, in km/h.
   *  Never exceeds `ABSOLUTE_MAX_KMH` — enforced both here (by
   *  construction, every value below is ≤425) and defensively at the
   *  point the speedometer reads it in `DriveChallengeGame`. */
  topSpeedKmh: number;
  /** All-time best-distance (km) required to unlock. 0 = unlocked from
   *  the start. */
  unlockKm: number;
}

const DEFAULT_CAR_ID = 'gt';
/** The one number every car's `topSpeedKmh` is measured against — the
 *  speedometer must never read above this, for any car, under any
 *  circumstance (boost included). */
const ABSOLUTE_MAX_KMH = 425;

const CAR_CATALOG: CarDef[] = [
  {
    id: 'gt',
    name: 'CX GT',
    tagline: 'Balanced. Built for every driver.',
    bodyColor: '#f2f4ee',
    rarity: 3,
    stats: { topSpeed: 66, acceleration: 70, handling: 75 },
    mult: { topSpeed: 1, acceleration: 1, handling: 1 },
    topSpeedKmh: 280,
    unlockKm: 0,
  },
  {
    id: 'sport',
    name: 'CX SPORT',
    tagline: 'Sharper throttle, tighter line.',
    bodyColor: '#00d447',
    rarity: 3,
    stats: { topSpeed: 75, acceleration: 85, handling: 68 },
    mult: { topSpeed: 1.02, acceleration: 1.1, handling: 0.95 },
    topSpeedKmh: 320,
    unlockKm: 1,
  },
  {
    id: 'r',
    name: 'CX R',
    tagline: 'Aggressive aero, higher ceiling.',
    bodyColor: '#2f6fe0',
    rarity: 4,
    stats: { topSpeed: 86, acceleration: 80, handling: 70 },
    mult: { topSpeed: 1.08, acceleration: 1.05, handling: 0.97 },
    topSpeedKmh: 365,
    unlockKm: 5,
  },
  {
    id: 'hyper',
    name: 'CX HYPER',
    tagline: 'Blistering pace — not for beginners.',
    bodyColor: '#1c1f1c',
    rarity: 4,
    stats: { topSpeed: 94, acceleration: 90, handling: 55 },
    mult: { topSpeed: 1.12, acceleration: 1.12, handling: 0.88 },
    topSpeedKmh: 400,
    unlockKm: 10,
  },
  {
    id: 'x',
    name: 'CX X',
    tagline: 'The ultimate CX. No compromises.',
    bodyColor: '#c9d8f5',
    rarity: 5,
    stats: { topSpeed: 100, acceleration: 95, handling: 85 },
    mult: { topSpeed: 1.14, acceleration: 1.14, handling: 1.05 },
    topSpeedKmh: ABSOLUTE_MAX_KMH,
    unlockKm: 20,
  },
];

/** Lightens (positive) or darkens (negative) a `#rrggbb` color — the
 *  Garage showroom's own copy of the game canvas's identical helper,
 *  since this file has no reason to import from the canvas module for
 *  one small pure function. */
function shadeHex(hex: string, percent: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const r = clamp(((n >> 16) & 0xff) + Math.round(2.55 * percent));
  const g = clamp(((n >> 8) & 0xff) + Math.round(2.55 * percent));
  const b = clamp((n & 0xff) + Math.round(2.55 * percent));
  return `rgb(${r},${g},${b})`;
}

/** One-shot confetti burst — mounted only while `active`, so it never
 *  costs anything on the screens that don't call for it. Purely
 *  decorative: no state, no timers, each piece just plays its CSS fall
 *  animation once and settles at opacity 0. `intense` (Top 1%) gets
 *  meaningfully more pieces than a plain personal-best burst, so the
 *  rarer moment visibly reads as the bigger one. */
function ConfettiBurst({ active, intense = false }: { active: boolean; intense?: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0 overflow-visible">
      {Array.from({ length: intense ? 42 : 26 }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = 1.6 + Math.random() * 0.9;
        const drift = (Math.random() - 0.5) * 140;
        const spin = 180 + Math.random() * 360;
        const size = 5 + Math.random() * 5;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        return (
          <span
            key={i}
            className="drive-confetti-piece absolute top-0 rounded-[2px]"
            style={{
              left: `${left}%`,
              width: size,
              height: size * 0.42,
              background: color,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              // @ts-expect-error -- custom properties consumed by the keyframe
              '--drift': `${drift}px`,
              '--spin': `${spin}deg`,
            }}
          />
        );
      })}
    </div>
  );
}

const STAT_LABELS: { key: keyof CarStats; label: string }[] = [
  { key: 'topSpeed', label: 'Top Speed' },
  { key: 'acceleration', label: 'Acceleration' },
  { key: 'handling', label: 'Handling' },
];

/** The Garage — a premium showroom-style car configurator reachable
 *  from the intro screen. Tapping a card only *previews* it (updates
 *  the showroom stage and stats below); nothing is persisted or fed
 *  into gameplay until "Select Car" is pressed, which is also the only
 *  path that calls `onSelect` — so a player browsing locked/unfamiliar
 *  cars can never accidentally commit to one mid-look. */
function CarGaragePanel({
  selectedId,
  unlockedCars,
  bestDistance,
  onSelect,
}: {
  selectedId: string;
  unlockedCars: string[];
  bestDistance: number;
  onSelect: (id: string) => void;
}) {
  const [previewId, setPreviewId] = useState(selectedId);
  useEffect(() => setPreviewId(selectedId), [selectedId]);

  const preview = CAR_CATALOG.find((c) => c.id === previewId) ?? CAR_CATALOG[0];
  const previewUnlocked = unlockedCars.includes(preview.id);
  const isCurrent = preview.id === selectedId;

  return (
    <div className="animate-fade-up w-full max-w-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-bright">CX Garage</p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-white">Choose your car</h2>

      {/* Showroom stage — ambient glow, drifting particles, a gentle
          turntable idle animation and a soft floor shadow under the
          preview, all CSS-only. */}
      <div className="drive-showroom relative mx-auto mt-5 h-40 w-full overflow-hidden rounded-2xl border border-white/10">
        <span className="drive-showroom-particle" style={{ left: '28%', animationDelay: '0s' }} />
        <span className="drive-showroom-particle" style={{ left: '52%', animationDelay: '1.1s' }} />
        <span className="drive-showroom-particle" style={{ left: '72%', animationDelay: '2.2s' }} />
        <div key={preview.id} className="drive-car-enter absolute inset-0 grid place-items-center">
          <div className="relative">
            <span className="drive-showroom-floor absolute -bottom-4 left-1/2 h-5 w-36 -translate-x-1/2" />
            <div
              className="drive-car-idle relative h-16 w-28 rounded-[1.1rem]"
              style={{
                background: `linear-gradient(135deg, ${shadeHex(preview.bodyColor, 20)}, ${preview.bodyColor} 45%, ${shadeHex(preview.bodyColor, -18)})`,
                boxShadow: '0 0 0 1px rgba(255,255,255,0.16), 0 18px 30px rgba(0,0,0,0.55)',
              }}
            >
              <span className="absolute inset-x-3 top-2 h-3 rounded-full bg-black/40" />
              <span className="absolute inset-x-4 bottom-2 h-1 rounded-full bg-accent-bright/70" />
            </div>
          </div>
        </div>
        {!previewUnlocked && (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wide text-white/70 backdrop-blur">
            <Icon name="lock" size={10} /> Locked
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Icon key={i} name="star" size={13} fill={i < preview.rarity} className={i < preview.rarity ? 'text-star' : 'text-white/15'} />
        ))}
      </div>
      <p className="mt-2 text-center font-display text-lg font-semibold text-white">{preview.name}</p>
      <p className="text-center text-[12px] text-white/45">{preview.tagline}</p>

      <div className="mt-4 space-y-2.5">
        {STAT_LABELS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-white/45">
              <span>{label}</span>
              <span className="tabular-nums text-white/70">{preview.stats[key]}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="drive-stat-fill h-full rounded-full bg-accent-bright"
                style={{ width: `${preview.stats[key]}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-5">
        {isCurrent ? (
          <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-[0.85rem] border border-accent-bright/30 bg-accent-bright/10 py-3 text-[13px] font-bold uppercase tracking-wide text-accent-bright">
            <Icon name="check" size={14} /> Selected
          </span>
        ) : previewUnlocked ? (
          <button onClick={() => onSelect(preview.id)} className="btn btn-accent-bright btn-block">
            Select Car
          </button>
        ) : (
          <div className="rounded-[0.85rem] border border-white/10 bg-white/[0.03] py-3 text-center">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-white/50">
              Unlock at {preview.unlockKm} km best distance
            </p>
            <p className="mt-0.5 text-[11px] text-white/35">
              {bestDistance.toFixed(1)} / {preview.unlockKm} km
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {CAR_CATALOG.map((c) => {
          const unlocked = unlockedCars.includes(c.id);
          const active = c.id === selectedId;
          const previewed = c.id === previewId;
          return (
            <button
              key={c.id}
              onClick={() => setPreviewId(c.id)}
              className={`drive-car-card relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border px-3 py-3 text-center transition-all ${
                previewed
                  ? 'drive-car-card-active border-accent-bright/60 bg-accent-bright/10'
                  : 'border-white/10 bg-white/[0.04] hover:border-white/25'
              } ${!unlocked ? 'opacity-80' : ''}`}
            >
              <span className="h-8 w-14 rounded-lg" style={{ background: c.bodyColor }} />
              <span className="text-[11.5px] font-semibold text-white/85">{c.name}</span>
              {active && unlocked && (
                <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-accent-bright text-noir">
                  <Icon name="check" size={11} />
                </span>
              )}
              {!unlocked && (
                <span className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5 bg-black/70 py-1">
                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-white/60">
                    <Icon name="lock" size={9} /> Locked
                  </span>
                  <span className="text-[9px] font-semibold text-accent-bright/80">Unlock at {c.unlockKm} km</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-[11.5px] text-white/35">
        Best distance {bestDistance.toFixed(1)} km — new cars unlock as you drive further.
      </p>
    </div>
  );
}

export function DriveChallengeLauncher({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const { toast } = useApp();
  const tiers = useRewardTiers();
  const config = useGameConfig();
  const { play, muted, toggleMute, duckMusic, startGameplayMusic, pauseMusic } = useGameAudio();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('intro');
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [countdownN, setCountdownN] = useState<'ready' | 3 | 2 | 1 | 0 | null>(null);
  const [showCrash, setShowCrash] = useState(false);
  const [result, setResult] = useState<DriveChallengeResult | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  // Captured at the instant a run ends, before `bestScore` itself may get
  // overwritten below — the results screen needs "what you had to beat",
  // which `bestScore` alone can't answer once a new record replaces it.
  const [priorBest, setPriorBest] = useState(0);
  // The intro screen's secondary content — leaderboard or garage — is a
  // toggle, same pattern either way; generalized to a three-way view
  // instead of a second boolean so the two panels can't both be true.
  const [introView, setIntroView] = useState<'menu' | 'leaderboard' | 'garage'>('menu');
  const [bestScore, setBestScore] = useState(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  // All-time personal bests beyond score — distance/combo/speed — kept
  // separately since a given run's own peak isn't necessarily its
  // lifetime peak (e.g. a short but very fast run vs. a long steady one).
  const [bestDistance, setBestDistance] = useState(() => {
    try {
      return Number(localStorage.getItem(BEST_DISTANCE_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [bestCombo, setBestCombo] = useState(() => {
    try {
      return Number(localStorage.getItem(BEST_COMBO_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [bestSpeed, setBestSpeed] = useState(() => {
    try {
      // Clamped on read, not just on write — a value saved before the
      // realistic-speedometer cap existed could be well above 425, and
      // "never display a speed above 425" has to hold for old data too,
      // not just runs completed after this cap shipped.
      return Math.min(ABSOLUTE_MAX_KMH, Number(localStorage.getItem(BEST_SPEED_KEY)) || 0);
    } catch {
      return 0;
    }
  });
  const [carId, setCarId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(VEHICLE_KEY);
      // Validated against the catalog rather than trusted outright — an
      // older build of this Garage stored paint-variant ids (`green`,
      // `white`, …) under this same key, and a stale value like that
      // would otherwise match no car and silently break "selected"
      // detection everywhere this id is compared against the catalog.
      return saved && CAR_CATALOG.some((c) => c.id === saved) ? saved : DEFAULT_CAR_ID;
    } catch {
      return DEFAULT_CAR_ID;
    }
  });
  const [unlockedCars, setUnlockedCars] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(UNLOCKED_CARS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? Array.from(new Set([DEFAULT_CAR_ID, ...parsed])) : [DEFAULT_CAR_ID];
    } catch {
      return [DEFAULT_CAR_ID];
    }
  });

  // Distance-gated unlocks — re-derived from `bestDistance` (itself
  // localStorage-backed) rather than only checked once at run-end, so a
  // returning player who already had a qualifying best before this
  // system existed gets everything they've earned retroactively.
  // Unlocks only ever add cars, never remove them.
  useEffect(() => {
    const newlyQualified = CAR_CATALOG.filter((c) => c.unlockKm > 0 && bestDistance >= c.unlockKm).map((c) => c.id);
    if (newlyQualified.length === 0) return;
    setUnlockedCars((prev) => {
      const next = Array.from(new Set([...prev, ...newlyQualified]));
      if (next.length === prev.length) return prev;
      try {
        localStorage.setItem(UNLOCKED_CARS_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable — unlocks just won't persist this session.
      }
      return next;
    });
  }, [bestDistance]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // READY → 3 → 2 → 1 → GO, then straight into gameplay. `DriveChallengeGame`
  // is already mounted underneath this (with `active={false}`), so the road
  // sits idle behind the numbers rather than a blank screen.
  useEffect(() => {
    if (phase !== 'countdown' || countdownN === null) return;
    play(countdownN === 0 ? 'go' : 'tick');
    // The exact GO moment — CX music stops, rewinds to 0:00, and starts
    // fresh at gameplay volume. Nothing else in this countdown timeline
    // touches the track, so a lane change or pickup mid-run never resets it.
    if (countdownN === 0) startGameplayMusic();
    const delay = countdownN === 'ready' ? 480 : countdownN === 0 ? 550 : 650;
    const t = window.setTimeout(() => {
      if (countdownN === 'ready') {
        setCountdownN(3);
      } else if (countdownN === 0) {
        setPhase('playing');
        setCountdownN(null);
      } else {
        setCountdownN((countdownN - 1) as 2 | 1 | 0);
      }
    }, delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdownN]);

  const beginSession = async () => {
    setStarting(true);
    const { session: s, error } = await startGameSession();
    setStarting(false);
    if (error || !s) {
      toast({ title: "Couldn't start the challenge", desc: error ?? undefined, icon: 'info' });
      return;
    }
    setGameSession(s);
  };

  const launch = () => {
    setOpen(true);
    setPhase('intro');
    setGameSession(null);
    setCountdownN(null);
    setShowCrash(false);
    setResult(null);
    setScoreError(null);
    setClaimError(null);
    setReward(null);
    setIsNewRecord(false);
    setIntroView('menu');
    // GAME HOME (and RETRY, which re-enters here) — CX music plays at an
    // almost-inaudible level and stays there through the whole countdown.
    duckMusic();
    void beginSession();
  };

  const close = () => {
    setOpen(false);
    pauseMusic();
  };

  const selectCar = (id: string) => {
    if (!unlockedCars.includes(id)) return;
    setCarId(id);
    try {
      localStorage.setItem(VEHICLE_KEY, id);
    } catch {
      // Storage unavailable — the pick just won't persist across visits.
    }
  };

  // Defensive fallback only — every id in `unlockedCars` always exists in
  // `CAR_CATALOG` and `carId` is only ever set via `selectCar` above, but
  // a hand-edited or stale localStorage value should still land on the
  // one car that's always unlocked rather than render nothing.
  const selectedCar =
    CAR_CATALOG.find((c) => c.id === carId && unlockedCars.includes(c.id)) ??
    CAR_CATALOG.find((c) => c.id === DEFAULT_CAR_ID)!;

  const start = () => {
    if (!gameSession) return;
    setPhase('countdown');
    setCountdownN('ready');
  };

  const togglePause = () =>
    setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p));

  const handleFinish = async (r: DriveChallengeResult) => {
    setPhase('ended');
    setResult(r);
    play('gameover');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setShowCrash(true);
    window.setTimeout(() => setShowCrash(false), reducedMotion ? 0 : CRASH_FLASH_MS);

    // Only a *beaten* prior best counts as a record — a first-ever run
    // trivially clears a bestScore of 0, which isn't worth celebrating.
    const newRecord = bestScore > 0 && r.score > bestScore;
    setIsNewRecord(newRecord);
    setPriorBest(bestScore);
    if (newRecord) {
      setBestScore(r.score);
      try {
        localStorage.setItem(BEST_KEY, String(r.score));
      } catch {
        // Storage unavailable — the personal best just won't persist.
      }
      window.setTimeout(() => play('record'), 260);
    } else if (r.score > bestScore) {
      setBestScore(r.score);
      try {
        localStorage.setItem(BEST_KEY, String(r.score));
      } catch {
        // Storage unavailable — the personal best just won't persist.
      }
    }

    // Distance/combo/speed bests persist independently of score — a run
    // can set one of these without being an overall high score.
    if (r.distance > bestDistance) {
      setBestDistance(r.distance);
      try {
        localStorage.setItem(BEST_DISTANCE_KEY, String(r.distance));
      } catch {
        // Storage unavailable — this record just won't persist.
      }
    }
    if (r.maxCombo > bestCombo) {
      setBestCombo(r.maxCombo);
      try {
        localStorage.setItem(BEST_COMBO_KEY, String(r.maxCombo));
      } catch {
        // Storage unavailable — this record just won't persist.
      }
    }
    if (r.maxSpeed > bestSpeed) {
      setBestSpeed(r.maxSpeed);
      try {
        localStorage.setItem(BEST_SPEED_KEY, String(r.maxSpeed));
      } catch {
        // Storage unavailable — this record just won't persist.
      }
    }

    if (!gameSession) return;
    const { session: s, error } = await submitGameScore(gameSession.id, r.score, r.distance, r.maxCombo);
    if (error || !s) {
      setScoreError(error ?? 'Score could not be recorded.');
    }
  };

  const qualifyingTier = result && tiers ? bestQualifyingTier(result.score, tiers) : null;
  const nextTier =
    result && tiers
      ? tiers.filter((t) => t.pointsRequired > result.score).sort((a, b) => a.pointsRequired - b.pointsRequired)[0]
      : null;
  // The lowest reward-qualifying score — reused as the leaderboard's
  // "Top 1%" cutoff, so both screens agree on what "elite" means.
  const eliteThreshold = tiers && tiers.length ? Math.min(...tiers.map((t) => t.pointsRequired)) : undefined;

  const claim = async () => {
    if (!gameSession) return;
    setClaiming(true);
    setClaimError(null);
    const { reward: rw, error } = await claimGameReward(gameSession.id);
    setClaiming(false);
    if (error || !rw) {
      setClaimError(error ?? 'Could not claim this reward.');
      return;
    }
    play('reward');
    setReward(rw);
    setPhase('claimed');
  };

  const claimAfterSignup = () => {
    if (!gameSession) return;
    stashPendingClaim(gameSession.id);
    setOpen(false);
    navigate('/signup');
  };

  const gameMounted = phase === 'countdown' || phase === 'playing' || phase === 'paused';

  return (
    <>
      <button onClick={launch} className={className}>
        {children}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-x-0 top-0 z-[100] flex h-[100dvh] flex-col overflow-hidden overscroll-none bg-noir">
          {/* Chrome bar only for the menu-like screens (intro/results/reward) —
              during actual gameplay it's replaced by a floating control
              cluster over the canvas (below) so the game itself, not just
              the modal, gets the full viewport with no letterboxing bar. */}
          {!gameMounted && (
            <div className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
              <span className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
                <img
                  src="/cx-drive-challenge-icon.png"
                  alt=""
                  className="h-7 w-7 rounded-lg object-cover"
                  style={{ objectPosition: '50% 12%' }}
                />
                CX Drive Challenge
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  className="grid h-10 w-10 place-items-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Icon name={muted ? 'volumeOff' : 'volume'} size={18} />
                </button>
                <button
                  onClick={close}
                  aria-label="Close"
                  className="grid h-10 w-10 place-items-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Icon name="x" size={20} />
                </button>
              </div>
            </div>
          )}

          {gameMounted && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-end p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  onClick={togglePause}
                  aria-label={phase === 'paused' ? 'Resume' : 'Pause'}
                  className={`grid h-10 w-10 scale-100 place-items-center rounded-full border backdrop-blur-md transition-all duration-150 hover:scale-105 active:scale-95 ${
                    phase === 'paused'
                      ? 'border-accent-bright/50 bg-accent-bright/15 text-accent-bright shadow-[0_0_14px_rgba(0,212,71,0.3)]'
                      : 'border-white/10 bg-black/40 text-white/85 hover:bg-black/60 hover:text-white'
                  }`}
                >
                  <Icon name={phase === 'paused' ? 'play' : 'pause'} size={17} />
                </button>
                <button
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  className={`grid h-10 w-10 scale-100 place-items-center rounded-full border backdrop-blur-md transition-all duration-150 hover:scale-105 active:scale-95 ${
                    muted
                      ? 'border-white/10 bg-black/40 text-white/85 hover:bg-black/60 hover:text-white'
                      : 'border-accent-bright/50 bg-accent-bright/15 text-accent-bright shadow-[0_0_14px_rgba(0,212,71,0.3)]'
                  }`}
                >
                  <Icon name={muted ? 'volumeOff' : 'volume'} size={17} />
                </button>
                <button
                  onClick={close}
                  aria-label="Close"
                  className="grid h-10 w-10 scale-100 place-items-center rounded-full border border-white/10 bg-black/40 text-white/85 backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-black/60 hover:text-white active:scale-95"
                >
                  <Icon name="x" size={18} />
                </button>
              </div>
            </div>
          )}

          <div
            className={
              gameMounted
                ? 'relative w-full flex-1 overflow-hidden'
                : 'flex flex-1 items-center justify-center overflow-y-auto px-4'
            }
            style={gameMounted ? undefined : { paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
          >
            {phase === 'intro' && (
              <div className="w-full max-w-sm text-center">
                {introView === 'leaderboard' ? (
                  <Leaderboard
                    enabled={config?.leaderboardEnabled ?? false}
                    currentUserId={authSession?.user.id}
                    eliteThreshold={eliteThreshold}
                    highlightSelf={isNewRecord || !!qualifyingTier}
                  />
                ) : introView === 'garage' ? (
                  <CarGaragePanel selectedId={selectedCar.id} unlockedCars={unlockedCars} bestDistance={bestDistance} onSelect={selectCar} />
                ) : (
                  <>
                    <div className="animate-fade-up">
                      <span className="relative mx-auto grid h-36 w-36 place-items-center">
                        <span className="drive-hero-pulse glow-accent-bright absolute inset-0 rounded-full opacity-80" />
                        <Icon
                          name="sparkles"
                          size={14}
                          className="animate-float absolute -left-1 top-3 text-accent-bright/70"
                        />
                        <Icon
                          name="sparkles"
                          size={10}
                          className="animate-float-slow absolute -right-2 top-10 text-accent-bright/50"
                        />
                        <Icon
                          name="sparkles"
                          size={11}
                          className="animate-float absolute -right-1 bottom-4 text-accent-bright/60"
                          style={{ animationDelay: '1.2s' }}
                        />
                        <img
                          src="/cx-drive-challenge-hero.png"
                          alt="CX Drive Challenge"
                          className="relative h-36 w-auto animate-scale-in object-contain drop-shadow-[0_0_28px_rgba(0,212,71,0.35)]"
                        />
                      </span>
                    </div>
                    <p
                      className="mt-3 animate-fade-up text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-bright"
                      style={{ animationDelay: '160ms' }}
                    >
                      CX Drive Challenge
                    </p>
                    <h2
                      className="mt-2 animate-fade-up font-display text-2xl font-semibold text-white"
                      style={{ animationDelay: '260ms' }}
                    >
                      Ready to drive?
                    </h2>
                    <p
                      className="mt-2 animate-fade-up text-[14px] leading-relaxed text-white/55"
                      style={{ animationDelay: '340ms' }}
                    >
                      Dodge traffic, collect green tokens, and beat the clock. Score enough and you'll unlock
                      a real discount on your next CX booking.
                    </p>
                    <ul
                      className="mt-5 animate-fade-up flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12.5px] text-white/45"
                      style={{ animationDelay: '420ms' }}
                    >
                      {(tiers ?? []).map((t) => (
                        <li key={t.pointsRequired}>
                          {t.pointsRequired.toLocaleString()}+ → {t.label}
                        </li>
                      ))}
                    </ul>
                    <div className="relative mt-7">
                      {!starting && gameSession && (
                        <span className="drive-play-pulse pointer-events-none absolute inset-0 rounded-[0.85rem] bg-accent-bright/50" />
                      )}
                      <button
                        onClick={start}
                        disabled={starting || !gameSession}
                        className="btn btn-accent-bright btn-lg btn-block relative disabled:opacity-60"
                      >
                        {starting ? 'Starting…' : 'Start Driving'} <Icon name="arrowRight" size={17} />
                      </button>
                    </div>
                    {bestScore > 0 && (
                      <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-star/30 bg-star/10 px-3 py-1.5 text-[12px] font-semibold text-star">
                        <Icon name="trophy" size={13} fill /> Personal best {bestScore.toLocaleString()}
                      </span>
                    )}
                  </>
                )}
                <div className="mt-5 flex items-center justify-center gap-4">
                  {config?.leaderboardEnabled && (
                    <button
                      onClick={() => setIntroView((v) => (v === 'leaderboard' ? 'menu' : 'leaderboard'))}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/50 transition-colors hover:text-white"
                    >
                      <Icon name="trophy" size={14} />
                      {introView === 'leaderboard' ? 'Back' : 'Leaderboard'}
                    </button>
                  )}
                  <button
                    onClick={() => setIntroView((v) => (v === 'garage' ? 'menu' : 'garage'))}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/50 transition-colors hover:text-white"
                  >
                    <Icon name="car" size={14} />
                    {introView === 'garage' ? 'Back' : 'Garage'}
                  </button>
                </div>
              </div>
            )}

            {gameMounted && (
              <div className="relative h-full w-full">
                <Suspense
                  fallback={
                    <div className="flex h-full flex-col items-center justify-center gap-3">
                      <span className="relative grid place-items-center">
                        <span className="glow-accent-bright absolute inset-0 animate-pulse rounded-full opacity-70" />
                        <img
                          src="/cx-drive-challenge-hero.png"
                          alt="CX Drive Challenge"
                          className="relative h-28 w-auto animate-pulse object-contain"
                        />
                      </span>
                      <p className="text-[12.5px] font-medium text-white/40">Loading the track…</p>
                    </div>
                  }
                >
                  <DriveChallengeGame
                    active={phase === 'playing'}
                    onFinish={handleFinish}
                    play={play}
                    bestScore={bestScore}
                    bodyColor={selectedCar.bodyColor}
                    topSpeedMul={selectedCar.mult.topSpeed}
                    accelMul={selectedCar.mult.acceleration}
                    handlingMul={selectedCar.mult.handling}
                    topSpeedKmh={selectedCar.topSpeedKmh}
                  />
                </Suspense>

                {phase === 'countdown' && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-5">
                    <span
                      className="animate-fade-in absolute inset-0"
                      style={{ background: 'radial-gradient(closest-side, transparent 38%, rgba(4,6,5,0.55) 100%)' }}
                    />
                    <img
                      src="/cx-drive-challenge-icon.png"
                      alt=""
                      className="h-14 w-auto animate-fade-up object-contain opacity-90"
                    />
                    <span key={countdownN} className="relative grid place-items-center">
                      <span className="glow-accent-bright absolute inset-0 animate-scale-in rounded-full opacity-60" />
                      <span
                        className={`relative animate-scale-in font-display font-bold uppercase text-accent-bright ${
                          countdownN === 'ready' ? 'text-4xl tracking-[0.3em]' : 'text-8xl'
                        }`}
                        style={{ textShadow: '0 0 40px rgba(0,212,71,0.55)' }}
                      >
                        {countdownN === 'ready' ? 'Ready' : countdownN === 0 ? 'GO' : countdownN}
                      </span>
                    </span>
                  </div>
                )}

                {phase === 'paused' && (
                  <div className="absolute inset-0 z-10 flex animate-fade-in flex-col items-center justify-center gap-4 bg-noir/75 backdrop-blur-sm">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-white/70">
                      <Icon name="pause" size={22} />
                    </span>
                    <p className="font-display text-2xl font-semibold text-white">Paused</p>
                    <button onClick={togglePause} className="btn btn-accent-bright btn-lg">
                      <Icon name="play" size={17} /> Resume
                    </button>
                  </div>
                )}
              </div>
            )}

            {phase === 'ended' && showCrash && (
              <div className="relative flex items-center justify-center">
                <span
                  className="drive-crash-flash pointer-events-none absolute -inset-x-24 -inset-y-24 rounded-full"
                  style={{ background: 'radial-gradient(closest-side, rgba(224,64,47,0.5), transparent 70%)' }}
                />
                <div className="animate-crash-shake text-center">
                  <p
                    className="font-display text-5xl font-bold uppercase tracking-wide text-danger"
                    style={{ textShadow: '0 0 30px rgba(224,64,47,0.65)' }}
                  >
                    Crash
                  </p>
                </div>
              </div>
            )}

            {phase === 'ended' && !showCrash && result && (() => {
              const isTopOne = !!qualifyingTier;
              return (
              <div className="drive-results-vignette relative w-full max-w-sm animate-scale-in text-center">
                <ConfettiBurst active={isNewRecord || isTopOne} intense={isTopOne} />
                <span className="relative mx-auto grid h-40 w-40 place-items-center">
                  <span
                    className={`absolute inset-0 animate-scale-in rounded-full opacity-70 ${
                      isTopOne ? 'drive-star-pulse glow-star' : 'glow-accent-bright'
                    }`}
                  />
                  <img
                    src="/gameover-game.png"
                    alt="Game over"
                    className="relative h-40 w-auto animate-fade-up object-contain drop-shadow-[0_0_24px_rgba(0,212,71,0.35)]"
                  />
                </span>

                {/* The headline itself carries the achievement — Top 1%
                    outranks a personal best, which outranks a plain
                    Game Over — rather than burying it in a small pill
                    below a generic title. */}
                {(isTopOne || isNewRecord) && (
                  <p
                    className={`animate-fade-up text-[11px] font-bold uppercase tracking-[0.24em] ${isTopOne ? 'text-star' : 'text-accent-bright'}`}
                  >
                    {isTopOne ? '★ Rare Achievement' : 'Personal Best'}
                  </p>
                )}
                <p
                  className={`mt-1 font-display text-4xl font-black uppercase tracking-wide ${isTopOne ? 'text-star' : 'text-white'}`}
                  style={{
                    textShadow: isTopOne
                      ? '0 0 34px rgba(224,165,42,0.55)'
                      : isNewRecord
                        ? '0 0 30px rgba(0,212,71,0.45)'
                        : '0 0 20px rgba(0,212,71,0.2)',
                  }}
                >
                  {isTopOne ? 'Top 1%' : isNewRecord ? 'New Best' : 'Game Over'}
                </p>
                <p className="mt-2 text-[15px] text-white/60">
                  You scored <span className="font-semibold text-white">{result.score.toLocaleString()}</span> points.
                </p>

                {/* A record set on the same run that also cleared Top 1%
                    still gets a small secondary confirmation — it just
                    doesn't compete with the headline for attention. */}
                {isTopOne && isNewRecord && (
                  <div className="mt-3 flex items-center justify-center">
                    <span className="animate-scale-in inline-flex items-center gap-1.5 rounded-full border border-accent-bright/30 bg-accent-bright/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-bright">
                      <Icon name="trending" size={12} /> New Record
                    </span>
                  </div>
                )}

                {/* Personal-best comparison — what you had to beat, not just
                    the post-run max, so a non-record run still shows the gap. */}
                <p className="mt-3 text-[13px] text-white/45">
                  {isNewRecord ? (
                    <>
                      Previous best was{' '}
                      <span className="font-semibold text-white/70">{priorBest.toLocaleString()}</span> —
                      beaten by <span className="font-semibold text-accent-bright">+{(result.score - priorBest).toLocaleString()}</span>
                    </>
                  ) : bestScore > result.score ? (
                    <>
                      <span className="font-semibold text-white/70">{(bestScore - result.score).toLocaleString()}</span> short of your best of{' '}
                      {bestScore.toLocaleString()}
                    </>
                  ) : (
                    'Your first run on the board.'
                  )}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-accent-bright/25 bg-accent-bright/[0.06] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-bright/70">Final Score</p>
                    <p className="mt-0.5 font-display text-[15px] font-semibold text-white">
                      {result.score.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Best Score</p>
                    <p className="mt-0.5 font-display text-[15px] font-semibold text-white">
                      {Math.max(bestScore, result.score).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Distance</p>
                    <p className="mt-0.5 font-display text-[15px] font-semibold text-white">
                      {result.distance.toFixed(1)} km
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Max Speed</p>
                    <p className="mt-0.5 font-display text-[15px] font-semibold text-white">
                      {Math.max(bestSpeed, result.maxSpeed).toLocaleString()} km/h
                    </p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Combo</p>
                    <p className="mt-0.5 font-display text-[15px] font-semibold text-accent-bright">
                      &times;{Math.max(bestCombo, result.maxCombo)}
                    </p>
                  </div>
                </div>

                {scoreError && (
                  <p className="mt-4 rounded-xl bg-white/5 px-3.5 py-2.5 text-[13px] text-white/50">
                    {scoreError}
                  </p>
                )}

                {!scoreError && qualifyingTier && (
                  <div className="relative mt-5 overflow-hidden rounded-2xl border border-accent-bright/25 bg-accent-bright/10 px-5 py-6">
                    <span className="glow-accent-bright pointer-events-none absolute inset-0 opacity-40" />
                    <span className="relative mx-auto grid h-12 w-12 animate-scale-in place-items-center rounded-full bg-accent-bright text-noir">
                      <Icon name="gift" size={22} />
                    </span>
                    <p
                      className="relative mt-3 animate-fade-up text-[11px] font-bold uppercase tracking-[0.2em] text-accent-bright"
                      style={{ animationDelay: '80ms' }}
                    >
                      Reward Unlocked
                    </p>
                    <p
                      className="relative mt-1.5 animate-fade-up font-display text-2xl font-semibold text-white"
                      style={{ animationDelay: '150ms' }}
                    >
                      {qualifyingTier.label}
                    </p>
                    <p
                      className="relative mt-1 animate-fade-up text-[13px] text-white/55"
                      style={{ animationDelay: '150ms' }}
                    >
                      Applies to your next CX booking
                    </p>
                    <div className="relative mt-4 animate-fade-up" style={{ animationDelay: '230ms' }}>
                      {authSession ? (
                        <button
                          onClick={claim}
                          disabled={claiming}
                          className="btn btn-accent-bright btn-block disabled:opacity-60"
                        >
                          {claiming ? 'Claiming…' : 'Claim Reward'}
                        </button>
                      ) : (
                        <>
                          <p className="text-[13px] text-white/55">Create an account to claim your reward.</p>
                          <button onClick={claimAfterSignup} className="btn btn-accent-bright btn-block mt-3">
                            Create account
                          </button>
                        </>
                      )}
                      {claimError && <p className="mt-3 text-[13px] text-danger">{claimError}</p>}
                    </div>
                  </div>
                )}

                {!scoreError && !qualifyingTier && (
                  <p className="mt-4 text-[13.5px] text-white/50">
                    {nextTier
                      ? `So close — score ${nextTier.pointsRequired.toLocaleString()}+ to unlock ${nextTier.label}.`
                      : 'Keep practicing — rewards unlock as your score climbs.'}
                  </p>
                )}

                <div className="relative mt-6">
                  <span className="drive-play-pulse pointer-events-none absolute inset-0 rounded-[0.85rem] bg-accent-bright/45" />
                  <button onClick={launch} className="btn btn-accent-bright btn-lg btn-block relative">
                    <Icon name="play" size={17} /> Play Again
                  </button>
                </div>
                <button
                  onClick={() => {
                    setPhase('intro');
                    setIntroView('garage');
                  }}
                  className="btn btn-ghost btn-block mt-2.5 text-white/55 hover:!bg-white/10 hover:text-white"
                >
                  <Icon name="car" size={15} /> Garage
                </button>
                {config?.leaderboardEnabled && (
                  <button
                    onClick={() => {
                      setPhase('intro');
                      setIntroView('leaderboard');
                    }}
                    className="btn btn-ghost btn-block mt-2.5 text-white/55 hover:!bg-white/10 hover:text-white"
                  >
                    <Icon name="trophy" size={15} /> Leaderboard
                  </button>
                )}
                <button onClick={close} className="btn btn-ghost btn-block mt-2.5 text-white/55 hover:!bg-white/10 hover:text-white">
                  Exit to CX
                </button>
              </div>
              );
            })()}

            {phase === 'claimed' && reward && (
              <div className="w-full max-w-sm animate-scale-in text-center">
                <span className="relative mx-auto grid h-40 w-40 place-items-center">
                  <span className="glow-accent-bright absolute inset-0 animate-scale-in rounded-full opacity-90" />
                  <img
                    src="/cx-drive-challenge-hero.png"
                    alt="CX Drive Challenge"
                    className="relative h-40 w-auto object-contain drop-shadow-[0_0_32px_rgba(0,212,71,0.45)]"
                  />
                  <span className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border-2 border-noir bg-accent-bright text-noir">
                    <Icon name="checkCircle" size={18} />
                  </span>
                  <Icon
                    name="sparkles"
                    size={16}
                    className="absolute -left-2 top-2 animate-fade-up text-accent-bright/70"
                    style={{ animationDelay: '120ms' }}
                  />
                  <Icon
                    name="sparkles"
                    size={12}
                    className="absolute -right-1 top-8 animate-fade-up text-accent-bright/50"
                    style={{ animationDelay: '220ms' }}
                  />
                </span>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-bright">
                  Reward Unlocked
                </p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-white">Added to your account.</h2>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-5">
                  <p className="font-display text-3xl font-semibold text-accent-bright">
                    {reward.discountPercentage}% OFF
                  </p>
                  <p className="mt-2 font-mono text-[15px] tracking-wide text-white">{reward.couponCode}</p>
                  <p className="mt-1.5 text-[12px] text-white/45">
                    Expires {new Date(reward.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <Link to="/browse" onClick={close} className="btn btn-accent-bright btn-block mt-6">
                  Book a Car <Icon name="arrowRight" size={17} />
                </Link>
                <Link
                  to="/dashboard#rewards"
                  onClick={close}
                  className="mt-3 inline-block text-[13px] font-medium text-white/50 hover:text-white"
                >
                  View my rewards
                </Link>
              </div>
            )}
          </div>
          </div>,
          document.body,
        )}
    </>
  );
}
