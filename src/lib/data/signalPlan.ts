import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

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
