import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/** The official accounts' public numbers: posts published on SIGNAL and since when ('cx' team or the 'assistant' X). */
export function useOfficialStats(publisher: 'cx' | 'assistant' = 'cx') {
  const [stats, setStats] = useState<{ posts: number; since: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [{ count }, { data }] = await Promise.all([
          supabase.from('empire_posts').select('id', { count: 'exact', head: true }).eq('publisher_type', publisher),
          supabase.from('empire_posts').select('created_at').eq('publisher_type', publisher).order('created_at', { ascending: true }).limit(1),
        ]);
        if (live) setStats({ posts: count ?? 0, since: (data?.[0]?.created_at as string | undefined) ?? null });
      } catch {
        if (live) setStats({ posts: 0, since: null });
      }
    })();
    return () => { live = false; };
  }, [publisher]);
  return stats;
}
