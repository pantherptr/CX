import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tiny Web Audio synthesizer for the Drive Challenge's sound effects —
 * no audio files. Each "sound" is a single short oscillator blip with a
 * gain envelope, distinguished by waveform/pitch/length rather than by
 * loading an asset. Keeps the game's "no heavy libraries" constraint to
 * the letter and means there's nothing to fetch before a sound can play.
 *
 * The `AudioContext` is created lazily on the first `play()` call, which
 * only ever happens from inside real gameplay (countdown tick, token
 * collect, …) — i.e. always after a user gesture (tapping "Start
 * Driving"), satisfying both the browser autoplay policy and "do not
 * autoplay loud audio".
 */

export type GameSound =
  | 'tick'
  | 'go'
  | 'collect'
  | 'combo'
  | 'nearmiss'
  | 'powerup'
  | 'crash'
  | 'gameover'
  | 'reward'
  | 'record';

const MUTE_KEY = 'cx-drive-sound-muted';

/** The official CX gameplay track — a real audio file, not synthesized
 *  like the SFX above. One `<audio>` element is created lazily on first
 *  use and reused for the lifetime of this hook instance (never a new
 *  `Audio()` per phase change), so "loop seamlessly" and "don't create
 *  multiple instances" both fall out of the same object. */
const MUSIC_SRC = '/audio/cx-drive.mp3';
/** Game-home / countdown level — "almost inaudible", per spec. */
const MUSIC_VOLUME_LOW = 0.08;
/** Gameplay level once GO fires. */
const MUSIC_VOLUME_GAMEPLAY = 0.45;
/** How long the GO-moment fade-in takes — "very quickly and smoothly". */
const MUSIC_FADE_IN_MS = 280;
/** How long the drop back to low level takes when returning to the
 *  intro/retry screen — quick but not an abrupt cut. */
const MUSIC_FADE_DOWN_MS = 220;

interface Tone {
  freq: number;
  glide?: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  /** Seconds after the `play()` call this note starts — lets one "sound"
   *  be a short sequence (used for `record`'s two-note ding) rather than
   *  every sound needing its own oscillator-chaining logic. */
  delay?: number;
}

const TONES: Record<GameSound, Tone[]> = {
  tick: [{ freq: 520, duration: 0.07, type: 'sine', gain: 0.05 }],
  go: [{ freq: 780, glide: 1040, duration: 0.16, type: 'triangle', gain: 0.08 }],
  collect: [{ freq: 660, glide: 880, duration: 0.09, type: 'sine', gain: 0.06 }],
  combo: [{ freq: 880, glide: 1180, duration: 0.12, type: 'triangle', gain: 0.07 }],
  // Fast, high, very short — a "whoosh past" cue, deliberately higher-
  // pitched and quieter than `collect` so it never reads as another pickup.
  nearmiss: [{ freq: 1500, glide: 1120, duration: 0.055, type: 'sine', gain: 0.045 }],
  powerup: [{ freq: 520, glide: 1040, duration: 0.22, type: 'sawtooth', gain: 0.05 }],
  crash: [{ freq: 160, glide: 60, duration: 0.22, type: 'square', gain: 0.09 }],
  gameover: [{ freq: 300, glide: 120, duration: 0.35, type: 'sine', gain: 0.06 }],
  reward: [{ freq: 660, glide: 990, duration: 0.28, type: 'triangle', gain: 0.08 }],
  // A brief two-note "ding-ding" — bright but short, distinct from the
  // single-tone reward chime without reading as a loud arcade fanfare.
  record: [
    { freq: 700, glide: 900, duration: 0.11, type: 'triangle', gain: 0.07 },
    { freq: 1050, glide: 1320, duration: 0.16, type: 'triangle', gain: 0.08, delay: 0.1 },
  ],
};

/** Idle/full-speed frequencies (Hz) for the two engine-drone layers —
 *  not a physical engine model, just a low sawtooth fundamental plus a
 *  triangle layer a fifth above it, both rising with speed. Picked by
 *  ear for "audible momentum" without competing with the music or SFX. */
const ENGINE_FREQ_1 = { idle: 46, max: 141 };
const ENGINE_FREQ_2 = { idle: 69, max: 209 };
const ENGINE_GAIN = { idle: 0.02, max: 0.052 };
/** How long the drone takes to ease into/out of its target value — long
 *  enough to never click or pop, short enough to still feel responsive
 *  to a boost or a crash. */
const ENGINE_RAMP_S = 0.16;

export function useGameAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const musicFadeRafRef = useRef<number | null>(null);
  /** The continuous speed-drone — null whenever it isn't currently
   *  playing (paused, countdown, results screen). Two oscillators
   *  sharing one gain node so `updateEngine`/`stopEngine` only ever
   *  touch one gain ramp regardless of the layer count. */
  const engineRef = useRef<{ osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null>(null);
  /** The volume music should sit at once any in-flight fade completes —
   *  read by `toggleMute` so unmuting restores the *current phase's*
   *  level (low on the intro/countdown screen, gameplay level mid-run)
   *  rather than always snapping back to one fixed number. */
  const musicTargetVolumeRef = useRef(MUSIC_VOLUME_LOW);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    return () => {
      if (engineRef.current) {
        try {
          engineRef.current.osc1.stop();
          engineRef.current.osc2.stop();
        } catch {
          // Already stopped — nothing left to clean up.
        }
        engineRef.current = null;
      }
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      if (musicFadeRafRef.current !== null) cancelAnimationFrame(musicFadeRafRef.current);
      musicRef.current?.pause();
      musicRef.current = null;
    };
  }, []);

  /** Lazily creates (or resumes) the one `AudioContext` every synthesized
   *  sound in this hook — SFX, and now the engine drone — shares. */
  const getAudioCtx = useCallback(() => {
    let ctx = ctxRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      ctxRef.current = ctx;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }, []);

  /** Lazily creates the one `<audio>` element this hook instance will
   *  ever use for music, reused across every phase change and every
   *  retry — never a fresh `Audio()` per call. */
  const getMusicEl = useCallback(() => {
    let el = musicRef.current;
    if (!el) {
      el = new Audio(MUSIC_SRC);
      el.loop = true;
      el.preload = 'auto';
      musicRef.current = el;
    }
    return el;
  }, []);

  const cancelMusicFade = useCallback(() => {
    if (musicFadeRafRef.current !== null) {
      cancelAnimationFrame(musicFadeRafRef.current);
      musicFadeRafRef.current = null;
    }
  }, []);

  /** Smoothly ramps the music element's volume to `target` over
   *  `durationMs`, via `requestAnimationFrame` — `HTMLMediaElement.volume`
   *  has no native ramp API, unlike the Web Audio gain nodes the SFX
   *  above use. Any fade already in flight is cancelled first so rapid
   *  phase changes (e.g. an instant retry) can't leave two fades
   *  fighting over the same element. */
  const fadeMusicTo = useCallback(
    (target: number, durationMs: number) => {
      const el = musicRef.current;
      if (!el) return;
      cancelMusicFade();
      const start = el.volume;
      const startTime = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        el.volume = start + (target - start) * t;
        musicFadeRafRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      musicFadeRafRef.current = requestAnimationFrame(step);
    },
    [cancelMusicFade],
  );

  /** GAME HOME + COUNTDOWN — starts the track (if not already running)
   *  at the "almost inaudible" level, or eases an already-playing track
   *  back down to it. Covers both the very first launch and a RETRY
   *  (which re-enters the intro screen via the same `launch()` call). */
  const duckMusic = useCallback(() => {
    musicTargetVolumeRef.current = MUSIC_VOLUME_LOW;
    if (muted) return;
    const el = getMusicEl();
    if (el.paused) {
      cancelMusicFade();
      el.volume = MUSIC_VOLUME_LOW;
      el.currentTime = 0;
      el.play().catch(() => {});
    } else {
      fadeMusicTo(MUSIC_VOLUME_LOW, MUSIC_FADE_DOWN_MS);
    }
  }, [muted, getMusicEl, cancelMusicFade, fadeMusicTo]);

  /** The exact GO moment: stop, rewind to 0:00, and start the track fresh
   *  from the beginning at gameplay volume — with a very quick, smooth
   *  fade-in rather than an instant jump. This is the ONLY place the
   *  track's position is ever reset; lane changes, pickups, pause, etc.
   *  never touch it, so the loop plays on uninterrupted through normal
   *  gameplay. */
  const startGameplayMusic = useCallback(() => {
    musicTargetVolumeRef.current = MUSIC_VOLUME_GAMEPLAY;
    const el = getMusicEl();
    cancelMusicFade();
    el.pause();
    el.currentTime = 0;
    el.volume = muted ? 0 : MUSIC_VOLUME_LOW;
    el.play().catch(() => {});
    if (!muted) fadeMusicTo(MUSIC_VOLUME_GAMEPLAY, MUSIC_FADE_IN_MS);
  }, [muted, getMusicEl, cancelMusicFade, fadeMusicTo]);

  /** Called when the Drive Challenge modal closes — the music has no
   *  reason to keep playing once the player has left the game. */
  const pauseMusic = useCallback(() => {
    cancelMusicFade();
    musicRef.current?.pause();
  }, [cancelMusicFade]);

  const play = useCallback(
    (sound: GameSound) => {
      if (muted) return;
      const ctx = getAudioCtx();

      for (const tone of TONES[sound]) {
        const startAt = ctx.currentTime + (tone.delay ?? 0);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = tone.type;
        osc.frequency.setValueAtTime(tone.freq, startAt);
        if (tone.glide) {
          osc.frequency.exponentialRampToValueAtTime(tone.glide, startAt + tone.duration);
        }
        gain.gain.setValueAtTime(tone.gain, startAt);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + tone.duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + tone.duration);
      }
    },
    [muted, getAudioCtx],
  );

  /** Starts the continuous engine drone — a no-op if it's already
   *  running (idempotent, so a caller doesn't need to track whether it
   *  already called this). Begins at idle level and eases in, same
   *  "never a click or pop" contract as the music fades above. */
  const startEngine = useCallback(() => {
    if (muted || engineRef.current) return;
    const ctx = getAudioCtx();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.value = ENGINE_FREQ_1.idle;
    osc2.frequency.value = ENGINE_FREQ_2.idle;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start();
    osc2.start();
    gain.gain.setTargetAtTime(ENGINE_GAIN.idle, ctx.currentTime, ENGINE_RAMP_S);
    engineRef.current = { osc1, osc2, gain };
  }, [muted, getAudioCtx]);

  /** Retunes the running drone toward `intensity` (0 = idle, 1 = flat
   *  out) — called every simulating frame from the game loop with the
   *  same speed fraction the HUD/camera-punch effects already use, so
   *  the engine note and the visual sense of speed rise together. A
   *  no-op if the drone isn't currently running (paused, not yet
   *  started) rather than an error, since the game loop calls this
   *  unconditionally while active. */
  const updateEngine = useCallback(
    (intensity: number) => {
      const e = engineRef.current;
      if (!e) return;
      const ctx = ctxRef.current;
      if (!ctx) return;
      const t = Math.min(1, Math.max(0, intensity));
      const now = ctx.currentTime;
      e.osc1.frequency.setTargetAtTime(ENGINE_FREQ_1.idle + t * (ENGINE_FREQ_1.max - ENGINE_FREQ_1.idle), now, ENGINE_RAMP_S);
      e.osc2.frequency.setTargetAtTime(ENGINE_FREQ_2.idle + t * (ENGINE_FREQ_2.max - ENGINE_FREQ_2.idle), now, ENGINE_RAMP_S);
      e.gain.gain.setTargetAtTime(muted ? 0 : ENGINE_GAIN.idle + t * (ENGINE_GAIN.max - ENGINE_GAIN.idle), now, ENGINE_RAMP_S);
    },
    [muted],
  );

  /** Eases the drone out and stops both oscillators shortly after —
  *   called on pause, on the run ending (crash or otherwise), and from
  *   this hook's own unmount cleanup above. Safe to call repeatedly:
  *   a second call while the fade-out is still in flight finds
  *   `engineRef.current` already cleared and simply no-ops. */
  const stopEngine = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    const ctx = ctxRef.current;
    engineRef.current = null;
    if (!ctx) return;
    const now = ctx.currentTime;
    e.gain.gain.cancelScheduledValues(now);
    e.gain.gain.setTargetAtTime(0, now, ENGINE_RAMP_S * 0.75);
    const { osc1, osc2 } = e;
    window.setTimeout(() => {
      try {
        osc1.stop();
        osc2.stop();
      } catch {
        // Context may already be closed (modal closed mid-fade) — fine.
      }
    }, 400);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(MUTE_KEY, next ? '1' : '0');
      } catch {
        // Storage unavailable — the preference just won't persist.
      }
      // Music snaps to/from silence immediately (a fade here would be
      // audible and pointless) — it always returns to whatever level the
      // current phase (game home vs. gameplay) last set as the target.
      const el = musicRef.current;
      if (el) {
        cancelMusicFade();
        el.volume = next ? 0 : musicTargetVolumeRef.current;
      }
      // Muting snaps the engine drone to silence immediately, the same
      // way music does; unmuting needs no equivalent snap-back here —
      // the drone only ever runs during active gameplay, where the game
      // loop's own per-frame `updateEngine` call restores it to whatever
      // the current speed calls for on the very next frame.
      const engine = engineRef.current;
      const ctx = ctxRef.current;
      if (engine && ctx && next) {
        engine.gain.gain.cancelScheduledValues(ctx.currentTime);
        engine.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      }
      return next;
    });
  }, [cancelMusicFade]);

  return { play, muted, toggleMute, duckMusic, startGameplayMusic, pauseMusic, startEngine, updateEngine, stopEngine };
}
