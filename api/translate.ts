import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { applyCors } from './_lib/cors.js';

/**
 * Translates user-written content (car descriptions, host bios, reviews,
 * SIGNAL posts / comments / captions) into the visitor's language.
 *
 *  - Only text that already exists as published content is ever sent to the
 *    model (public.is_translatable_content, migration 0069) — never private
 *    messages, never arbitrary text.
 *  - Results are cached forever in public.content_translations, so each text
 *    is translated once per language.
 *  - Without ANTHROPIC_API_KEY (or the Supabase service key) it does nothing
 *    and answers `skipped`, and the site simply keeps showing the original.
 */
const LANGS = { it: 'Italian', ro: 'Romanian', es: 'Spanish' } as const;
type Lang = keyof typeof LANGS;

const MAX_TEXTS = 12;
const MAX_CHARS = 1500;
const MODEL = process.env.ANTHROPIC_TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';

// Best-effort per-instance limiter — a speed bump, not a guarantee.
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 60;
}

const hashOf = (s: string) => createHash('sha256').update(s).digest('hex');

async function translateBatch(texts: string[], lang: Lang, key: string): Promise<(string | null)[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system:
        `You translate short user-written texts from a car-rental marketplace into ${LANGS[lang]}. ` +
        'Keep the meaning, tone, emoji, @mentions, #hashtags, numbers, brand and car names. ' +
        `If a text is already in ${LANGS[lang]}, return it unchanged. ` +
        'Reply with ONLY a JSON array of strings, the same length and order as the input, no commentary.',
      messages: [{ role: 'user', content: JSON.stringify(texts) }],
    }),
  });
  if (!res.ok) {
    console.error('translate: Anthropic', res.status, (await res.text()).slice(0, 300));
    return texts.map(() => null);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const raw = data.content?.find((c) => c.type === 'text')?.text ?? '';
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== texts.length) return texts.map(() => null);
    return parsed.map((v) => (typeof v === 'string' && v.trim() ? v : null));
  } catch {
    return texts.map(() => null);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { lang, texts } = (req.body ?? {}) as { lang?: string; texts?: unknown };
  if (!lang || !(lang in LANGS) || !Array.isArray(texts) || texts.length === 0 || texts.length > MAX_TEXTS) {
    return res.status(400).json({ error: 'Bad request.' });
  }
  const list = texts.map((t) => (typeof t === 'string' ? t : ''));
  if (list.some((t) => t.length > MAX_CHARS)) return res.status(400).json({ error: 'Text too long.' });

  const ip = String(req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim();
  if (limited(ip)) return res.status(429).json({ error: 'Too many requests.' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(200).json({ skipped: true, results: list.map(() => null) });

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const L = lang as Lang;
  const hashes = list.map((t) => (t.trim() ? hashOf(t) : ''));

  const { data: cached } = await db
    .from('content_translations')
    .select('source_hash, translated')
    .eq('lang', L)
    .in('source_hash', hashes.filter(Boolean));
  const found = new Map((cached ?? []).map((r) => [r.source_hash as string, r.translated as string]));

  const results: (string | null)[] = list.map((_, i) => (hashes[i] ? found.get(hashes[i]) ?? null : null));
  const missing = list.map((t, i) => i).filter((i) => hashes[i] && results[i] === null);

  if (missing.length > 0 && anthropicKey) {
    // Only translate text that really is published content.
    const allowed: number[] = [];
    for (const i of missing) {
      const { data: ok, error: rpcError } = await db.rpc('is_translatable_content', { t: list[i] });
      if (rpcError) console.error('translate: allow-list rpc', rpcError.message);
      if (ok === true) allowed.push(i);
    }
    if (allowed.length > 0) {
      const out = await translateBatch(allowed.map((i) => list[i]), L, anthropicKey);
      const rows: { source_hash: string; lang: Lang; translated: string }[] = [];
      allowed.forEach((i, k) => {
        const tr = out[k];
        if (tr) {
          results[i] = tr;
          rows.push({ source_hash: hashes[i], lang: L, translated: tr });
        }
      });
      if (rows.length > 0) {
        const { error: upsertError } = await db.from('content_translations').upsert(rows, { onConflict: 'source_hash,lang' });
        if (upsertError) console.error('translate: cache write', upsertError.message);
      }
    }
  }

  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).json({ results });
}
