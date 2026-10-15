import { monthBuckets } from '../../lib/monthBuckets';
import { MiniBars } from '../DashboardShell';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';
import { Img } from '../motion';
import { EmptyState } from '../primitives';
import { useApp } from '../../lib/store';
import { eur } from '../../lib/format';
import {
  fetchAllUsers,
  fetchUserAccess,
  type UserAccess,
  fetchAllBookingsAdmin,
  adminCancelBooking,
  refundBookingAdmin,
  fetchAllCarsAdmin,
  adminSetCarStatus,
  type AdminUser,
  type AdminBooking,
  type AdminCar,
} from '../../lib/data/admin';
import { setVerifiedClient, setUserAdmin } from '../../lib/data/owner';
import { fetchCreatorIds, setSignalPlan, fetchPlanConfig, savePlanConfig } from '../../lib/data/signalPlan';
import { PostActionMenu, type PostMenuItem } from '../signalFeed/PostActionMenu';
import { uiLocale } from '../../lib/i18n/uiLocale';

/**
 * Shared between AdminDashboard and OwnerDashboard — these panels (and
 * their data layer, lib/data/admin.ts) are exactly the same real
 * capability regardless of which dashboard renders them: the Owner is a
 * strict superset of Admin (see supabase/migrations/0021_owner_control_center.sql),
 * so duplicating this code per-dashboard would just be two copies to keep
 * in sync for zero benefit. Extracted from what was originally
 * AdminDashboard.tsx's own module-private code — no behavior changed.
 */

/** Shared by AdminDashboard/OwnerDashboard's Overview and the Owner's
 *  Home dashboard (OwnerHome.tsx) — one stat-tile look everywhere real
 *  numbers get surfaced. */
export { monthBuckets };

export function StatTile({
  icon, value, label, bars, barLabels,
}: { icon: IconName; value: ReactNode; label: string; bars?: number[]; barLabels?: string[] }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-noir text-accent-bright">
          <Icon name={icon} size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold leading-tight text-ink">{value}</p>
          <p className="text-caption text-muted">{label}</p>
        </div>
      </div>
      {bars && <MiniBars values={bars} labels={barLabels} accent />}
    </div>
  );
}

export const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function Avatar({ url, size = 36 }: { url: string | null; size?: number }) {
  const fallback = (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-panel text-ink-soft"
      style={{ width: size, height: size }}
    >
      <Icon name="user" size={size * 0.45} />
    </span>
  );
  if (url) {
    return (
      <Img
        src={url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        fallback={fallback}
      />
    );
  }
  return fallback;
}

export { VerificationsPanel } from './VerificationsPanel';

/** `canManageRoles` (the Owner's Users tab) adds a "⋯" menu per person: verify or
 *  un-verify them, make them admin or take it away. The plain admin dashboard
 *  keeps its single Verify button. */
function seenAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}


/** Owner / Admin: the free-plan limits of SIGNAL. Off by default: while it is off nobody is limited. */
function PlanLimitsCard() {
  const { toast } = useApp();
  const [cfg, setCfg] = useState<{ enforce: boolean; maxSeconds: number; perMonth: number } | null | undefined>(undefined);
  const [minutes, setMinutes] = useState('3');
  const [perMonth, setPerMonth] = useState('10');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchPlanConfig().then((c) => {
      setCfg(c);
      if (c) { setMinutes(String(Math.max(1, Math.round(c.maxSeconds / 60)))); setPerMonth(String(c.perMonth)); }
    });
  }, []);

  if (cfg === undefined) return null;
  if (cfg === null) {
    return <p className="rounded-xl bg-panel px-3.5 py-2.5 text-caption text-muted">SIGNAL plan limits: run migrations 0138 and 0139 in Supabase to manage them here.</p>;
  }

  const save = async (enforce: boolean) => {
    const m = Math.max(1, Math.round(Number(minutes) || 3));
    const n = Math.max(0, Math.round(Number(perMonth) || 0));
    setSaving(true);
    const { error } = await savePlanConfig({ enforce, maxSeconds: m * 60, perMonth: n });
    setSaving(false);
    if (error) { toast({ title: 'Could not save the limits', desc: error, icon: 'info' }); return; }
    setCfg({ enforce, maxSeconds: m * 60, perMonth: n });
    toast({ title: enforce ? 'Free-plan limits are ON' : 'Free-plan limits are off', icon: 'checkCircle' });
  };

  return (
    <div className="card mb-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">SIGNAL plan limits</p>
          <p className="text-caption text-muted">
            {cfg.enforce ? 'ON — free members are limited. Creators, hosts and the team are not.' : 'Off — nobody is limited. The numbers below apply when you switch it on.'}
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(!cfg.enforce)}
          className={`min-h-11 rounded-full px-5 text-detail font-semibold disabled:opacity-50 ${cfg.enforce ? 'bg-panel text-ink' : 'bg-ink text-white'}`}
        >
          {cfg.enforce ? 'Turn off' : 'Turn on'}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
        <label className="text-caption font-semibold text-muted">
          Longest video (minutes)
          <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" className="input mt-1" />
        </label>
        <label className="text-caption font-semibold text-muted">
          Videos per month
          <input value={perMonth} onChange={(e) => setPerMonth(e.target.value)} inputMode="numeric" className="input mt-1" />
        </label>
      </div>
      <button type="button" disabled={saving} onClick={() => void save(cfg.enforce)} className="mt-3 rounded-full bg-panel px-4 py-2 text-caption font-semibold text-ink disabled:opacity-50">
        Save numbers
      </button>
    </div>
  );
}

