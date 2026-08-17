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
const VEHICLE_KEY = 'cx-drive-vehicle';
const CRASH_FLASH_MS = 420;

const CONFETTI_COLORS = ['#00d447', '#ffffff', '#e0a52a', '#7dffb0'];

interface VehicleVariant {
  id: string;
  label: string;
  /** Player-car paint color passed straight through to
   *  `DriveChallengeGame`'s `bodyColor` prop — the one real hook this
   *  garage has into actual gameplay today. */
  bodyColor: string;
  /** Locked variants render as a clearly-marked preview only — no fake
   *  unlock flow, no purchase, just "not yet available" so the garage
   *  has somewhere to grow into once more variants are ready. */
  locked?: boolean;
}

const DEFAULT_VEHICLE_ID = 'green';

const VEHICLE_VARIANTS: VehicleVariant[] = [
  { id: 'green', label: 'CX Green', bodyColor: '#bdeecb' },
  { id: 'white', label: 'CX White', bodyColor: '#f2f4ee' },
  { id: 'black', label: 'CX Black', bodyColor: '#2b2f2c', locked: true },
  { id: 'special', label: 'Special Edition', bodyColor: '#c9d8f5', locked: true },
];

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

/** The Garage — a simple, static vehicle picker reachable from the intro
 *  screen. Two liveries are genuinely selectable today (no purchase, no
 *  fake unlock flow); the other two are visibly locked as "coming soon"
 *  so the panel already has somewhere to grow into once more variants
 *  exist. The selection persists to localStorage and feeds
 *  `DriveChallengeGame`'s `bodyColor` prop directly, so picking a
 *  vehicle here has a real, visible effect in the next run. */
function GaragePanel({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const selected = VEHICLE_VARIANTS.find((v) => v.id === selectedId) ?? VEHICLE_VARIANTS[0];
  return (
    <div className="animate-fade-up">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-bright">CX Garage</p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-white">Your vehicle</h2>
      <div className="relative mx-auto mt-5 grid h-32 w-32 place-items-center">
        <span className="glow-accent-bright absolute inset-0 rounded-full opacity-70" />
        <span
          className="relative h-20 w-28 rounded-[1.4rem]"
          style={{ background: selected.bodyColor, boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.4)' }}
        />
        <Icon name="car" size={34} className="absolute text-noir/70" />
      </div>
      <p className="mt-3 text-[14px] font-semibold text-white">{selected.label}</p>
      <p className="mt-1 text-[12.5px] text-white/45">Selected for your next run</p>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {VEHICLE_VARIANTS.map((v) => {
          const active = v.id === selectedId;
          return (
            <button
              key={v.id}
              onClick={() => onSelect(v.id)}
              disabled={v.locked}
              className={`relative flex flex-col items-center gap-2 rounded-xl border px-3 py-3 transition-colors ${
                active
                  ? 'border-accent-bright/50 bg-accent-bright/10'
                  : v.locked
                    ? 'cursor-not-allowed border-white/10 bg-white/[0.02] opacity-55'
                    : 'border-white/10 bg-white/[0.04] hover:border-white/25'
              }`}
            >
              <span className="h-8 w-12 rounded-lg" style={{ background: v.bodyColor }} />
              <span className="text-[11.5px] font-medium text-white/80">{v.label}</span>
              {v.locked ? (
                <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-black/50 text-white/60">
                  <Icon name="lock" size={11} />
                </span>
              ) : (
                active && (
                  <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-accent-bright text-noir">
                    <Icon name="check" size={11} />
                  </span>
                )
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-[12px] text-white/35">More liveries are on the way — locked vehicles will unlock here.</p>
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
  const { play, muted, toggleMute } = useGameAudio();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('intro');
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [countdownN, setCountdownN] = useState<3 | 2 | 1 | 0 | null>(null);
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
  const [vehicleId, setVehicleId] = useState<string>(() => {
    try {
      return localStorage.getItem(VEHICLE_KEY) || DEFAULT_VEHICLE_ID;
    } catch {
      return DEFAULT_VEHICLE_ID;
    }
  });

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

  // 3 → 2 → 1 → GO, then straight into gameplay. `DriveChallengeGame` is
  // already mounted underneath this (with `active={false}`), so the road
  // sits idle behind the numbers rather than a blank screen.
  useEffect(() => {
    if (phase !== 'countdown' || countdownN === null) return;
    play(countdownN === 0 ? 'go' : 'tick');
    const delay = countdownN === 0 ? 550 : 650;
    const t = window.setTimeout(() => {
      if (countdownN === 0) {
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
    void beginSession();
  };

  const close = () => setOpen(false);

  const selectVehicle = (id: string) => {
    const variant = VEHICLE_VARIANTS.find((v) => v.id === id);
    if (!variant || variant.locked) return;
    setVehicleId(id);
    try {
      localStorage.setItem(VEHICLE_KEY, id);
    } catch {
      // Storage unavailable — the pick just won't persist across visits.
    }
  };

  const selectedVehicle = VEHICLE_VARIANTS.find((v) => v.id === vehicleId) ?? VEHICLE_VARIANTS[0];

  const start = () => {
    if (!gameSession) return;
    setPhase('countdown');
    setCountdownN(3);
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
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
                >
                  <Icon name={phase === 'paused' ? 'play' : 'pause'} size={17} />
                </button>
                <button
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
                >
                  <Icon name={muted ? 'volumeOff' : 'volume'} size={17} />
                </button>
                <button
                  onClick={close}
                  aria-label="Close"
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
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
                  <GaragePanel selectedId={vehicleId} onSelect={selectVehicle} />
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
                    bodyColor={selectedVehicle.bodyColor}
                  />
                </Suspense>

                {phase === 'countdown' && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-5">
                    <img
                      src="/cx-drive-challenge-icon.png"
                      alt=""
                      className="h-14 w-auto animate-fade-up object-contain opacity-90"
                    />
                    <span key={countdownN} className="relative grid place-items-center">
                      <span className="glow-accent-bright absolute inset-0 animate-scale-in rounded-full opacity-60" />
                      <span
                        className="relative animate-scale-in font-display text-8xl font-bold text-accent-bright"
                        style={{ textShadow: '0 0 40px rgba(0,212,71,0.55)' }}
                      >
                        {countdownN === 0 ? 'GO' : countdownN}
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

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Best</p>
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
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Combo</p>
                    <p className="mt-0.5 font-display text-[15px] font-semibold text-accent-bright">
                      &times;{result.maxCombo}
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
