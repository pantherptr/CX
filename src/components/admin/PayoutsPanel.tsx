import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { useApp } from '../../lib/store';
import { eur } from '../../lib/format';
import { fetchPayoutOverview, setHostCommissionPct, type PayoutOverview } from '../../lib/data/payouts';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** What CX earns from hosts and which payouts are stuck — Owner/Admin only (every RPC re-checks
 *  is_admin() on the server). Payouts leave the day after a trip ends; a host who has not finished
 *  the Stripe setup shows up under "Waiting for the host" and is paid automatically once they do. */
export function PayoutsPanel() {
  const { toast } = useApp();
  const [data, setData] = useState<PayoutOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r = await fetchPayoutOverview();
    setData(r.data);
    setError(r.error);
    if (r.data) setPct(String(r.data.commissionPct));
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    const n = Number(pct.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 50) { toast({ title: 'Enter a number from 0 to 50', icon: 'info' }); return; }
    setSaving(true);
    const { error: err } = await setHostCommissionPct(n);
    setSaving(false);
    if (err) { toast({ title: 'Could not save', desc: err, icon: 'info' }); return; }
    toast({ title: `Host commission is now ${n}%`, desc: 'It applies to the next payouts.', icon: 'check' });
    void load();
  };

  if (error) {
    return (
      <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">
        {error} — run migrations 0102 and 0103 in Supabase if you have not yet.
      </p>
    );
  }
  if (!data) return <p className="py-10 text-center text-detail text-muted">Loading…</p>;

  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-caption text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-caption text-faint">{sub}</p>}
    </div>
  );

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-lead font-semibold text-ink">Host payouts</h2>
        <p className="mt-1 text-detail text-muted">
          The renter pays CX; the day after a trip ends the host gets the rental price minus your commission, sent to their bank through Stripe.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat('Commission earned', eur(data.commission), `${eur(data.commission30d)} in the last 30 days`)}
        {stat('Paid to hosts', eur(data.net), `${data.paidCount} trips`)}
        {stat('Gross rental value', eur(data.gross))}
        {stat('Waiting to be paid', eur(data.pendingAmount), `${data.pendingCount} trips (before commission)`)}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel/60 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-detail font-semibold text-ink">Host commission</p>
          <p className="text-caption text-muted">Kept by CX out of the rental price, on top of the renter's 12% service fee. Applies to payouts from now on.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            inputMode="decimal"
            aria-label="Host commission percent"
            className="input !w-20 !py-2 text-center"
          />
          <span className="text-detail font-semibold text-ink-soft">%</span>
          <button type="button" onClick={() => void save()} disabled={saving || pct === String(data.commissionPct)} className="btn btn-primary btn-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <h3 className="mb-2 mt-6 text-detail font-semibold uppercase tracking-wide text-faint">Waiting for the host / failed</h3>
      {data.stuck.length === 0 ? (
        <p className="rounded-2xl bg-panel/60 px-4 py-3 text-detail text-muted">Nothing is stuck.</p>
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line">
          {data.stuck.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p translate="no" className="truncate text-detail font-medium text-ink">{s.hostName} · {s.reference ?? 'Trip'}</p>
                <p className="text-caption text-muted">
                  Trip ended {fmt(s.endDate)} ·{' '}
                  {s.status === 'failed'
                    ? 'the transfer failed — it is retried on the next run'
                    : s.onboardingStarted && !s.payoutsEnabled
                      ? 'Stripe is still verifying their account'
                      : 'the host has not set up payouts yet'}
                </p>
              </div>
              <span className={`badge shrink-0 ${s.status === 'failed' ? 'bg-danger/10 text-danger' : ''}`}>{s.status === 'failed' ? 'Failed' : 'Waiting'}</span>
              <p className="shrink-0 font-display text-body font-semibold text-ink">{eur(s.amount)}</p>
            </div>
          ))}
        </div>
      )}

      <h3 className="mb-2 mt-6 text-detail font-semibold uppercase tracking-wide text-faint">Latest payouts</h3>
      {data.recent.length === 0 ? (
        <p className="rounded-2xl bg-panel/60 px-4 py-3 text-detail text-muted">No payout has been sent yet.</p>
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line">
          {data.recent.map((r) => (
            <div key={r.bookingId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p translate="no" className="truncate text-detail font-medium text-ink">{r.hostName} · {r.reference ?? 'Trip'}</p>
                <p className="text-caption text-muted">{eur(r.gross)} − {eur(r.commission)} commission · {fmt(r.paidAt)}</p>
              </div>
              <p className="shrink-0 font-display text-body font-semibold text-ink">{eur(r.net)}</p>
            </div>
          ))}
        </div>
      )}

      <p className="mt-5 flex items-start gap-2 text-caption text-faint">
        <Icon name="info" size={13} className="mt-0.5 shrink-0" />
        The daily run is at 08:00; a stuck payout is retried every day until the host finishes their Stripe setup.
      </p>
    </div>
  );
}
