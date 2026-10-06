import { useEffect, useState } from 'react';
import { apiUrl } from '../api';
import { supabase } from '../supabase';
import { useLocale } from './index';

/**
 * Translation of user-written content (car descriptions, host bios,
 * reviews, SIGNAL posts, comments and captions) — the one thing the
 * dictionaries can't cover. Asks /api/translate, which only ever
 * translates published content and caches every result. If the service is
 * not configured or fails, the original text just stays.
 */
const memory = new Map<string, string>();
const pending = new Map<string, Set<(v: string | null) => void>>();
const STORE_KEY = 'cx-ugc-i18n';
const STORE_MAX = 300;

function loadStore(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function saveStore(key: string, value: string) {
  try {
    const store = loadStore();
    store[key] = value;
    const keys = Object.keys(store);
    for (const k of keys.slice(0, Math.max(0, keys.length - STORE_MAX))) delete store[k];
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage full or blocked — the in-memory cache still works */
  }
}

let queue: { lang: string; text: string }[] = [];
let timer: number | undefined;

async function flush() {
  timer = undefined;
  const batch = queue;
  queue = [];
  const byLang = new Map<string, string[]>();
  for (const { lang, text } of batch) {
    const list = byLang.get(lang) ?? [];
    if (!list.includes(text)) list.push(text);
    byLang.set(lang, list);
  }
  for (const [lang, all] of byLang) {
    for (let i = 0; i < all.length; i += 12) {
      const texts = all.slice(i, i + 12);
      let results: (string | null)[] = texts.map(() => null);
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const res = await fetch(apiUrl('/api/translate'), {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ lang, texts }),
        });
        if (res.ok) results = ((await res.json()) as { results: (string | null)[] }).results;
      } catch {
        /* offline or not deployed — keep the originals */
      }
      texts.forEach((text, k) => {
        const key = `${lang}|${text}`;
        const tr = results[k] ?? null;
        if (tr) {
          memory.set(key, tr);
          saveStore(key, tr);
        }
        pending.get(key)?.forEach((cb) => cb(tr));
        pending.delete(key);
      });
    }
  }
}

function request(lang: string, text: string, cb: (v: string | null) => void) {
  const key = `${lang}|${text}`;
  const waiting = pending.get(key);
  if (waiting) {
    waiting.add(cb);
    return;
  }
  pending.set(key, new Set([cb]));
  queue.push({ lang, text });
  if (timer === undefined) timer = window.setTimeout(flush, 60);
}

/** The text in the visitor's language, or the original until (and unless) a translation arrives. */
export function useTranslated(text: string | null | undefined): string {
  const { lang } = useLocale();
  const source = text ?? '';
  const key = `${lang}|${source}`;
  const [value, setValue] = useState<string>(() => (lang === 'en' ? source : memory.get(key) ?? loadStore()[key] ?? source));

  useEffect(() => {
    if (lang === 'en' || !source.trim()) {
      setValue(source);
      return;
    }
    const cached = memory.get(key) ?? loadStore()[key];
    if (cached) {
      memory.set(key, cached);
      setValue(cached);
      return;
    }
    setValue(source);
    let alive = true;
    request(lang, source, (tr) => {
      if (alive && tr) setValue(tr);
    });
    return () => {
      alive = false;
    };
  }, [key, lang, source]);

  return value;
}

/** Drop-in for rendering user-written text: `<Ugc text={post.body} />`. */
export function Ugc({ text }: { text: string | null | undefined }) {
  return <>{useTranslated(text)}</>;
}
