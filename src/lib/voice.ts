import { apiUrl } from './api';
import { supabase } from './supabase';

/**
 * X's voice. Listening (the microphone) uses the browser's own speech recognition — free. Speaking uses
 * ElevenLabs through /api/notify-message (type "voice") and only runs when the speaker button is tapped, and
 * only if the site was built with VITE_VOICE=1. Each sentence is fetched once and kept for the session.
 */
export const VOICE_ENABLED = import.meta.env.VITE_VOICE === '1';

const cache = new Map<string, string>();
// One audio element for the whole session: it is "unlocked" by the tap that opens X (see primeVoice), which is
// what lets the welcome play by itself afterwards, even on iPhone.
let shared: HTMLAudioElement | null = null;
let settle: (() => void) | null = null;
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function player(): HTMLAudioElement {
  if (!shared) shared = new Audio();
  return shared;
}

/** Call from the tap that opens the chat: unlocks audio so the welcome may play without another tap. */
export function primeVoice(): void {
  if (!VOICE_ENABLED || typeof window === 'undefined') return;
  const a = player();
  a.src = SILENCE;
  void a.play().catch(() => {});
}

const PREF = 'cx-x-voice';
/** The welcome (and nothing else) plays by itself — unless the person silenced it. */
export const autoVoiceAllowed = (): boolean => {
  try { return window.localStorage.getItem(PREF) !== 'off'; } catch { return true; }
};
export const setAutoVoice = (on: boolean): void => {
  try { window.localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
};

/** Text as it should be read aloud: no emoji, no markdown marks, no links. */
export function speakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function stopSpeaking(): void {
  if (shared) shared.pause();
  const done = settle;
  settle = null;
  done?.();
}

async function fetchAudio(clean: string, lang: string, persist: boolean): Promise<string> {
  const key = `${lang}:${clean}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cacheKey = `https://voice.local/${encodeURIComponent(key)}`;
  let blob: Blob | null = null;
  if (persist && typeof caches !== 'undefined') {
    try { blob = await (await caches.open('cx-voice-v2')).match(cacheKey).then((r) => (r ? r.blob() : null)); } catch { /* no cache */ }
  }
  if (!blob) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(apiUrl('/api/notify-message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ type: 'voice', text: clean, lang }),
    });
    if (!res.ok) throw new Error(`voice ${res.status}`);
    blob = await res.blob();
    if (persist && typeof caches !== 'undefined') {
      try { await (await caches.open('cx-voice-v2')).put(cacheKey, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } })); } catch { /* no cache */ }
    }
  }
  const url = URL.createObjectURL(blob);
  cache.set(key, url);
  return url;
}

/** Plays `text`; resolves when it ends (or is stopped). Rejects if the voice is unavailable.
 *  `persist` keeps the audio on this device (used for the welcome, so it is generated once per phone). */
export async function speak(text: string, lang: string, opts: { persist?: boolean } = {}): Promise<void> {
  stopSpeaking();
  const clean = speakable(text);
  if (!clean) return;
  const url = await fetchAudio(clean, lang, Boolean(opts.persist));
  await new Promise<void>((resolve, reject) => {
    const audio = player();
    settle = resolve;
    audio.onended = () => { settle = null; resolve(); };
    audio.onerror = () => { settle = null; reject(new Error('playback failed')); };
    audio.src = url;
    void audio.play().catch((e) => { settle = null; reject(e); });
  });
}

export interface PreparedVoice {
  /** seconds of audio (0 when the browser could not tell) */
  duration: number;
  /** starts playing; resolves when it ends or is stopped */
  play: () => Promise<void>;
}

/** Fetches the audio first so the text can be written at the voice's own pace and both start together. */
export async function prepareSpeech(text: string, lang: string, opts: { persist?: boolean } = {}): Promise<PreparedVoice | null> {
  const clean = speakable(text);
  if (!clean) return null;
  const url = await fetchAudio(clean, lang, Boolean(opts.persist));
  const duration = await new Promise<number>((resolve) => {
    const probe = new Audio();
    const finish = () => resolve(Number.isFinite(probe.duration) ? probe.duration : 0);
    probe.preload = 'metadata';
    probe.onloadedmetadata = finish;
    probe.onerror = () => resolve(0);
    window.setTimeout(finish, 1500);
    probe.src = url;
  });
  return {
    duration,
    play: async () => {
      stopSpeaking();
      await new Promise<void>((resolve, reject) => {
        const audio = player();
        settle = resolve;
        audio.onended = () => { settle = null; resolve(); };
        audio.onerror = () => { settle = null; reject(new Error('playback failed')); };
        audio.src = url;
        void audio.play().catch((e) => { settle = null; reject(e); });
      });
    },
  };
}

/* ---- listening ---- */
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const canListen = (): boolean => ctor() !== null;

const BCP47: Record<string, string> = { it: 'it-IT', en: 'en-GB', ro: 'ro-RO', es: 'es-ES' };

/** Starts listening; `onText` gets the running transcript, `onEnd` fires once with the final one. Returns a stop function. */
export function listen(lang: string, onText: (text: string) => void, onEnd: (finalText: string) => void): () => void {
  const R = ctor();
  if (!R) { onEnd(''); return () => {}; }
  const r = new R();
  r.lang = BCP47[lang] ?? 'en-GB';
  r.interimResults = true;
  r.continuous = false;
  let last = '';
  let ended = false;
  const finish = () => { if (ended) return; ended = true; onEnd(last.trim()); };
  r.onresult = (e) => {
    let t = '';
    for (let i = 0; i < e.results.length; i += 1) t += e.results[i][0].transcript;
    last = t;
    onText(t);
  };
  r.onend = finish;
  r.onerror = finish;
  try { r.start(); } catch { finish(); }
  return () => { try { r.stop(); } catch { /* already stopped */ } };
}
