import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/primitives';
import { StatTile, Avatar, fmtDate } from '../components/admin/panels';
import { useAuth } from '../lib/auth';
import { eur } from '../lib/format';
import { greeting } from '../components/DashboardShell';
import {
  fetchAllCarsAdmin,
  fetchAllBookingsAdmin,
  fetchAllUsers,
  fetchAllVerifications,
} from '../lib/data/admin';
import {
  fetchAllHosts,
  fetchPlatformBalance,
  fetchTotalRevenue,
  fetchActiveRentalsCount,
  fetchAuditLog,
  type AuditLogEntry,
} from '../lib/data/owner';
import { fetchOpenReportsCount } from '../lib/data/reports';
import type { AdminBooking, AdminUser } from '../lib/data/admin';
import type { OwnerHost } from '../lib/data/owner';

/**
 * `/dashboard` for the Owner account — see App.tsx's DashboardRouter. Not
 * the customer dashboard with a different header: this account doesn't
 * rent cars, so there is no "Find a car" / "My trips" / "Saved cars" here
 * at all. Everything below is a real number from a real table or, for
 * balance figures, a real Stripe API call — nothing here is invented to
 * fill a tile.
 */

const QUICK_ACTIONS: { label: string; icon: IconName; to: string }[] = [
  { label: 'Manage Hosts', icon: 'users', to: '/owner?tab=hosts' },
  { label: 'Manage Clients', icon: 'user', to: '/owner?tab=users' },
  { label: 'Manage Cars', icon: 'cars', to: '/owner?tab=vehicles' },
  { label: 'Manage Bookings', icon: 'trips', to: '/owner?tab=bookings' },
  { label: 'Payments & Balances', icon: 'wallet', to: '/owner?tab=bookings' },
  { label: 'Reports', icon: 'info', to: '/owner?tab=reports' },
  { label: 'Chat Monitor', icon: 'headset', to: '/owner?tab=monitor' },
  { label: 'Messages & Support', icon: 'message', to: '/messages' },
  { label: 'Platform Settings', icon: 'settings', to: '/owner?tab=settings' },
];

const actionLabel: Record<string, string> = {
  suspend_host: 'suspended a host',
  unsuspend_host: 'reinstated a host',
  remove_host: 'removed a host',
  edit_host_profile: 'edited a host profile',
  edit_vehicle: 'edited a vehicle',
  set_vehicle_status: 'changed a vehicle status',
  add_vehicle_photo: 'added a vehicle photo',
  delete_vehicle_photo: 'deleted a vehicle photo',
  set_cover_photo: 'set a cover photo',
  conversation_active: 'resumed a conversation',
  conversation_paused: 'paused a conversation',
  conversation_blocked: 'blocked a conversation',
  conversation_closed: 'closed a conversation',
  intervene_conversation: 'intervened in a conversation',
  update_platform_settings: 'updated platform settings',
};

