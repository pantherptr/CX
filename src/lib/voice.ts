import { apiUrl } from './api';
import { supabase } from './supabase';

/**
 * X's voice. Listening (the microphone) uses the browser's own speech recognition — free. Speaking uses
 * ElevenLabs through /api/notify-message (type "voice") and only runs when the speaker button is tapped, and
 * only if the site was built with VITE_VOICE=1. Each sentence is fetched once and kept for the session.
 */
export const VOICE_ENABLED = import.meta.env.VITE_VOICE === '1';

const cache = new Map<string, string>();
let current: { audio: HTMLAudioElement; done: () => void } | null = null;

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
  if (!current) return;
  current.audio.pause();
  current.done();
  current = null;
}

/** Plays `text`; resolves when it ends (or is stopped). Rejects if the voice is unavailable. */
export async function speak(text: string, lang: string): Promise<void> {
  stopSpeaking();
  const clean = speakable(text);
  if (!clean) return;
  const key = `${lang}:${clean}`;
  let url = cache.get(key);
  if (!url) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(apiUrl('/api/notify-message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ type: 'voice', text: clean, lang }),
    });
    if (!res.ok) throw new Error('voice unavailable');
    url = URL.createObjectURL(await res.blob());
    cache.set(key, url);
  }
  await new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    const done = () => resolve();
    current = { audio, done };
    audio.onended = () => { current = null; done(); };
    audio.onerror = () => { current = null; reject(new Error('playback failed')); };
    void audio.play().catch((e) => { current = null; reject(e); });
  });
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
