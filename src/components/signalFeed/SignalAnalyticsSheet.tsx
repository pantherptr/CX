import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { fetchEmpireAnalytics, type EmpireAnalytics } from '../../lib/data/empireFeed';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-[20px] font-bold leading-none text-ink">{value}</p>
      <p className="mt-1 text-caption text-muted">{label}</p>
    </div>
  );
}

function TopPostRow({ label, item }: { label: string; item: { title: string; count: number } | null }) {
  if (!item) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="text-caption font-medium text-muted">{label}</p>
        <p className="truncate text-detail text-ink">{item.title}</p>
      </div>
      <span className="shrink-0 text-detail font-semibold text-accent-700">{item.count}</span>
    </div>
  );
}

/** A handful of compact numbers, not a dashboard — Owner/Admin only,
 *  reached from a discreet header icon rather than a separate admin
 *  route. One RPC round trip (fetch_empire_analytics), admin-gated
 *  server-side same as every other Signal write/read that matters. */
export function SignalAnalyticsSheet({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<EmpireAnalytics | 'error' | null>(null);

  useEffect(() => {
    fetchEmpireAnalytics().then(setData).catch(() => setData('error'));
  }, []);

  const trendDelta = data && data !== 'error' ? data.engagementLast7d - data.engagementPrev7d : 0;

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 animate-fade-in sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <Icon name="chart" size={18} className="text-ink-soft" />
          <span className="font-display font-semibold text-ink">Signal Analytics</span>
          <button onClick={onClose} aria-label="Close" className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
            <Icon name="x" size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {data === null ? (
            <div className="grid grid-cols-2 gap-2.5">
              {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
            </div>
          ) : data === 'error' ? (
            <p className="py-8 text-center text-detail text-muted">Couldn't load analytics right now.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <StatCard label="Total post views" value={data.totalPostViews} />
                <StatCard label="Total Story views" value={data.totalStoryViews} />
                <StatCard label="Posts this week" value={data.postsLast7d} />
                <StatCard
                  label="Engagement trend"
                  value={`${trendDelta >= 0 ? '+' : ''}${trendDelta}`}
                />
              </div>

              <div className="mt-5">
                <h3 className="mb-1 text-caption font-semibold uppercase tracking-wide text-muted">Top content</h3>
                <TopPostRow label="Most viewed" item={data.mostViewed} />
                <TopPostRow label="Most liked" item={data.mostLiked} />
                <TopPostRow label="Most commented" item={data.mostCommented} />
                <TopPostRow label="Most saved" item={data.mostSaved} />
                {!data.mostViewed && !data.mostLiked && !data.mostCommented && !data.mostSaved && (
                  <p className="py-6 text-center text-detail text-muted">No engagement yet.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
