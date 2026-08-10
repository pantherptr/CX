import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * False until real keys are in `.env.local`. Auth-dependent code checks
 * this instead of letting a missing config crash the whole app at import
 * time — the rest of the (still mock-data) site must keep working while
 * Supabase is being set up.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — auth is disabled. Copy .env.example to .env.local and fill them in.',
  );
}

// Falls back to a placeholder so `createClient` never throws; every real
// call site is gated behind `isSupabaseConfigured` so the placeholder is
// never actually used to make a request.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder');
