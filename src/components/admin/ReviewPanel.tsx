import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { useApp } from '../../lib/store';
import { claimListing, decideListing, fetchReviewQueue, SEND_BACK_REASONS, type ReviewItem } from '../../lib/data/listingReview';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = new Date(to).getTime() - now;
  return (
    <span className={`tabular-nums font-semibold ${left < 60_000 ? 'text-danger' : 'text-ink'}`}>
      {left > 0 ? mmss(left) : 'going live…'}
    </span>
  );
}

/** Admin → Review: new listings wait here for 5 minutes. Open one to hold it, approve it or send it back. */
export function ReviewPanel() {
  const { toast } = useApp();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sendBack, setSendBack] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchReviewQueue();
    if (r.error) setError(r.error); else { setError(null); setItems(r.data); }
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(t);
  }, [load]);

  const open = (it: ReviewItem) => {
    setOpenId((cur) => (cur === it.carId ? null : it.carId));
    setRejectingId(null);
    // Opening a listing holds its automatic publishing while you look.
    void claimListing(it.carId).then(load);
  };

  const decide = async (it: ReviewItem, decision: 'approved' | 'rejected') => {
    const reason = [...sendBack, note.trim()].filter(Boolean).join('. ');
    setBusy(true);
    const { error: err } = await decideListing(it.carId, decision, reason);
    setBusy(false);
    if (err) { toast({ title: 'Could not save', desc: err, icon: 'info' }); return; }
    toast({ title: decision === 'approved' ? 'Live now' : 'Sent back to the host', desc: `${it.make} ${it.model}`, icon: 'checkCircle' });
    setOpenId(null); setRejectingId(null); setSendBack([]); setNote('');
    void load();
  };

  if (error) return <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">{error} — run migration 0108 in Supabase if you have not yet.</p>;
  if (!items) return <p className="py-10 text-center text-detail text-muted">Loading…</p>;

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-lead font-semibold text-ink">Listings to review</h2>
        <p className="mt-1 text-detail text-muted">
          {items.length === 0
            ? 'Nothing waiting. New listings appear here for 5 minutes, then go live on their own.'
            : `${items.length} waiting. If nobody opens one, it goes live when its timer ends.`}
        </p>
      </div>

      <ul className="space-y-3">
        {items.map((it) => {
          const isOpen = openId === it.carId;
          return (
            <li key={it.carId} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <button type="button" onClick={() => open(it)} className="flex w-full items-center gap-3 p-3 text-left active:bg-panel">
                {it.photos[0] ? <img src={it.photos[0]} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" /> : <span className="grid h-14 w-20 shrink-0 place-items-center rounded-xl bg-panel text-faint"><Icon name="car" size={20} /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{it.year} {it.make} {it.model}{it.trim ? ` · ${it.trim}` : ''}</span>
                  <span className="block truncate text-caption text-muted">{it.hostName} · {it.city}</span>
                  {it.claimedByName && <span className="block text-caption font-semibold text-accent">{it.claimedByName} is looking</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-caption text-muted">live in</span>
                  <Countdown to={it.publishAt} />
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-line p-4">
                  {it.photos.length === 0 ? (
                    <p className="rounded-xl bg-panel px-3 py-6 text-center text-detail text-muted">No photos.</p>
                  ) : (
                    <>
                      <p className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-muted">Cover — must be a side profile, nose left</p>
                      <img src={it.photos[0]} alt="" className="aspect-[16/10] w-full rounded-2xl object-cover" />
                      {it.photos.length > 1 && (
                        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                          {it.photos.slice(1).map((u) => <img key={u} src={u} alt="" className="aspect-square rounded-lg object-cover" />)}
                        </div>
                      )}
                    </>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-caption text-muted">
                    <Link to={`/signal/profile/${it.hostId}`} className="font-semibold text-ink underline-offset-2 hover:underline">{it.hostName}</Link>
                    <span>·</span>
                    <Link to={`/cars/${it.slug}`} className="underline-offset-2 hover:underline">Preview the listing</Link>
                  </div>

                  {rejectingId === it.carId ? (
                    <div className="mt-3 rounded-2xl border border-danger/25 bg-danger/[0.03] p-3">
                      <p className="text-caption font-semibold text-danger">What should the host fix? They receive this as a message from CX.</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {SEND_BACK_REASONS.map((r) => {
                          const on = sendBack.includes(r);
                          return (
                            <button key={r} type="button" onClick={() => setSendBack((p) => (on ? p.filter((x) => x !== r) : [...p, r]))}
                              className={`rounded-full px-3 py-1.5 text-caption font-semibold ${on ? 'bg-danger text-white' : 'bg-white text-ink ring-1 ring-line'}`}>{r}</button>
                          );
                        })}
                      </div>
                      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note (optional)" className="input mt-2 !text-[16px] sm:!text-body" />
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => setRejectingId(null)} className="btn btn-secondary btn-sm">Cancel</button>
                        <button onClick={() => decide(it, 'rejected')} disabled={busy || [...sendBack, note.trim()].filter(Boolean).join('').length < 3} className="btn btn-sm bg-danger text-white disabled:opacity-50">Send back</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => { setRejectingId(it.carId); setSendBack([]); setNote(''); }} disabled={busy} className="btn btn-secondary btn-sm !text-danger disabled:opacity-50"><Icon name="x" size={14} /> Send back…</button>
                      <button onClick={() => decide(it, 'approved')} disabled={busy} className="btn btn-accent-bright btn-sm disabled:opacity-50"><Icon name="checkCircle" size={14} /> Approve — live now</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
