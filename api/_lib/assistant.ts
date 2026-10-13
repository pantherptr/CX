import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { faqs } from '../../src/data/faqs.js';

/**
 * The CX assistant ("Kai"): answers visitors and members about cars and about problems, and says when a
 * person from the team should take over. It is stateless — the page sends the last few messages — and it
 * only ever sees public facts: the FAQ and the published car list. Private data (bookings, messages,
 * documents) is never sent to the model, and it is told never to ask for card numbers, passwords or codes.
 *
 * Answers `{ reply, cars: [slug], human }`. Without ANTHROPIC_API_KEY it answers politely and offers a
 * person, so the chat never dead-ends.
 */
const MODEL = process.env.ANTHROPIC_ASSISTANT_MODEL || process.env.ANTHROPIC_TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';
const MAX_MESSAGES = 12;
const MAX_CHARS = 900;

// Cost guards (best effort, per server instance — a speed bump, not a guarantee; the hard ceiling is the
// spend limit set in the Anthropic console):
//  - visitors who are not signed in get a few answers per 10 minutes, members get more;
//  - ASSISTANT_DAILY_MAX caps the answers a day (default 3000);
//  - ASSISTANT_ENABLED=0 switches the AI off (Kai then only hands over to a person).
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
  return day.n > Number(process.env.ASSISTANT_DAILY_MAX || 3000);
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

let carsCache: { at: number; text: string; slugs: Set<string> } | null = null;
async function carContext(): Promise<{ text: string; slugs: Set<string> }> {
  if (carsCache && Date.now() - carsCache.at < 5 * 60_000) return carsCache;
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return { text: '(no car list available)', slugs: new Set() };
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data } = await sb
    .from('cars')
    .select('slug, make, model, year, category, city, price_per_day')
    .eq('status', 'published')
    .limit(60);
  const rows = (data ?? []) as { slug: string; make: string; model: string; year: number; category: string; city: string; price_per_day: number }[];
  const text = rows.length
    ? rows.map((r) => `${r.slug} | ${r.year} ${r.make} ${r.model} | ${r.category} | ${r.city} | €${r.price_per_day}/day`).join('\n')
    : '(no published cars right now)';
  carsCache = { at: Date.now(), text, slugs: new Set(rows.map((r) => r.slug)) };
  return carsCache;
}

const faqText = () => faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n');

export async function handleAssistant(req: VercelRequest, res: VercelResponse) {
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
  const uid = await signedInUser(req);
  if (limited(uid ? `u:${uid}` : `ip:${ip}`, uid ? 40 : 8)) {
    return res.status(429).json({ error: uid ? 'Too many messages. Please wait a moment.' : 'Sign in to keep chatting with Kai, or talk to a person from the team.' });
  }

  const body = (req.body ?? {}) as { messages?: { role?: string; content?: string }[]; signedIn?: boolean };
  const raw = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const messages = raw
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, MAX_CHARS) }));
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') return res.status(400).json({ error: 'Say something first.' });

  const orKey = process.env.OPENROUTER_API_KEY;
  const key = orKey || process.env.ANTHROPIC_API_KEY;
  if (!key || process.env.ASSISTANT_ENABLED === '0' || overDaily()) {
    return res.status(200).json({
      reply: 'I cannot answer right now, but a person from the CX team can help you. Tap “Talk to a person”.',
      cars: [],
      human: true,
    });
  }

  const { text: cars, slugs } = await carContext();
  const system = [
    'You are Kai, the assistant of CX, a premium car-rental marketplace where people rent cars from local hosts.',
    'Be warm, brief and concrete: usually 1–3 short sentences, plain text, no markdown headings. Reply in the language of the user\'s last message.',
    'You help with two things: (1) finding the right car — ask at most one short question at a time (trip type, people, budget, city) and then suggest 1–3 cars from the list; (2) problems and questions about booking, payments, verification, handover, cancellation, hosting — answer from the FAQ below only.',
    'Never invent prices, policies, availability, legal or insurance details. If something is not in the FAQ or the car list, say you are not sure and offer a person from the team.',
    'Never ask for or accept card numbers, passwords, one-time codes or document photos in this chat.',
    'You cannot see anyone\'s bookings or account; for a specific booking or account issue, offer a person from the team.',
    'Control markers, each on its own line at the very end of your reply (never explained to the user):',
    '  <<cars:slug1,slug2>>  — only slugs from the car list, when you are recommending those cars;',
    '  <<human>>  — when the person asks for a human, is upset, reports a safety/payment/account problem, or you cannot resolve it.',
    '',
    'PUBLISHED CARS (slug | car | category | city | price):',
    cars,
    '',
    'FAQ:',
    faqText(),
  ].join('\n');

  try {
    // OpenRouter (free models, e.g. OPENROUTER_MODEL=openrouter/free) wins when its key is set; otherwise Anthropic.
    let out = '';
    if (orKey) {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${orKey}` },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'openrouter/free',
          max_tokens: 500,
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      });
      if (!r.ok) throw new Error(`model ${r.status}`);
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      out = (j.choices?.[0]?.message?.content ?? '').trim();
    } else {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 500, system, messages }),
      });
      if (!r.ok) throw new Error(`model ${r.status}`);
      const j = (await r.json()) as { content?: { type: string; text?: string }[] };
      out = (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
    }
    const picked: string[] = [];
    out = out.replace(/<<cars:([^>]*)>>/gi, (_m, list: string) => {
      for (const s of String(list).split(',').map((x) => x.trim())) if (slugs.has(s) && !picked.includes(s)) picked.push(s);
      return '';
    });
    const human = /<<human>>/i.test(out);
    out = out.replace(/<<human>>/gi, '').trim();
    return res.status(200).json({ reply: out || 'Tell me a little more and I will help.', cars: picked.slice(0, 3), human });
  } catch (err) {
    console.error('[assistant]', err);
    return res.status(200).json({
      reply: 'I had trouble answering that. You can try again, or talk to a person from the team.',
      cars: [],
      human: true,
    });
  }
}
