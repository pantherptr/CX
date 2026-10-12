import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { cancelScheduledPost, fetchMyScheduledPosts, type ScheduledPost } from '../../lib/data/empireFeed';
import { useLocale } from '../../lib/i18n';
import { uiLocale } from '../../lib/i18n/uiLocale';

/** Your own posts waiting for their time — with a way to cancel each one. Only shown when there are any. */
export function SignalScheduledList() {
  const { t } = useLocale();
  const [rows, setRows] = useState<ScheduledPost[]>([]);
  useEffect(() => {
    let off = false;
    fetchMyScheduledPosts().then((r) => { if (!off) setRows(r); });
    return () => { off = true; };
  }, []);
  if (rows.length === 0) return null;
  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface p-3 shadow-hair">
      <p className="mb-2 flex items-center gap-1.5 px-1 text-detail font-semibold text-muted">
        <Icon name="clock" size={14} /> {t('Scheduled')}
      </p>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-xl px-1 py-2">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-detail text-ink">{r.title || r.body}</p>
            <p className="text-caption text-faint">
              {new Date(r.publishAt).toLocaleString(uiLocale(), { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void cancelScheduledPost(r.id); setRows((x) => x.filter((y) => y.id !== r.id)); }}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-caption font-semibold text-muted hover:text-ink"
          >
            {t('Cancel')}
          </button>
        </div>
      ))}
    </section>
  );
}
