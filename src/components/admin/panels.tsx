import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';
import { EmptyState } from '../primitives';
import { useApp } from '../../lib/store';
import { eur } from '../../lib/format';
import { getSignedUrl } from '../../lib/data/verification';
import {
  fetchAllUsers,
  fetchAllVerifications,
  reviewVerification,
  fetchAllBookingsAdmin,
  adminCancelBooking,
  refundBookingAdmin,
  fetchAllCarsAdmin,
  adminSetCarStatus,
  type AdminUser,
  type AdminVerification,
  type AdminBooking,
  type AdminCar,
} from '../../lib/data/admin';

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
export function StatTile({ icon, value, label }: { icon: IconName; value: ReactNode; label: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-noir text-accent-bright">
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="font-display text-xl font-semibold leading-tight text-ink">{value}</p>
        <p className="text-caption text-muted">{label}</p>
      </div>
    </div>
  );
}

export const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function Avatar({ url, size = 36 }: { url: string | null; size?: number }) {
  if (url) return <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-panel text-ink-soft"
      style={{ width: size, height: size }}
    >
      <Icon name="user" size={size * 0.45} />
    </span>
  );
}

export function VerificationsPanel() {
  const { toast } = useApp();
  const [items, setItems] = useState<AdminVerification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setItems(null);
    fetchAllVerifications()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load verifications.'));
  };

  useEffect(load, []);

  const openDoc = async (path: string | null) => {
    if (!path) return;
    const url = await getSignedUrl('verification-documents', path);
    if (url) window.open(url, '_blank', 'noopener');
    else toast({ title: "Couldn't open this document", icon: 'info' });
  };

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setBusyId(id);
    const { error: err } = await reviewVerification(id, status);
    setBusyId(null);
    if (err) {
      toast({ title: 'Could not update this verification', desc: err, icon: 'info' });
      return;
    }
    toast({ title: status === 'approved' ? 'Verification approved' : 'Verification rejected', icon: 'checkCircle' });
    load();
  };

  if (error) return <div className="card"><EmptyState size="md" icon="info" title={error} className="p-10" /></div>;
  if (!items) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;
  if (items.length === 0) return <div className="card"><EmptyState size="md" icon="info" title="No identity verifications submitted yet." className="p-10" /></div>;

  return (
    <div className="flex flex-col gap-3">
      {items.map((v) => (
        <div key={v.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar url={v.userAvatar} />
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{v.userName}</p>
              <p className="text-caption text-muted">Submitted {fmtDate(v.submittedAt)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => openDoc(v.licencePhotoPath)} disabled={!v.licencePhotoPath} className="btn btn-secondary btn-sm disabled:opacity-40">
              <Icon name="camera" size={14} /> Licence
            </button>
            <button onClick={() => openDoc(v.selfiePath)} disabled={!v.selfiePath} className="btn btn-secondary btn-sm disabled:opacity-40">
              <Icon name="camera" size={14} /> Selfie
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {v.status === 'pending' ? (
              <>
                <button
                  onClick={() => decide(v.id, 'rejected')}
                  disabled={busyId === v.id}
                  className="btn btn-secondary btn-sm !text-danger disabled:opacity-50"
                >
                  <Icon name="x" size={14} /> Reject
                </button>
                <button
                  onClick={() => decide(v.id, 'approved')}
                  disabled={busyId === v.id}
                  className="btn btn-accent-bright btn-sm disabled:opacity-50"
                >
                  <Icon name="checkCircle" size={14} /> Approve
                </button>
              </>
            ) : (
              <span className={`badge ${v.status === 'approved' ? 'badge-accent' : 'bg-panel-2 text-ink-soft'}`}>
                {v.status === 'approved' ? <Icon name="checkCircle" size={12} /> : <Icon name="x" size={12} />}
                {v.status === 'approved' ? 'Approved' : 'Rejected'}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function UsersPanel() {
  const [items, setItems] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllUsers()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users.'));
  }, []);

  if (error) return <div className="card"><EmptyState size="md" icon="info" title={error} className="p-10" /></div>;
  if (!items) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;
  if (items.length === 0) return <div className="card"><EmptyState size="md" icon="info" title="No users yet." className="p-10" /></div>;

  return (
    <div className="flex flex-col gap-2">
      {items.map((u) => (
        <div key={u.id} className="card flex items-center gap-3 p-4">
          <Avatar url={u.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{u.fullName}</p>
            <p className="text-caption text-muted">Joined {fmtDate(u.createdAt)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {u.isAdmin && <span className="badge badge-accent"><Icon name="shield" size={12} /> Admin</span>}
            {u.isHost && <span className="badge bg-panel-2 text-ink-soft"><Icon name="cars" size={12} /> Host</span>}
          </div>
        </div>
      ))}
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
            </p>
            <p className="text-caption text-muted">
              {b.reference} · {b.renterName} → {b.hostName} · {fmtDate(b.startDate)}–{fmtDate(b.endDate)}
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
