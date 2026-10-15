import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { uiLocale } from '../i18n/uiLocale';

/**
 * SIGNAL plan (migration 0138). Step one only records who is a Creator and shows the grey badge; nothing is
 * limited or charged. Lookups are batched: every badge asks for its person, one request answers them all, and
 * the answer is remembered for the session. Fails soft before the migration has run (nobody is a Creator).
 */
const known = new Map<string, boolean>();
const wanted = new Set<string>();
const listeners = new Set<() => void>();
let timer: number | undefined;

async function flush() {
  timer = undefined;
  const ids = Array.from(wanted);
  wanted.clear();
  if (ids.length === 0) return;
  let creators = new Set<string>();
  try {
    const { data, error } = await supabase.rpc('get_creator_ids', { p_ids: ids });
    if (!error && Array.isArray(data)) creators = new Set((data as { user_id: string }[]).map((r) => r.user_id));
  } catch { /* ignore */ }
  for (const id of ids) known.set(id, creators.has(id));
  listeners.forEach((l) => l());
}

function want(id: string) {
  if (known.has(id) || wanted.has(id)) return;
  wanted.add(id);
  if (timer === undefined) timer = window.setTimeout(() => void flush(), 60);
}

/** True when this person is on the Creator plan (and not already marked host / team). */
export function useIsCreator(userId: string | null | undefined): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    want(userId);
    return () => { listeners.delete(l); };
  }, [userId]);
  return userId ? known.get(userId) === true : false;
}

/** For the admin list: which of these people are Creators right now (uncached). */
export async function fetchCreatorIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase.rpc('get_creator_ids', { p_ids: ids });
  if (error || !Array.isArray(data)) return new Set();
  return new Set((data as { user_id: string }[]).map((r) => r.user_id));
}

export async function setSignalPlan(userId: string, plan: 'free' | 'creator'): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_signal_plan', { p_user_id: userId, p_plan: plan });
  if (!error) { known.set(userId, plan === 'creator'); listeners.forEach((l) => l()); }
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------- free-plan limits (migration 0139)
export interface SignalLimits {
  enforce: boolean;
  isCreator: boolean;
  maxSeconds: number;
  perMonth: number;
  videosThisMonth: number;
}

let limitsCache: { at: number; value: SignalLimits } | null = null;

/** The limits that apply to the signed-in person (cached for a minute). `null` before the migration has run. */
export async function getMyLimits(force = false): Promise<SignalLimits | null> {
  if (!force && limitsCache && Date.now() - limitsCache.at < 60_000) return limitsCache.value;
  try {
    const { data, error } = await supabase.rpc('my_signal_limits');
    if (error || !data) return null;
    const d = data as { enforce: boolean; is_creator: boolean; free_video_max_seconds: number; free_videos_per_month: number; videos_this_month: number };
    const value: SignalLimits = {
      enforce: d.enforce, isCreator: d.is_creator, maxSeconds: d.free_video_max_seconds, perMonth: d.free_videos_per_month, videosThisMonth: d.videos_this_month,
    };
    limitsCache = { at: Date.now(), value };
    return value;
  } catch {
    return null;
  }
}

const LIMIT_TEXT: Record<string, { length: (m: string) => string; month: (n: number) => string }> = {
  en: {
    length: (m) => `Videos on the free plan can be up to ${m}. Creator removes the limit.`,
    month: (n) => `The free plan includes ${n} videos a month. Photos are unlimited, and Creator removes the limit.`,
  },
  it: {
    length: (m) => `Con il piano gratuito i video possono durare fino a ${m}. Con Creator il limite non c'è.`,
    month: (n) => `Il piano gratuito include ${n} video al mese. Le foto sono illimitate, e con Creator il limite non c'è.`,
  },
  ro: {
    length: (m) => `Cu planul gratuit, videoclipurile pot avea cel mult ${m}. Creator elimină limita.`,
    month: (n) => `Planul gratuit include ${n} videoclipuri pe lună. Pozele sunt nelimitate, iar Creator elimină limita.`,
  },
  es: {
    length: (m) => `Con el plan gratuito los vídeos pueden durar hasta ${m}. Creator quita el límite.`,
    month: (n) => `El plan gratuito incluye ${n} vídeos al mes. Las fotos son ilimitadas y Creator quita el límite.`,
  },
};
const UNIT: Record<string, { one: string; many: string; sec: string }> = {
  en: { one: 'minute', many: 'minutes', sec: 'seconds' },
  it: { one: 'minuto', many: 'minuti', sec: 'secondi' },
  ro: { one: 'minut', many: 'minute', sec: 'secunde' },
  es: { one: 'minuto', many: 'minutos', sec: 'segundos' },
};

/** Why a video of `durationSec` cannot be added on the free plan, or null when it can. */
export async function freeVideoBlockReason(durationSec: number | undefined): Promise<string | null> {
  const l = await getMyLimits();
  if (!l || !l.enforce || l.isCreator) return null;
  const code = (uiLocale() || 'en').slice(0, 2);
  const txt = LIMIT_TEXT[code] ?? LIMIT_TEXT.en;
  const u = UNIT[code] ?? UNIT.en;
  if (durationSec !== undefined && durationSec > l.maxSeconds) {
    const m = Math.round(l.maxSeconds / 60);
    return txt.length(m >= 1 ? `${m} ${m === 1 ? u.one : u.many}` : `${l.maxSeconds} ${u.sec}`);
  }
  if (l.videosThisMonth >= l.perMonth) return txt.month(l.perMonth);
  return null;
}

/** Owner / Admin: switch the free-plan limits on or off and set the numbers. */
export async function fetchPlanConfig(): Promise<{ enforce: boolean; maxSeconds: number; perMonth: number } | null> {
  const { data, error } = await supabase.from('signal_plan_config').select('enforce, free_video_max_seconds, free_videos_per_month').maybeSingle();
  if (error || !data) return null;
  return { enforce: data.enforce as boolean, maxSeconds: data.free_video_max_seconds as number, perMonth: data.free_videos_per_month as number };
}

export async function savePlanConfig(c: { enforce: boolean; maxSeconds: number; perMonth: number }): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_signal_limits', { p_enforce: c.enforce, p_max_seconds: c.maxSeconds, p_per_month: c.perMonth });
  if (!error) limitsCache = null;
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------- asking for the Creator plan (migration 0140)
export async function requestCreator(): Promise<{ sent: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('request_creator');
  if (error) return { sent: false, error: error.message };
  return { sent: data === true, error: null };
}

/** Has the signed-in person already asked? (RLS lets them see only their own row.) */
export async function hasRequestedCreator(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('creator_requests').select('user_id').eq('user_id', userId).maybeSingle();
  return !error && Boolean(data);
}

/** Admin: who is waiting for the Creator plan. */
export async function fetchCreatorRequestIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('creator_requests').select('user_id');
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.user_id as string));
}