export function UsersPanel({ canManageRoles = false }: { canManageRoles?: boolean } = {}) {
  const { toast } = useApp();
  const [menu, setMenu] = useState<{ user: AdminUser; anchor: HTMLElement } | null>(null);
  const [items, setItems] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [access, setAccess] = useState<Map<string, UserAccess>>(new Map());
  const [creators, setCreators] = useState<Set<string>>(new Set());

  useEffect(() => {
    void fetchUserAccess().then(setAccess);
    fetchAllUsers()
      .then((rows) => {
        setItems(rows);
        void fetchCreatorIds(rows.map((r) => r.id)).then(setCreators);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users.'));
  }, []);

  const toggleVerifiedClient = async (u: AdminUser) => {
    setBusyId(u.id);
    const { error: err } = await setVerifiedClient(u.id, !u.isVerifiedClient, u.fullName);
    setBusyId(null);
    if (err) {
      toast({ title: 'Could not update Verified Client status', desc: err, icon: 'info' });
      return;
    }
    setItems((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, isVerifiedClient: !x.isVerifiedClient } : x)));
  };

  const toggleAdmin = async (u: AdminUser) => {
    setBusyId(u.id);
    const { error: err } = await setUserAdmin(u.id, !u.isAdmin);
    setBusyId(null);
    if (err) {
      toast({ title: 'Could not change admin', desc: err, icon: 'info' });
      return;
    }
    setItems((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, isAdmin: !x.isAdmin } : x)));
    toast({ title: u.isAdmin ? `${u.fullName} is no longer an admin` : `${u.fullName} is now an admin`, icon: 'checkCircle' });
  };

  const toggleCreator = async (u: AdminUser) => {
    const on = !creators.has(u.id);
    setBusyId(u.id);
    const { error: err } = await setSignalPlan(u.id, on ? 'creator' : 'free');
    setBusyId(null);
    if (err) {
      toast({ title: 'Could not change the Creator plan', desc: `${err} — run migration 0138 in Supabase if you have not yet.`, icon: 'info' });
      return;
    }
    setCreators((prev) => {
      const next = new Set(prev);
      if (on) next.add(u.id); else next.delete(u.id);
      return next;
    });
    toast({ title: on ? `${u.fullName} is now a Creator` : `${u.fullName} is no longer a Creator`, icon: 'checkCircle' });
  };

  const menuGroups = (u: AdminUser): PostMenuItem[][] => [
    [
      ...(!u.isHost && !u.isAdmin && !u.isOwner
        ? [{ icon: 'sparkles', label: creators.has(u.id) ? 'Remove Creator' : 'Make Creator', onClick: () => void toggleCreator(u) } as PostMenuItem]
        : []),
      { icon: 'verified', label: u.isVerifiedClient ? 'Remove verification' : 'Verify client', onClick: () => void toggleVerifiedClient(u) },
      ...(!u.isOwner
        ? [{ icon: 'shield', label: u.isAdmin ? 'Remove admin' : 'Make admin', onClick: () => void toggleAdmin(u), danger: u.isAdmin } as PostMenuItem]
        : []),
    ],
  ];

  if (error) return <div className="card"><EmptyState size="md" icon="info" title={error} className="p-10" /></div>;
  if (!items) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;
  if (items.length === 0) return <div className="card"><EmptyState size="md" icon="info" title="No users yet." className="p-10" /></div>;

  return (
    <div className="flex flex-col gap-2">
      <PlanLimitsCard />
      {items.map((u) => (
        <div key={u.id} className="card flex items-center gap-3 p-4">
          <Avatar url={u.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{u.fullName}</p>
            <p className="text-caption text-muted">Joined {fmtDate(u.createdAt)}</p>
            {(() => {
              const a = access.get(u.id);
              if (!a) return <p className="text-caption text-faint">Not seen yet</p>;
              return (
                <p className="text-caption text-muted" title={new Date(a.lastSeen).toLocaleString()}>
                  Last seen {seenAgo(a.lastSeen)} · {new Date(a.lastSeen).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {a.label ? ` · ${a.label}` : ''}{a.devices > 1 ? ` · ${a.devices} devices` : ''}
                </p>
              );
            })()}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {canManageRoles && creators.has(u.id) && <span className="badge bg-panel-2 text-ink-soft"><Icon name="sparkles" size={12} /> Creator</span>}
            {u.isAdmin && <span className="badge badge-accent"><Icon name="shield" size={12} /> Admin</span>}
            {u.isHost && <span className="badge bg-panel-2 text-ink-soft"><Icon name="cars" size={12} /> Host</span>}
            {canManageRoles ? (
              <>
                {u.isVerifiedClient && <span className="badge badge-accent"><Icon name="verified" size={12} /> Verified Client</span>}
                {!u.isOwner && (
                  <button
                    type="button"
                    onClick={(e) => setMenu({ user: u, anchor: e.currentTarget })}
                    disabled={busyId === u.id}
                    aria-label={`Actions for ${u.fullName}`}
                    aria-haspopup="menu"
                    className="grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel disabled:opacity-50"
                  >
                    <Icon name="moreHorizontal" size={18} />
                  </button>
                )}
              </>
            ) : (
              !u.isAdmin && (
                <>
                {!u.isHost && !u.isOwner && (
                  <button
                    onClick={() => toggleCreator(u)}
                    disabled={busyId === u.id}
                    className={`badge disabled:opacity-50 ${creators.has(u.id) ? 'badge-accent' : 'bg-panel-2 text-ink-soft hover:bg-panel'}`}
                    title={creators.has(u.id) ? 'Remove the SIGNAL Creator plan' : 'Give the SIGNAL Creator plan'}
                  >
                    <Icon name="sparkles" size={12} /> {creators.has(u.id) ? 'Creator' : 'Make Creator'}
                  </button>
                )}
                <button
                  onClick={() => toggleVerifiedClient(u)}
                  disabled={busyId === u.id}
                  className={`badge disabled:opacity-50 ${u.isVerifiedClient ? 'badge-accent' : 'bg-panel-2 text-ink-soft hover:bg-panel'}`}
                  title={u.isVerifiedClient ? 'Revoke Verified Client — lets them publish to Signal' : 'Grant Verified Client — lets them publish to Signal'}
                >
                  <Icon name="verified" size={12} /> {u.isVerifiedClient ? 'Verified Client' : 'Verify Client'}
                </button>
                </>
              )
            )}
          </div>
        </div>
      ))}
      {menu && <PostActionMenu anchor={menu.anchor} groups={menuGroups(menu.user)} onClose={() => setMenu(null)} />}
    </div>
  );
}

export const bookingStatusBadge: Record<AdminBooking['status'], string> = {
  pending: 'bg-panel-2 text-ink-soft',
  payment_processing: 'bg-panel-2 text-ink-soft',
  confirmed: 'badge-accent',
  completed: 'bg-panel-2 text-ink-soft',
  cancelled: 'bg-danger/10 text-danger',
  refunded: 'bg-danger/10 text-danger',
};

/** 'not_required' is intentionally omitted here — it's the common case
 *  (deposit-free bookings) and showing a badge for it would just be
 *  noise; see AdminBooking['depositStatus'] in lib/data/admin.ts. */
export const depositStatusBadge: Partial<Record<AdminBooking['depositStatus'], string>> = {
  held: 'bg-panel-2 text-ink-soft',
  failed: 'bg-danger/10 text-danger',
  released: 'badge-accent',
  captured: 'badge-accent',
};

export const depositStatusLabel: Partial<Record<AdminBooking['depositStatus'], string>> = {
  held: 'Deposit held',
  failed: 'Deposit failed',
  released: 'Deposit released',
  captured: 'Deposit captured',
};

export function BookingsPanel() {
  const { toast } = useApp();
  const [items, setItems] = useState<AdminBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setItems(null);
    fetchAllBookingsAdmin()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bookings.'));
  };

  useEffect(load, []);

  const cancel = async (id: string) => {
    setBusyId(id);
    const { error: err } = await adminCancelBooking(id);
    setBusyId(null);
    if (err) {
      toast({ title: 'Could not cancel this booking', desc: err, icon: 'info' });
      return;
    }
    toast({ title: 'Booking cancelled', icon: 'checkCircle' });
    load();
  };

  const refund = async (id: string) => {
    if (!window.confirm('Issue a real Stripe refund for this booking? This moves real money back to the renter.')) return;
    setBusyId(id);
    const { error: err } = await refundBookingAdmin(id);
    setBusyId(null);
    if (err) {
      toast({ title: 'Could not issue this refund', desc: err, icon: 'info' });
      return;
    }
    toast({ title: 'Refund issued', icon: 'checkCircle' });
    load();
  };

  if (error) return <div className="card"><EmptyState size="md" icon="info" title={error} className="p-10" /></div>;
  if (!items) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;
  if (items.length === 0) return <div className="card"><EmptyState size="md" icon="info" title="No bookings yet." className="p-10" /></div>;

  return (
    <div className="flex flex-col gap-2">
      {items.map((b) => (
        <div key={b.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-medium text-ink">
              {b.carLabel}
              <span className={`badge ${bookingStatusBadge[b.status]}`}>{b.status}</span>
              {depositStatusLabel[b.depositStatus] && (
                <span className={`badge ${depositStatusBadge[b.depositStatus]}`}>{depositStatusLabel[b.depositStatus]}</span>
              )}
              {b.fulfillmentType === 'delivery' && <span className="badge bg-panel-2 text-ink-soft">Delivery</span>}
              {b.handoverVerified && <span className="badge bg-accent-050 text-accent-700">Handover verified</span>}
            </p>
            <p className="text-caption text-muted">
              {b.reference} · {b.renterName} → {b.hostName} · {fmtDate(b.startDate)}–{fmtDate(b.endDate)}
              {b.fulfillmentType === 'delivery' && b.deliveryAddress ? ` · Deliver to ${b.deliveryAddress}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-body font-medium text-ink">{eur(b.totalPrice)}</span>
            {(b.status === 'pending' || b.status === 'payment_processing' || b.status === 'confirmed') && (
              <button
                onClick={() => cancel(b.id)}
                disabled={busyId === b.id}
                className="btn btn-secondary btn-sm !text-danger disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            {b.stripePaymentIntentId && b.status !== 'refunded' && (
              <button
                onClick={() => refund(b.id)}
                disabled={busyId === b.id}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                Refund
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CarsPanel() {
  const { toast } = useApp();
  const [items, setItems] = useState<AdminCar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setItems(null);
    fetchAllCarsAdmin()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load cars.'));
  };

  useEffect(load, []);

  const toggle = async (car: AdminCar) => {
    const next = car.status === 'published' ? 'draft' : 'published';
    setBusyId(car.id);
    const { error: err } = await adminSetCarStatus(car.id, next);
    setBusyId(null);
    if (err) {
      toast({ title: 'Could not update this listing', desc: err, icon: 'info' });
      return;
    }
    toast({ title: next === 'published' ? 'Listing published' : 'Listing pulled', icon: 'checkCircle' });
    load();
  };

  if (error) return <div className="card"><EmptyState size="md" icon="info" title={error} className="p-10" /></div>;
  if (!items) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;
  if (items.length === 0) return <div className="card"><EmptyState size="md" icon="info" title="No cars listed yet." className="p-10" /></div>;

  return (
    <div className="flex flex-col gap-2">
      {items.map((c) => (
        <div key={c.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-medium text-ink">
              <Link to={`/cars/${c.slug}`} target="_blank" className="hover:underline">{c.label}</Link>
              <span className={`badge ${c.status === 'published' ? 'badge-accent' : 'bg-panel-2 text-ink-soft'}`}>{c.status}</span>
            </p>
            <p className="text-caption text-muted">Hosted by {c.hostName} · {eur(c.pricePerDay)}/day</p>
          </div>
          <button
            onClick={() => toggle(c)}
            disabled={busyId === c.id}
            className="btn btn-secondary btn-sm shrink-0 disabled:opacity-50"
          >
            {c.status === 'published' ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      ))}
    </div>
  );
}