export default function OwnerHome() {
  const { profile, signOut } = useAuth();
  const [stats, setStats] = useState<{
    hosts: number;
    clients: number;
    activeCars: number;
    totalBookings: number;
    activeRentals: number;
    pendingVerifications: number;
    openReports: number;
    revenue: number;
  } | null>(null);
  const [balance, setBalance] = useState<{ available: number; pending: number; currency: string } | null | undefined>(undefined);
  const [recentBookings, setRecentBookings] = useState<AdminBooking[]>([]);
  const [recentHosts, setRecentHosts] = useState<OwnerHost[]>([]);
  const [recentUsers, setRecentUsers] = useState<AdminUser[]>([]);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    // Each fetch degrades independently — a schema gap in one table (a
    // pending migration, say) must not blank out every other real number
    // this page has. See lib/data/admin.ts for which of these throw.
    Promise.all([
      fetchAllHosts().catch(() => []),
      fetchAllCarsAdmin().catch(() => []),
      fetchAllBookingsAdmin().catch(() => []),
      fetchAllUsers().catch(() => []),
      fetchAllVerifications().catch(() => []),
      fetchTotalRevenue().catch(() => 0),
      fetchActiveRentalsCount().catch(() => 0),
      fetchOpenReportsCount().catch(() => 0),
    ]).then(([hosts, cars, bookings, users, verifications, revenue, activeRentals, openReports]) => {
        setStats({
          hosts: hosts.length,
          // Excludes the Owner's own account — real signed-up
          // profile row, but not a "client" of the platform.
          clients: users.filter((u) => !u.isHost && u.id !== profile?.id).length,
          activeCars: cars.filter((c) => c.status === 'published').length,
          totalBookings: bookings.length,
          activeRentals,
          pendingVerifications: verifications.filter((v) => v.status === 'pending').length,
          openReports,
          revenue,
        });
        setRecentBookings(bookings.slice(0, 5));
        setRecentHosts(hosts.slice(0, 5));
        setRecentUsers(users.slice(0, 5));
      },
    );
    fetchPlatformBalance().then(setBalance);
    fetchAuditLog().then((log) => setActivity(log.slice(0, 6))).catch(() => setActivity([]));
  }, []);

  const handleSignOut = async () => {
    await signOut();
    window.location.assign('/');
  };

  return (
    <div className="min-h-dvh bg-bg">
      {/* pt-safe extends the noir background under the notch/Dynamic
          Island instead of the header's controls sitting under it —
          min-h (not h) so that extra top space adds to the bar's height
          rather than squeezing its 64px of actual content. */}
      <header className="flex min-h-16 items-center gap-4 border-b border-line bg-noir px-5 pt-safe">
        <Logo variant="symbol" />
        <div>
          <p className="flex items-center gap-1.5 font-display text-body font-semibold text-white">
            <Icon name="verified" size={16} className="text-accent-bright" /> Owner Control Center
          </p>
          <p className="text-caption text-white/50">{greeting()}, {profile?.full_name || 'Owner'}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/notifications" className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10" aria-label="Notifications">
            <Icon name="bell" size={17} />
          </Link>
          <Link to="/settings" className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10" aria-label="Settings">
            <Icon name="settings" size={17} />
          </Link>
          <button onClick={handleSignOut} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10" aria-label="Sign out">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </header>

      <div className="container-page py-6">
        {/* Financial summary — the one section given its own visual weight,
            since revenue/balance is the figure an owner checks first. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card bg-noir p-5 text-white">
            <p className="text-caption text-white/50">Total revenue</p>
            <p className="mt-1 font-display text-2xl font-semibold">{stats ? eur(stats.revenue) : '—'}</p>
            <p className="mt-1 text-caption text-white/40">All bookings, excluding cancelled trips</p>
          </div>
          <div className="card p-5">
            <p className="text-caption text-muted">Available balance</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {balance === undefined ? '—' : balance === null ? 'Unavailable' : eur(balance.available)}
            </p>
            <p className="mt-1 text-caption text-muted">{balance === null ? 'Stripe not configured' : 'Ready to withdraw, from Stripe'}</p>
          </div>
          <div className="card p-5">
            <p className="text-caption text-muted">Pending balance</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {balance === undefined ? '—' : balance === null ? 'Unavailable' : eur(balance.pending)}
            </p>
            <p className="mt-1 text-caption text-muted">Still settling, from Stripe</p>
          </div>
        </div>

        {/* Platform stats */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon="users" value={stats?.hosts ?? '—'} label="Total hosts" />
          <StatTile icon="user" value={stats?.clients ?? '—'} label="Total clients" />
          <StatTile icon="cars" value={stats?.activeCars ?? '—'} label="Active cars" />
          <StatTile icon="trips" value={stats?.totalBookings ?? '—'} label="Total bookings" />
          <StatTile icon="route" value={stats?.activeRentals ?? '—'} label="Active rentals" />
          <StatTile icon="verified" value={stats?.pendingVerifications ?? '—'} label="Pending verifications" />
          <StatTile icon="shield" value={stats?.openReports ?? '—'} label="Open reports" />
        </div>

        {/* Quick actions */}
        <div className="mt-8">
          <h2 className="mb-3 font-display text-body font-semibold text-ink">Quick actions</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {QUICK_ACTIONS.map((a) => (
              <Link key={a.label} to={a.to} className="card card-hover flex flex-col items-center gap-2 p-4 text-center hover:border-ink/20">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-panel text-ink-soft">
                  <Icon name={a.icon} size={18} />
                </span>
                <span className="text-detail font-medium text-ink">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Recent bookings / transactions */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-body font-semibold text-ink">Recent bookings</h2>
              <Link to="/owner?tab=bookings" className="text-detail font-medium text-muted hover:text-ink">View all</Link>
            </div>
            <div className="card divide-y divide-line">
              {recentBookings.length === 0 ? (
                <p className="p-5 text-detail text-muted">No bookings yet.</p>
              ) : (
                recentBookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-body font-medium text-ink">{b.carLabel}</p>
                      <p className="truncate text-caption text-muted">{b.reference} · {b.renterName} → {b.hostName}</p>
                    </div>
                    <span className="shrink-0 text-body font-medium text-ink">{eur(b.totalPrice)}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Recent hosts & clients */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-body font-semibold text-ink">Recent hosts &amp; clients</h2>
              <Link to="/owner?tab=hosts" className="text-detail font-medium text-muted hover:text-ink">View all</Link>
            </div>
            <div className="card divide-y divide-line">
              {[...recentHosts.map((h) => ({ id: h.id, name: h.fullName, avatar: h.avatarUrl, tag: 'Host', createdAt: h.createdAt })), ...recentUsers.filter((u) => !u.isHost && u.id !== profile?.id).slice(0, 3).map((u) => ({ id: u.id, name: u.fullName, avatar: u.avatarUrl, tag: 'Client', createdAt: u.createdAt }))]
                .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                .slice(0, 5)
                .map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3.5">
                    <Avatar url={p.avatar} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-ink">{p.name}</p>
                      <p className="text-caption text-muted">Joined {fmtDate(p.createdAt)}</p>
                    </div>
                    <span className={`badge ${p.tag === 'Host' ? 'bg-panel-2 text-ink-soft' : 'badge-accent'}`}>{p.tag}</span>
                  </div>
                ))}
            </div>
          </section>
        </div>

        {/* Platform activity */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-body font-semibold text-ink">Platform activity</h2>
            <Link to="/owner?tab=activity" className="text-detail font-medium text-muted hover:text-ink">View all</Link>
          </div>
          <div className="card divide-y divide-line">
            {activity.length === 0 ? (
              <p className="p-5 text-detail text-muted">No activity yet.</p>
            ) : (
              activity.map((e) => (
                <div key={e.id} className="flex items-center gap-3 p-3.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-panel text-muted"><Icon name="clock" size={14} /></span>
                  <p className="min-w-0 flex-1 truncate text-body text-ink">
                    <span className="font-medium">{e.actorName}</span> {actionLabel[e.action] ?? e.action}
                  </p>
                  <span className="shrink-0 text-caption text-muted">{new Date(e.createdAt).toLocaleDateString('en-GB')}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
