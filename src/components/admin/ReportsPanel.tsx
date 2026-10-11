import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../lib/store';
import { fetchChatReports, setChatReportStatus, type ChatReport } from '../../lib/data/chatReports';

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Chat reports from members — Owner / Admin. Mark one reviewed once handled, or dismiss it. */
export function ReportsPanel() {
  const { toast } = useApp();
  const [rows, setRows] = useState<ChatReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const load = async () => {
    const r = await fetchChatReports();
    setRows(r.data);
    setError(r.error);
  };
  useEffect(() => { void load(); }, []);

  const mark = async (id: string, status: ChatReport['status']) => {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, status } : r)) ?? prev);
    const { error: err } = await setChatReportStatus(id, status);
    if (err) { toast({ title: 'Could not update', desc: err, icon: 'info' }); void load(); }
  };

  if (error) {
    return <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">{error} — run migration 0104 in Supabase if you have not yet.</p>;
  }
  if (!rows) return <p className="py-10 text-center text-detail text-muted">Loading…</p>;

  const shown = rows.filter((r) => filter === 'all' || r.status === 'open');
  const openCount = rows.filter((r) => r.status === 'open').length;

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lead font-semibold text-ink">Chat reports</h2>
          <p className="mt-1 text-detail text-muted">{openCount === 0 ? 'Nothing waiting for review.' : `${openCount} waiting for review.`}</p>
        </div>
        <div className="flex rounded-full bg-panel p-0.5 text-caption font-semibold">
          {(['open', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 capitalize ${filter === f ? 'bg-white text-ink shadow-hair' : 'text-muted'}`}>{f}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface px-4 py-10 text-center text-detail text-muted">No reports here.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-detail text-ink">
                  <span className="font-semibold">{r.reporter}</span> reported <span className="font-semibold text-danger">{r.reported}</span>
                </p>
                <span className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${r.status === 'open' ? 'bg-danger/10 text-danger' : 'bg-panel text-muted'}`}>{r.status}</span>
              </div>
              <p className="mt-0.5 text-caption text-faint">{fmt(r.createdAt)}</p>
              {(r.messageBody || r.messageHasPhoto) && (
                <p className="mt-2 rounded-xl bg-panel px-3 py-2 text-detail text-ink-soft">
                  {r.messageHasPhoto && <span className="mr-1.5 font-semibold">📷 Photo</span>}
                  {r.messageBody}
                </p>
              )}
              {r.reason && r.reason !== 'Reported message' && r.reason !== 'Reported user' && <p className="mt-2 text-detail text-muted">{r.reason}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/signal/profile/${r.reportedId}`} className="rounded-full bg-panel px-3 py-1.5 text-caption font-semibold text-ink">View profile</Link>
                {r.status === 'open' && (
                  <>
                    <button onClick={() => mark(r.id, 'reviewed')} className="rounded-full bg-ink px-3 py-1.5 text-caption font-semibold text-white">Mark reviewed</button>
                    <button onClick={() => mark(r.id, 'dismissed')} className="rounded-full px-3 py-1.5 text-caption font-semibold text-muted hover:bg-panel">Dismiss</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
