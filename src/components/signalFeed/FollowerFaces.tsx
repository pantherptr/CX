import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useLocale } from '../../lib/i18n';
import { Img } from '../motion';
import { Icon } from '../Icon';

/**
 * The faces of the people who follow you most recently (real profiles, at most four), stacked, with the total.
 * Shown on your own profile only, where follower counts are visible; tapping it opens the full list.
 * One small query (4 rows). It renders nothing until there is at least one follower.
 */
export function FollowerFaces({ userId, count, onOpen }: { userId: string; count: number; onOpen: () => void }) {
  const { t } = useLocale();
  const [faces, setFaces] = useState<{ id: string; name: string; avatar: string | null }[]>([]);

  useEffect(() => {
    if (count <= 0) { setFaces([]); return; }
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from('profile_follows')
        .select('follower:profiles!profile_follows_follower_id_fkey(id, full_name, avatar_url)')
        .eq('followee_id', userId)
        .order('created_at', { ascending: false })
        .limit(4);
      if (!alive) return;
      const rows = (data ?? []) as unknown as { follower: { id: string; full_name: string | null; avatar_url: string | null } | null }[];
      setFaces(rows.flatMap((r) => (r.follower ? [{ id: r.follower.id, name: r.follower.full_name ?? '', avatar: r.follower.avatar_url }] : [])));
    })();
    return () => { alive = false; };
  }, [userId, count]);

  if (count <= 0 || faces.length === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="pressable mb-3 flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left shadow-hair"
    >
      <span className="flex -space-x-2">
        {faces.map((f) => (
          <span key={f.id} className="block h-8 w-8 overflow-hidden rounded-full bg-panel ring-2 ring-surface">
            {f.avatar ? (
              <Img src={f.avatar} alt="" className="h-full w-full object-cover" fallback={<span className="grid h-full w-full place-items-center text-caption font-semibold text-muted">{f.name.slice(0, 1).toUpperCase()}</span>} />
            ) : (
              <span className="grid h-full w-full place-items-center text-caption font-semibold text-muted">{f.name.slice(0, 1).toUpperCase() || '?'}</span>
            )}
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-detail text-ink-soft">
        <span className="font-semibold text-ink">{count.toLocaleString()}</span> {count === 1 ? t('follower') : t('followers')}
      </span>
      <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
    </button>
  );
}
