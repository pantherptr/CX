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
    };
  }, []);

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
      return next;
    });
  }, []);

  return { play, muted, toggleMute };
}
