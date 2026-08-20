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

export function useGameAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const musicFadeRafRef = useRef<number | null>(null);
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
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      if (musicFadeRafRef.current !== null) cancelAnimationFrame(musicFadeRafRef.current);
      musicRef.current?.pause();
      musicRef.current = null;
    };
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
      let ctx = ctxRef.current;
      if (!ctx) {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

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
    [muted],
  );

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
      return next;
    });
  }, [cancelMusicFade]);

  return { play, muted, toggleMute, duckMusic, startGameplayMusic, pauseMusic };
}
