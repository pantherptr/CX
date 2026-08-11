import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardShell, StatCard } from '../components/DashboardShell';
import { Icon } from '../components/Icon';
import { carById } from '../data/cars';
import { hostStats, hostBookings, earnings } from '../data/content';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { useAuth } from '../lib/auth';

function EarningsChart({ data }: { data: { month: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { t: 20, r: 16, b: 30, l: 16 };
  const max = Math.max(...data.map((d) => d.value)) * 1.15;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * iw;
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ');
  const area = `${line} L ${x(data.length - 1)} ${pad.t + ih} L ${x(0)} ${pad.t + ih} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="earn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + ih * g} y2={pad.t + ih * g} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="3 4" />
        ))}
        <path d={area} fill="url(#earn)" />
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={i}>
            <rect x={x(i) - iw / data.length / 2} y={pad.t} width={iw / data.length} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
            <circle cx={x(i)} cy={y(d.value)} r={hover === i ? 5.5 : 3.5} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2.5" style={{ transition: 'r 0.15s' }} />
            <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-[var(--color-faint)]" style={{ fontSize: 11 }}>{d.month}</text>
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--color-line-strong)" strokeWidth="1" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute rounded-lg bg-ink px-2.5 py-1.5 text-white shadow-pop" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(data[hover].value) / H) * 100}%`, transform: 'translate(-50%, -130%)' }}>
          <p className="whitespace-nowrap text-[12px] font-semibold">{eur(data[hover].value)}</p>
          <p className="text-[10.5px] text-white/60">{data[hover].month} 2026</p>
        </div>
      )}
    </div>
  );
}

export default function HostDashboard() {
  const { profile, session } = useAuth();
  const firstName = (profile?.full_name || session?.user.email?.split('@')[0] || 'there').split(' ')[0];

  return (
    <DashboardShell variant="host" active="Overview">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[14px] text-muted">Good morning,</p>
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{firstName} 👋</h1>
          </div>
          <Link to="/list-your-car" className="btn btn-primary btn-sm"><Icon name="plus" size={16} /> Add a car</Link>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon="euro" label="Total earnings" value={eur(hostStats.totalEarnings)} accent />
          <StatCard icon="trending" label="This month" value={eur(hostStats.thisMonth)} trend="+12%" />
          <StatCard icon="cars" label="Active cars" value={String(hostStats.activeCars)} />
          <StatCard icon="star" label="Average rating" value={hostStats.rating.toFixed(2)} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* Earnings chart */}
          <section className="card scroll-mt-20 p-6" id="earnings">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Earnings</h2>
                <p className="text-[13px] text-muted">Last 8 months</p>
              </div>
              <div className="flex gap-1 rounded-lg border border-line p-0.5">
                {['6M', '1Y', 'All'].map((t, i) => (
                  <button key={t} className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium ${i === 0 ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>{t}</button>
                ))}
              </div>
            </div>
            <div className="mt-5">
              <div className="flex items-end gap-3">
                <span className="font-display text-3xl font-semibold text-ink">{eur(earnings.reduce((a, b) => a + b.value, 0))}</span>
                <span className="mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-accent"><Icon name="trending" size={15} /> +18% vs last year</span>
              </div>
            </div>
            <div className="mt-3"><EarningsChart data={earnings} /></div>
          </section>

          {/* Upcoming reservations */}
          <section className="card scroll-mt-20 p-6" id="bookings">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Upcoming</h2>
              <span className="badge badge-accent">{hostStats.upcoming} reservations</span>
            </div>
            <div className="space-y-1">
              {hostBookings.slice(0, 4).map((bk) => {
                const c = carById(bk.carId)!;
                return (
                  <div key={bk.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-panel/50">
                    <img src={bk.guestAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-ink">{bk.guest}</p>
                      <p className="truncate text-[12.5px] text-muted">{c.make} {c.model} · {bk.start}–{bk.end}</p>
                    </div>
                    <span className={`badge ${bk.status === 'pending' ? 'bg-[#fbf1dd] text-[#8a6316]' : 'badge-accent'}`}>{bk.status}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Recent bookings table */}
        <section className="mt-8 scroll-mt-20 card overflow-hidden" id="cars">
          <div className="flex items-center justify-between p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Recent bookings</h2>
            <button className="btn btn-secondary btn-sm">Export <Icon name="arrowUpRight" size={15} /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[14px]">
              <thead>
                <tr className="border-y border-line bg-panel/40 text-[12px] uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-semibold">Guest</th>
                  <th className="px-5 py-3 font-semibold">Car</th>
                  <th className="px-5 py-3 font-semibold">Dates</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {hostBookings.map((bk) => {
                  const c = carById(bk.carId)!;
                  return (
                    <tr key={bk.id} className="transition-colors hover:bg-panel/30">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <img src={bk.guestAvatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                          <span className="font-medium text-ink">{bk.guest}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-ink-soft">{c.make} {c.model}</td>
                      <td className="px-5 py-3.5 text-muted">{bk.start} – {bk.end}</td>
                      <td className="px-5 py-3.5">
                        <span className={`badge ${bk.status === 'pending' ? 'bg-[#fbf1dd] text-[#8a6316]' : bk.status === 'completed' ? 'bg-panel-2 text-ink-soft' : 'badge-accent'}`}>
                          {bk.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-ink">{eur(bk.payout)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* My cars */}
        <section className="mt-8">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">My cars</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {['car-1', 'car-3', 'car-10', 'car-15'].map((id) => {
              const c = carById(id)!;
              return (
                <div key={id} className="card overflow-hidden">
                  <div className="relative aspect-[16/10]">
                    <img src={unsplash(c.images[0], 500)} alt="" className="h-full w-full object-cover" />
                    <span className="absolute left-2.5 top-2.5 badge badge-glass"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Live</span>
                  </div>
                  <div className="p-4">
                    <p className="truncate text-[14px] font-medium text-ink">{c.make} {c.model}</p>
                    <div className="mt-1 flex items-center justify-between text-[13px]">
                      <span className="inline-flex items-center gap-1 text-muted"><Icon name="star" size={12} className="text-star" /> {c.rating.toFixed(2)}</span>
                      <span className="font-medium text-ink">{eur(c.pricePerDay)}/day</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
