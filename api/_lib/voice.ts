import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * X's voice: turns one answer into speech with ElevenLabs. Opt-in on the page (the speaker button) and
 * guarded like the assistant: a few sentences per 10 minutes for visitors, more for members, and a daily
 * cap (VOICE_DAILY_MAX, default 400). Without ELEVENLABS_API_KEY it answers 503 and the page simply keeps
 * the text. The voice is ELEVENLABS_VOICE_ID (default: Charlie, a premade voice; library voices such as Marco need a paid plan).
 */
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'IKne3meq5aSn9XLyUdCD';
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
const MAX_CHARS = 500;

const hits = new Map<string, number[]>();
function limited(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}
const day = { d: '', n: 0 };
function overDaily(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (day.d !== today) { day.d = today; day.n = 0; }
  day.n += 1;
  return day.n > Number(process.env.VOICE_DAILY_MAX || 400);
}

async function signedInUser(req: VercelRequest): Promise<string | null> {
  const h = req.headers.authorization;
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!h || !h.startsWith('Bearer ') || !url || !anon) return null;
  try {
    const sb = createClient(url, anon, { global: { headers: { Authorization: h } }, auth: { persistSession: false } });
    const { data } = await sb.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function handleVoice(req: VercelRequest, res: VercelResponse) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || process.env.VOICE_ENABLED === '0') return res.status(503).json({ error: 'Voice is not available.' });
  const body = (req.body ?? {}) as { text?: unknown; lang?: unknown };
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_CHARS) : '';
  if (!text) return res.status(400).json({ error: 'Missing text.' });
  const lang = ['it', 'en', 'ro', 'es'].includes(String(body.lang)) ? String(body.lang) : 'it';

  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
  const uid = await signedInUser(req);
  if (limited(uid ? `u:${uid}` : `ip:${ip}`, uid ? 30 : 6)) return res.status(429).json({ error: 'Too many requests.' });
  if (overDaily()) return res.status(429).json({ error: 'Voice is resting for today.' });

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL, language_code: lang, voice_settings: { stability: 0.45, similarity_boost: 0.8 } }),
    });
    if (!r.ok) {
      // ElevenLabs says why in `detail.status` (e.g. paid_plan_required, missing_permissions) — no secrets in it.
      const j = (await r.json().catch(() => null)) as { detail?: { status?: string; message?: string } | string } | null;
      const why = typeof j?.detail === 'string' ? j.detail : (j?.detail?.status ?? '');
      console.error('[voice]', r.status, why);
      return res.status(502).json({ error: 'Voice failed.', upstream: r.status, why: String(why).slice(0, 80) });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.status(200).send(buf);
  } catch (err) {
    console.error('[voice]', err);
    return res.status(502).json({ error: 'Voice failed.' });
  }
}
