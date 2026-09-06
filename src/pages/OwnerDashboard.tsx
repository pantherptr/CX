import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { Logo, Modal, EmptyState, VerifiedBadge, RoleLabel, type VerifiedRole } from '../components/primitives';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../lib/auth';
import { useApp } from '../lib/store';
import { eur } from '../lib/format';
import { findOrCreateConversation, sendMessage, fetchMessages, type Message } from '../lib/data/messages';
import {
  fetchAllConversationsForMonitor,
  setConversationStatus,
  intervene,
  type MonitorConversation,
  type ConversationStatus,
} from '../lib/data/monitor';
import { VerificationsPanel, UsersPanel, BookingsPanel, Avatar, fmtDate, StatTile } from '../components/admin/panels';
import {
  fetchAllUsers,
  fetchAllBookingsAdmin,
  fetchAllCarsAdmin,
  type AdminCar,
} from '../lib/data/admin';
import {
  fetchAllHosts,
  setHostSuspended,
  updateHostProfile,
  removeHost,
  fetchCarDetail,
  updateCarAsOwner,
  setCarStatusAsOwner,
  fetchCarImages,
  addCarImageAsOwner,
  deleteCarImage,
  moveCarImage,
  setCoverPhoto,
  fetchAuditLog,
  fetchNeedsAttention,
  searchPlatform,
  type OwnerHost,
  type OwnerCarDetail,
  type OwnerCarImage,
  type AuditLogEntry,
  type AttentionItem,
  type OwnerSearchResult,
} from '../lib/data/owner';
import {
  usePlatformSettings,
  updatePlatformSettings,
  fetchOwnerNotes,
  createOwnerNote,
  setOwnerNoteDone,
  deleteOwnerNote,
  type OwnerNote,
} from '../lib/data/platform';
import { fetchReports, resolveReport, createConversationReport, type OwnerReport } from '../lib/data/reports';

/**
 * The Owner's private control center — distinct from /admin (see
 * supabase/migrations/0021_owner_control_center.sql for why: is_owner is
 * a strict superset of is_admin, held by exactly one hardcoded account).
 * Reuses AdminDashboard's own panels (components/admin/panels.tsx) for
 * the capabilities that are identical either way — bookings, users,
 * verifications — and adds the ones that go further: full host
 * management, full vehicle editing (not just publish/unpublish), and a
 * real audit trail of every privileged action taken here.
 */

export type OwnerTab =
  | 'overview'
  | 'hosts'
  | 'vehicles'
  | 'bookings'
  | 'users'
  | 'verifications'
  | 'reports'
  | 'monitor'
  | 'activity'
  | 'notes'
  | 'security'
  | 'settings';
type Tab = OwnerTab;

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'hosts', label: 'Hosts', icon: 'users' },
  { id: 'vehicles', label: 'Vehicles', icon: 'cars' },
  { id: 'bookings', label: 'Bookings', icon: 'trips' },
  { id: 'users', label: 'Users', icon: 'user' },
  { id: 'verifications', label: 'Verifications', icon: 'shield' },
  { id: 'reports', label: 'Reports', icon: 'info' },
  { id: 'monitor', label: 'Chat Monitor', icon: 'headset' },
  { id: 'activity', label: 'Activity', icon: 'clock' },
  { id: 'notes', label: 'Notes', icon: 'sparkles' },
  { id: 'security', label: 'Security', icon: 'lock' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const VALID_TABS: Tab[] = TABS.map((t) => t.id);

const attentionTone: Record<AttentionItem['tone'], string> = {
  danger: 'bg-danger/10 text-danger',
  warn: 'bg-[#f5a524]/15 text-[#a86400]',
  info: 'bg-panel-2 text-ink-soft',
};

function OverviewPanel({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [stats, setStats] = useState<{ hosts: number; vehicles: number; bookings: number; users: number } | null>(null);
  const [attention, setAttention] = useState<AttentionItem[] | null>(null);

  useEffect(() => {
    // Each fetch degrades independently — a schema gap in one table must
    // not blank out every other real number on this page.
    Promise.all([
      fetchAllHosts().catch(() => []),
      fetchAllCarsAdmin().catch(() => []),
      fetchAllBookingsAdmin().catch(() => []),
      fetchAllUsers().catch(() => []),
    ]).then(([hosts, cars, bookings, users]) => setStats({ hosts: hosts.length, vehicles: cars.length, bookings: bookings.length, users: users.length }));
    fetchNeedsAttention().then(setAttention).catch(() => setAttention([]));
  }, []);
  if (!stats) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon="users" value={stats.hosts} label="Hosts" />
        <StatTile icon="cars" value={stats.vehicles} label="Vehicles" />
        <StatTile icon="trips" value={stats.bookings} label="Bookings" />
        <StatTile icon="user" value={stats.users} label="Platform users" />
      </div>

      <div>
        <h2 className="mb-3 font-display text-body font-semibold text-ink">Needs attention</h2>
        {attention === null ? (
          <div className="card"><EmptyState size="sm" icon="info" title="Checking…" className="py-6" /></div>
        ) : attention.length === 0 ? (
          <div className="card"><EmptyState size="sm" icon="checkCircle" title="Nothing needs your attention right now." className="py-6" /></div>
        ) : (
          <div className="flex flex-col gap-2">
            {attention.map((a) => (
              <button
                key={a.id}
                onClick={() => onNavigate(a.tab)}
                className="card flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-panel/40"
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-detail font-semibold ${attentionTone[a.tone]}`}>{a.count}</span>
                <span className="flex-1 text-body text-ink">{a.label}</span>
                <Icon name="chevronRight" size={16} className="text-faint" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditHostModal({ host, onClose, onSaved }: { host: OwnerHost; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [fullName, setFullName] = useState(host.fullName);
  const [phone, setPhone] = useState(host.phone ?? '');
  const [location, setLocation] = useState(host.location ?? '');
  const [bio, setBio] = useState(host.bio ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await updateHostProfile(host.id, { fullName, phone, location, bio });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save changes", desc: error, icon: 'info' });
      return;
    }
    toast({ title: 'Host profile updated', icon: 'checkCircle' });
    onSaved();
    onClose();
  };

  return (
    <Modal open onClose={onClose} className="max-w-md rounded-2xl p-6" labelledBy="edit-host-title">
      <h2 id="edit-host-title" className="font-display text-lg font-semibold text-ink">Edit host profile</h2>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">
          Full name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="input resize-none" />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
        <button onClick={save} disabled={saving} className="btn btn-primary btn-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}

function HostsPanel() {
  const { toast } = useApp();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<OwnerHost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<OwnerHost | null>(null);
  const [removing, setRemoving] = useState<OwnerHost | null>(null);

  const load = () => {
    setItems(null);
    fetchAllHosts()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load hosts.'));
  };

  useEffect(load, []);

  const toggleSuspend = async (host: OwnerHost) => {
    setBusyId(host.id);
    const { error: err } = await setHostSuspended(host.id, !host.suspended, host.fullName);
    setBusyId(null);
    if (err) {
      toast({ title: 'Could not update this host', desc: err, icon: 'info' });
      return;
    }
    toast({ title: host.suspended ? 'Host reinstated' : 'Host suspended', icon: 'checkCircle' });
    load();
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const { error: err } = await removeHost(removing.id, removing.fullName);
    if (err) {
      toast({ title: 'Could not remove this host', desc: err, icon: 'info' });
      return;
    }
    toast({ title: 'Host removed', icon: 'checkCircle' });
    load();
  };

  const message = async (host: OwnerHost) => {
    if (!session) return;
    try {
      const conversationId = await findOrCreateConversation(null, session.user.id, host.id);
      navigate(`/messages?c=${conversationId}`);
    } catch {
      toast({ title: "Couldn't start a conversation", icon: 'info' });
    }
  };

  if (error) return <div className="card"><EmptyState size="md" icon="info" title={error} className="p-10" /></div>;
  if (!items) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;
  if (items.length === 0) return <div className="card"><EmptyState size="md" icon="users" title="No hosts yet." className="p-10" /></div>;

  return (
    <>
      <div className="flex flex-col gap-2">
        {items.map((h) => (
          <div key={h.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar url={h.avatarUrl} />
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-medium text-ink">
                  {h.fullName}
                  {h.suspended && <span className="badge bg-danger/10 text-danger">Suspended</span>}
                </p>
                <p className="truncate text-caption text-muted">
                  {h.carCount} {h.carCount === 1 ? 'listing' : 'listings'} · Joined {fmtDate(h.createdAt)}
                  {h.location ? ` · ${h.location}` : ''}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <button onClick={() => message(h)} className="btn btn-secondary btn-sm"><Icon name="message" size={14} /> Message</button>
              <button onClick={() => setEditing(h)} className="btn btn-secondary btn-sm">Edit</button>
              <button
                onClick={() => toggleSuspend(h)}
                disabled={busyId === h.id}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                {h.suspended ? 'Reinstate' : 'Suspend'}
              </button>
              <button
                onClick={() => setRemoving(h)}
                className="btn btn-secondary btn-sm !text-danger"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing && <EditHostModal host={editing} onClose={() => setEditing(null)} onSaved={load} />}
      {removing && (
        <ConfirmModal
          open
          onClose={() => setRemoving(null)}
          onConfirm={confirmRemove}
          title={`Remove ${removing.fullName}?`}
          description="Their listings will be delisted and their account suspended. Nothing is deleted — this can be reversed from this same panel."
          confirmLabel="Remove host"
        />
      )}
    </>
  );
}

const VEHICLE_STATUSES: OwnerCarDetail['status'][] = ['draft', 'published', 'suspended', 'removed'];
const vehicleStatusBadge: Record<OwnerCarDetail['status'], string> = {
  draft: 'bg-panel-2 text-ink-soft',
  published: 'badge-accent',
  suspended: 'bg-[#f5a524]/15 text-[#a86400]',
  removed: 'bg-danger/10 text-danger',
};

function ManageVehicleModal({ carId, onClose, onSaved }: { carId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const { session } = useAuth();
  const [car, setCar] = useState<OwnerCarDetail | null>(null);
  const [images, setImages] = useState<OwnerCarImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    Promise.all([fetchCarDetail(carId), fetchCarImages(carId)]).then(([c, imgs]) => {
      setCar(c);
      setImages(imgs);
    });
  };

  useEffect(load, [carId]);

  if (!car) {
    return (
      <Modal open onClose={onClose} className="max-w-lg rounded-2xl p-6">
        <EmptyState size="md" icon="info" title="Loading…" />
      </Modal>
    );
  }

  const patch = (field: keyof OwnerCarDetail, value: string | number | boolean) => setCar({ ...car, [field]: value } as OwnerCarDetail);

  const save = async () => {
    setSaving(true);
    const { error } = await updateCarAsOwner(car.id, {
      make: car.make,
      model: car.model,
      trim: car.trim,
      year: car.year,
      pricePerDay: car.pricePerDay,
      city: car.city,
      location: car.location,
      description: car.description,
      instantBook: car.instantBook,
      seats: car.seats,
      doors: car.doors,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save changes", desc: error, icon: 'info' });
      return;
    }
    toast({ title: 'Vehicle updated', icon: 'checkCircle' });
    onSaved();
  };

  const changeStatus = async (status: OwnerCarDetail['status']) => {
    const { error } = await setCarStatusAsOwner(car.id, status);
    if (error) {
      toast({ title: "Couldn't change status", desc: error, icon: 'info' });
      return;
    }
    setCar({ ...car, status });
    toast({ title: `Vehicle marked ${status}`, icon: 'checkCircle' });
    onSaved();
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session) return;
    setUploading(true);
    const { error } = await addCarImageAsOwner(session.user.id, car.id, file);
    setUploading(false);
    if (error) {
      toast({ title: 'Upload failed', desc: error, icon: 'info' });
      return;
    }
    load();
  };

  return (
    <Modal open onClose={onClose} className="max-h-[90dvh] max-w-2xl overflow-y-auto overscroll-contain rounded-2xl pt-6 pr-6 pl-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]" labelledBy="manage-vehicle-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="manage-vehicle-title" className="font-display text-lg font-semibold text-ink">
          {car.make} {car.model} · {car.hostName}
        </h2>
        <Link to={`/cars/${car.slug}`} target="_blank" className="text-detail font-medium text-muted hover:text-ink">View listing ↗</Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {VEHICLE_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => changeStatus(s)}
            className={`badge capitalize transition-opacity ${vehicleStatusBadge[s]} ${car.status === s ? '' : 'opacity-40 hover:opacity-70'}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">Make
          <input value={car.make} onChange={(e) => patch('make', e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">Model
          <input value={car.model} onChange={(e) => patch('model', e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">Year
          <input type="number" value={car.year} onChange={(e) => patch('year', Number(e.target.value))} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">Price / day (€)
          <input type="number" value={car.pricePerDay} onChange={(e) => patch('pricePerDay', Number(e.target.value))} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">Seats
          <input type="number" value={car.seats} onChange={(e) => patch('seats', Number(e.target.value))} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">Doors
          <input type="number" value={car.doors} onChange={(e) => patch('doors', Number(e.target.value))} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">City
          <input value={car.city} onChange={(e) => patch('city', e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-detail font-medium text-ink-soft">Neighbourhood
          <input value={car.location} onChange={(e) => patch('location', e.target.value)} className="input" />
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-1.5 text-detail font-medium text-ink-soft">Description
        <textarea value={car.description ?? ''} onChange={(e) => patch('description', e.target.value)} rows={3} className="input resize-none" />
      </label>
      <label className="mt-3 flex items-center gap-2 text-detail font-medium text-ink-soft">
        <input type="checkbox" checked={car.instantBook} onChange={(e) => patch('instantBook', e.target.checked)} />
        Instant book
      </label>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-detail font-medium text-ink-soft">Photos</p>
          <label className="btn btn-secondary btn-sm cursor-pointer">
            <Icon name="upload" size={14} /> {uploading ? 'Uploading…' : 'Add photo'}
            <input type="file" accept="image/*" onChange={onUpload} disabled={uploading} className="hidden" />
          </label>
        </div>
        {images.length === 0 ? (
          <EmptyState size="sm" icon="camera" title="No photos yet" className="py-6" />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((img, i) => (
              <div key={img.id} className="group relative overflow-hidden rounded-lg border border-line">
                <img src={img.url} alt="" className="aspect-square w-full object-cover" />
                {i === 0 && <span className="absolute left-1 top-1 badge badge-accent">Cover</span>}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-ink/70 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {i > 0 && (
                    <button onClick={() => setCoverPhoto(car.id, img.id).then(load)} title="Set as cover" className="grid h-6 w-6 place-items-center rounded text-white hover:bg-white/20">
                      <Icon name="star" size={13} />
                    </button>
                  )}
                  {i > 0 && (
                    <button onClick={() => moveCarImage(car.id, img.id, 'up').then(load)} title="Move left" className="grid h-6 w-6 place-items-center rounded text-white hover:bg-white/20">
                      <Icon name="chevronLeft" size={13} />
                    </button>
                  )}
                  {i < images.length - 1 && (
                    <button onClick={() => moveCarImage(car.id, img.id, 'down').then(load)} title="Move right" className="grid h-6 w-6 place-items-center rounded text-white hover:bg-white/20">
                      <Icon name="chevronRight" size={13} />
                    </button>
                  )}
                  <button onClick={() => deleteCarImage(car.id, img).then(load)} title="Delete" className="grid h-6 w-6 place-items-center rounded text-white hover:bg-danger/60">
                    <Icon name="x" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
        <button onClick={onClose} className="btn btn-secondary btn-sm">Close</button>
        <button onClick={save} disabled={saving} className="btn btn-primary btn-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}

function VehiclesPanel({ initialManagingId }: { initialManagingId?: string | null }) {
  const [items, setItems] = useState<AdminCar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(initialManagingId ?? null);

  const load = () => {
    setItems(null);
    fetchAllCarsAdmin()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load vehicles.'));
  };

  useEffect(load, []);

  if (error) return <div className="card"><EmptyState size="md" icon="info" title={error} className="p-10" /></div>;
  if (!items) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;
  if (items.length === 0) return <div className="card"><EmptyState size="md" icon="cars" title="No vehicles listed yet." className="p-10" /></div>;

  return (
    <>
      <div className="flex flex-col gap-2">
        {items.map((c) => (
          <div key={c.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate font-medium text-ink">
                {c.label}
                <span className={`badge capitalize ${vehicleStatusBadge[c.status as OwnerCarDetail['status']] ?? 'bg-panel-2 text-ink-soft'}`}>{c.status}</span>
              </p>
              <p className="text-caption text-muted">Hosted by {c.hostName} · {eur(c.pricePerDay)}/day</p>
            </div>
            <button onClick={() => setManagingId(c.id)} className="btn btn-secondary btn-sm shrink-0">
              Manage
            </button>
          </div>
        ))}
      </div>
      {managingId && <ManageVehicleModal carId={managingId} onClose={() => setManagingId(null)} onSaved={load} />}
    </>
  );
}

function ReportsPanel() {
  const { toast } = useApp();
  const [items, setItems] = useState<OwnerReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setItems(null);
    fetchReports()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reports.'));
  };

  useEffect(load, []);

  const resolve = async (id: string) => {
    setBusyId(id);
    const { error: err } = await resolveReport(id);
    setBusyId(null);
    if (err) {
      toast({ title: "Couldn't resolve this report", desc: err, icon: 'info' });
      return;
    }
    toast({ title: 'Report resolved', icon: 'checkCircle' });
    load();
  };

  if (error) return <div className="card"><EmptyState size="md" icon="info" title={error} className="p-10" /></div>;
  if (!items) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;
  if (items.length === 0) return <div className="card"><EmptyState size="md" icon="checkCircle" title="No reports filed." description="When a user reports a listing, it shows up here." className="p-10" /></div>;

  return (
    <div className="flex flex-col gap-2">
      {items.map((r) => (
        <div key={r.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-medium text-ink">
              {r.reason}
              <span className={`badge ${r.status === 'open' ? 'bg-[#f5a524]/15 text-[#a86400]' : 'bg-panel-2 text-ink-soft'}`}>{r.status}</span>
            </p>
            <p className="truncate text-caption text-muted">
              {r.reporterName} · {r.carLabel ?? 'Unknown listing'} · {fmtDate(r.createdAt)}
            </p>
            {r.message && <p className="mt-1 text-detail text-ink-soft">{r.message}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {r.carSlug && <Link to={`/cars/${r.carSlug}`} target="_blank" className="text-detail font-medium text-muted hover:text-ink">View listing ↗</Link>}
            {r.status === 'open' && (
              <button onClick={() => resolve(r.id)} disabled={busyId === r.id} className="btn btn-secondary btn-sm disabled:opacity-50">
                Mark resolved
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const CONVERSATION_STATUS_BADGE: Record<ConversationStatus, string> = {
  active: 'badge-accent',
  paused: 'bg-[#f5a524]/15 text-[#a86400]',
  blocked: 'bg-danger/10 text-danger',
  closed: 'bg-panel-2 text-ink-soft',
};

function ConversationMonitorModal({ conv, onClose, onChanged }: { conv: MonitorConversation; onClose: () => void; onChanged: () => void }) {
  const { toast } = useApp();
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [sendAsRole, setSendAsRole] = useState<'owner' | 'owner_assistant'>('owner');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Dispute between host and client');
  const [reportMessage, setReportMessage] = useState('');

  const load = () => {
    fetchMessages(conv.id).then(setMessages);
  };
  useEffect(load, [conv.id]);

  const roleFor = (senderId: string, senderRole: Message['senderRole']): VerifiedRole => {
    if (senderRole) return senderRole;
    return conv.participants.find((p) => p.id === senderId)?.role ?? 'client';
  };

  const changeStatus = async (status: ConversationStatus) => {
    setBusy(true);
    const { error } = await setConversationStatus(conv.id, status);
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't update this conversation", desc: error, icon: 'info' });
      return;
    }
    toast({ title: `Conversation ${status}`, icon: 'checkCircle' });
    onChanged();
  };

  const doIntervene = async () => {
    if (!session) return;
    setBusy(true);
    const { error } = await intervene(conv.id, session.user.id);
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't intervene", desc: error, icon: 'info' });
      return;
    }
    toast({ title: 'You are now visible in this conversation', icon: 'checkCircle' });
    onChanged();
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !session) return;
    setSending(true);
    if (!conv.ownerIntervened) await intervene(conv.id, session.user.id);
    const { error } = await sendMessage(conv.id, session.user.id, body, sendAsRole);
    setSending(false);
    if (error) {
      toast({ title: "Couldn't send", desc: error, icon: 'info' });
      return;
    }
    setText('');
    load();
    onChanged();
  };

  const submitReport = async () => {
    const { error } = await createConversationReport(conv.id, reportReason, reportMessage);
    if (error) {
      toast({ title: "Couldn't file report", desc: error, icon: 'info' });
      return;
    }
    toast({ title: 'Report filed', icon: 'checkCircle' });
    setReportOpen(false);
  };

  return (
    <Modal open onClose={onClose} className="flex h-[85dvh] max-w-2xl flex-col overflow-hidden rounded-2xl" labelledBy="monitor-title">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line p-4">
        <div className="min-w-0">
          <h2 id="monitor-title" className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-body font-semibold text-ink">
            {conv.participants.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1">
                {p.name} <VerifiedBadge role={p.role} size={13} />
              </span>
            ))}
          </h2>
          <p className="mt-0.5 flex items-center gap-2 text-caption text-muted">
            {conv.carLabel && <span>{conv.carLabel}</span>}
            <span className={`badge ${CONVERSATION_STATUS_BADGE[conv.status]}`}>{conv.status}</span>
            {conv.ownerIntervened && <span className="badge bg-danger/10 text-danger">Owner intervened</span>}
          </p>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-panel"><Icon name="x" size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {messages === null ? (
          <EmptyState size="sm" icon="info" title="Loading…" />
        ) : messages.length === 0 ? (
          <EmptyState size="sm" icon="message" title="No messages yet" />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => {
              const role = roleFor(m.senderId, m.senderRole);
              const senderName = conv.participants.find((p) => p.id === m.senderId)?.name ?? (role === 'owner' || role === 'owner_assistant' ? 'You' : 'Unknown');
              return (
                <div key={m.id}>
                  <RoleLabel role={role} />
                  <p className="-mt-1 text-caption text-faint">{senderName}</p>
                  <div className="mt-1 max-w-[85%] rounded-2xl border border-line bg-surface px-3.5 py-2 text-body text-ink">{m.body}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line pt-3 pr-3 pl-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <button onClick={doIntervene} disabled={busy || conv.ownerIntervened} className="btn btn-secondary btn-sm disabled:opacity-40">
            <Icon name="verified" size={14} /> {conv.ownerIntervened ? 'Intervened' : 'Intervene'}
          </button>
          {conv.status !== 'paused' && (
            <button onClick={() => changeStatus('paused')} disabled={busy} className="btn btn-secondary btn-sm">Pause chat</button>
          )}
          {conv.status !== 'blocked' && (
            <button onClick={() => changeStatus('blocked')} disabled={busy} className="btn btn-secondary btn-sm !text-danger">Block chat</button>
          )}
          {conv.status !== 'active' && (
            <button onClick={() => changeStatus('active')} disabled={busy} className="btn btn-secondary btn-sm">Resume</button>
          )}
          {conv.status !== 'closed' && (
            <button onClick={() => changeStatus('closed')} disabled={busy} className="btn btn-secondary btn-sm">Close</button>
          )}
          <button onClick={() => setReportOpen(true)} className="btn btn-secondary btn-sm ml-auto">Report</button>
        </div>
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="text-caption text-muted">Sending as:</span>
          <button
            onClick={() => setSendAsRole('owner')}
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-caption font-medium transition-colors ${sendAsRole === 'owner' ? 'bg-danger/10 text-danger' : 'text-faint hover:bg-panel'}`}
          >
            <VerifiedBadge role="owner" size={13} /> Owner
          </button>
          <button
            onClick={() => setSendAsRole('owner_assistant')}
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-caption font-medium transition-colors ${sendAsRole === 'owner_assistant' ? 'bg-[#f5a524]/15 text-[#a86400]' : 'text-faint hover:bg-panel'}`}
          >
            <VerifiedBadge role="owner_assistant" size={13} /> Owner Assistant
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-line-strong bg-bg px-2 py-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !sending && send()}
            placeholder="Write a message…"
            className="min-w-0 flex-1 bg-transparent px-2 text-body text-ink outline-none placeholder:text-faint"
          />
          <button onClick={send} disabled={!text.trim() || sending} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40" aria-label="Send">
            <Icon name="send" size={17} />
          </button>
        </div>
      </div>

      {reportOpen && (
        <Modal open onClose={() => setReportOpen(false)} className="max-w-sm rounded-2xl p-5" labelledBy="report-conv-title">
          <h2 id="report-conv-title" className="font-display text-lg font-semibold text-ink">Report this conversation</h2>
          <label className="mt-3 flex flex-col gap-1.5 text-detail font-medium text-ink-soft">
            Reason
            <input value={reportReason} onChange={(e) => setReportReason(e.target.value)} className="input" />
          </label>
          <label className="mt-3 flex flex-col gap-1.5 text-detail font-medium text-ink-soft">
            Notes
            <textarea value={reportMessage} onChange={(e) => setReportMessage(e.target.value)} rows={3} className="input resize-none" />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setReportOpen(false)} className="btn btn-secondary btn-sm">Cancel</button>
            <button onClick={submitReport} className="btn btn-primary btn-sm">File report</button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

function MonitorPanel() {
  const [items, setItems] = useState<MonitorConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    fetchAllConversationsForMonitor()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load conversations.'));
  };
  useEffect(load, []);

  const filtered = (items ?? []).filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (query.trim() && !c.participants.some((p) => p.name.toLowerCase().includes(query.toLowerCase()))) return false;
    return true;
  });

  const open = filtered.find((c) => c.id === openId) ?? null;

  if (error) return <div className="card"><EmptyState size="md" icon="info" title={error} className="p-10" /></div>;
  if (!items) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="input max-w-xs"
        />
        <div className="flex gap-1 rounded-lg border border-line bg-panel/60 p-1">
          {(['all', 'active', 'paused', 'blocked', 'closed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-2.5 py-1 text-detail font-medium capitalize transition-colors ${statusFilter === s ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState size="md" icon="message" title="No conversations match" className="p-10" /></div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <button key={c.id} onClick={() => setOpenId(c.id)} className="card flex w-full flex-col gap-2 p-4 text-left sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-ink">
                  {c.participants.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1">
                      {p.name} <VerifiedBadge role={p.role} size={12} />
                    </span>
                  ))}
                  <span className={`badge ${CONVERSATION_STATUS_BADGE[c.status]}`}>{c.status}</span>
                  {c.ownerIntervened && <span className="badge bg-danger/10 text-danger">Intervened</span>}
                </p>
                <p className="truncate text-caption text-muted">
                  {c.carLabel ? `${c.carLabel} · ` : ''}{c.lastMessageBody ?? 'No messages yet'}
                </p>
              </div>
              <span className="shrink-0 text-caption text-faint">{c.messageCount} {c.messageCount === 1 ? 'message' : 'messages'}</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <ConversationMonitorModal
          conv={open}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </>
  );
}

function ActivityPanel() {
  const [items, setItems] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAuditLog()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load activity.'));
  }, []);

  if (error) return <div className="card"><EmptyState size="md" icon="info" title={error} className="p-10" /></div>;
  if (!items) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;
  if (items.length === 0) return <div className="card"><EmptyState size="md" icon="clock" title="No activity yet." description="Every action taken here — suspending a host, editing a vehicle, cancelling a booking — will show up in this log." className="p-10" /></div>;

  const actionLabel: Record<string, string> = {
    suspend_host: 'suspended host',
    unsuspend_host: 'reinstated host',
    remove_host: 'removed host',
    edit_host_profile: 'edited host profile',
    edit_vehicle: 'edited vehicle',
    set_vehicle_status: 'changed vehicle status',
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

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((e) => (
        <div key={e.id} className="card flex items-center gap-3 p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel text-muted"><Icon name="clock" size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body text-ink"><span className="font-medium">{e.actorName}</span> {actionLabel[e.action] ?? e.action}</p>
            <p className="text-caption text-muted">{new Date(e.createdAt).toLocaleString('en-GB')}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function NotesPanel() {
  const { toast } = useApp();
  const [items, setItems] = useState<OwnerNote[] | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const load = () => {
    fetchOwnerNotes()
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(load, []);

  const add = async () => {
    const content = draft.trim();
    if (!content) return;
    setAdding(true);
    const { error } = await createOwnerNote(content);
    setAdding(false);
    if (error) {
      toast({ title: "Couldn't save note", desc: error, icon: 'info' });
      return;
    }
    setDraft('');
    load();
  };

  const toggle = async (note: OwnerNote) => {
    await setOwnerNoteDone(note.id, !note.done);
    load();
  };

  const remove = async (note: OwnerNote) => {
    await deleteOwnerNote(note.id);
    load();
  };

  return (
    <div className="max-w-2xl">
      <div className="card flex gap-2 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add a private note or task…"
          className="input flex-1"
        />
        <button onClick={add} disabled={adding || !draft.trim()} className="btn btn-primary btn-sm shrink-0 disabled:opacity-50">Add</button>
      </div>

      {items === null ? (
        <div className="card mt-3"><EmptyState size="sm" icon="info" title="Loading…" className="py-6" /></div>
      ) : items.length === 0 ? (
        <div className="card mt-3"><EmptyState size="sm" icon="sparkles" title="No notes yet" description="Private to your account only — nobody else, including any future admin, can see these." className="py-8" /></div>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {items.map((n) => (
            <div key={n.id} className="card flex items-center gap-3 p-3">
              <button
                onClick={() => toggle(n)}
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${n.done ? 'border-accent bg-accent text-white' : 'border-line-strong'}`}
                aria-label={n.done ? 'Mark as not done' : 'Mark as done'}
              >
                {n.done && <Icon name="check" size={12} />}
              </button>
              <p className={`flex-1 text-body ${n.done ? 'text-faint line-through' : 'text-ink'}`}>{n.content}</p>
              <button onClick={() => remove(n)} className="grid h-7 w-7 place-items-center rounded-lg text-faint hover:bg-panel hover:text-danger" aria-label="Delete note">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SecurityPanel() {
  const [roster, setRoster] = useState<{ name: string; isOwner: boolean }[] | null>(null);
  const [suspendedCount, setSuspendedCount] = useState<number | null>(null);

  useEffect(() => {
    fetchAllUsers().then((users) => {
      setRoster(users.filter((u) => u.isAdmin).map((u) => ({ name: u.fullName, isOwner: false })));
    });
    fetchAllHosts().then((hosts) => setSuspendedCount(hosts.filter((h) => h.suspended).length));
  }, []);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="card p-5">
        <h2 className="font-display text-body font-semibold text-ink">Privileged accounts</h2>
        <p className="mt-1 text-detail text-muted">
          Exactly one account can ever hold Owner, enforced by a database constraint — see supabase/migrations/0021_owner_control_center.sql.
          There is no interface anywhere, including this one, that can grant Owner or Admin to another account.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {roster === null ? (
            <p className="text-detail text-muted">Loading…</p>
          ) : (
            roster.map((r) => (
              <div key={r.name} className="flex items-center gap-2 rounded-lg bg-panel/60 px-3 py-2">
                <Icon name="verified" size={15} className="text-accent-bright" />
                <span className="text-body font-medium text-ink">{r.name}</span>
                <span className="badge badge-accent ml-auto">Owner</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-display text-body font-semibold text-ink">Account safety</h2>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-panel/60 px-3 py-2.5">
          <span className="text-body text-ink">Suspended hosts</span>
          <span className="font-medium text-ink">{suspendedCount ?? '—'}</span>
        </div>
        <p className="mt-2 text-detail text-muted">
          Session storage on the native app uses the iOS Keychain, not local storage — see src/lib/secureStorage.ts.
          Every privileged action taken in this Control Center is written to the Activity log.
        </p>
      </div>
    </div>
  );
}

function SettingsPanel() {
  const { toast } = useApp();
  const { settings, loading, reload } = usePlatformSettings();
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [confirmingMaintenance, setConfirmingMaintenance] = useState(false);
  const initialised = useRef(false);

  useEffect(() => {
    if (settings && !initialised.current) {
      setMaintenanceMessage(settings.maintenanceMessage);
      setAnnouncementMessage(settings.announcementMessage);
      initialised.current = true;
    }
  }, [settings]);

  if (loading || !settings) return <div className="card"><EmptyState size="md" icon="info" title="Loading…" className="p-10" /></div>;

  const saveMaintenanceMessage = async () => {
    const { error } = await updatePlatformSettings({ maintenanceMessage });
    if (error) toast({ title: "Couldn't save", desc: error, icon: 'info' });
    else toast({ title: 'Saved', icon: 'checkCircle' });
    reload();
  };

  const toggleMaintenance = async () => {
    const { error } = await updatePlatformSettings({ maintenanceMode: !settings.maintenanceMode });
    if (error) toast({ title: "Couldn't update maintenance mode", desc: error, icon: 'info' });
    else toast({ title: settings.maintenanceMode ? 'Maintenance mode turned off' : 'Maintenance mode turned on', icon: settings.maintenanceMode ? 'checkCircle' : 'shield' });
    reload();
  };

  const saveAnnouncement = async (active: boolean) => {
    const { error } = await updatePlatformSettings({ announcementMessage, announcementActive: active });
    if (error) toast({ title: "Couldn't save", desc: error, icon: 'info' });
    else toast({ title: active ? 'Announcement is live' : 'Announcement hidden', icon: 'checkCircle' });
    reload();
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className={`card p-5 ${settings.maintenanceMode ? 'border-danger/40 bg-danger/[0.03]' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-body font-semibold text-ink">
              <Icon name="shield" size={16} className={settings.maintenanceMode ? 'text-danger' : 'text-muted'} />
              Maintenance mode
            </h2>
            <p className="mt-1 text-detail text-muted">
              {settings.maintenanceMode
                ? 'The entire site is currently down for everyone except you.'
                : 'Takes the whole platform offline for everyone except your Owner account.'}
            </p>
          </div>
          <button
            onClick={() => (settings.maintenanceMode ? toggleMaintenance() : setConfirmingMaintenance(true))}
            className={`btn btn-sm shrink-0 ${settings.maintenanceMode ? 'bg-danger text-white hover:bg-danger/90' : 'btn-secondary'}`}
          >
            {settings.maintenanceMode ? 'Turn off' : 'Turn on'}
          </button>
        </div>
        <label className="mt-4 flex flex-col gap-1.5 text-detail font-medium text-ink-soft">
          Message shown to visitors
          <textarea value={maintenanceMessage} onChange={(e) => setMaintenanceMessage(e.target.value)} rows={2} className="input resize-none" />
        </label>
        <button onClick={saveMaintenanceMessage} className="btn btn-secondary btn-sm mt-2">Save message</button>
      </div>

      <div className="card p-5">
        <h2 className="flex items-center gap-2 font-display text-body font-semibold text-ink">
          <Icon name="sparkles" size={16} className="text-muted" /> Platform-wide announcement
        </h2>
        <p className="mt-1 text-detail text-muted">A dismissible banner shown to every visitor, on every page.</p>
        <label className="mt-4 flex flex-col gap-1.5 text-detail font-medium text-ink-soft">
          Announcement text
          <textarea value={announcementMessage} onChange={(e) => setAnnouncementMessage(e.target.value)} rows={2} className="input resize-none" placeholder="e.g. New cities just launched — Lisbon and Vienna are live." />
        </label>
        <div className="mt-2 flex gap-2">
          {settings.announcementActive ? (
            <button onClick={() => saveAnnouncement(false)} className="btn btn-secondary btn-sm">Hide banner</button>
          ) : (
            <button onClick={() => saveAnnouncement(true)} disabled={!announcementMessage.trim()} className="btn btn-primary btn-sm disabled:opacity-50">Publish banner</button>
          )}
          {settings.announcementActive && (
            <button onClick={() => saveAnnouncement(true)} className="btn btn-secondary btn-sm">Update text</button>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmingMaintenance}
        onClose={() => setConfirmingMaintenance(false)}
        onConfirm={toggleMaintenance}
        title="Turn on maintenance mode?"
        description="Every visitor except your Owner account will immediately see the maintenance screen instead of the app, on both web and the native app."
        confirmLabel="Turn on maintenance mode"
      />
    </div>
  );
}

function GlobalSearch({ onPick }: { onPick: (result: OwnerSearchResult) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OwnerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      searchPlatform(query).then((r) => {
        setResults(r);
        setOpen(true);
      });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const resultIcon: Record<OwnerSearchResult['type'], IconName> = { host: 'users', vehicle: 'cars', booking: 'trips' };

  return (
    <div ref={boxRef} className="relative hidden w-full max-w-xs sm:block">
      <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search hosts, vehicles, bookings…"
        className="w-full rounded-lg border border-white/15 bg-white/10 py-2 pl-9 pr-3 text-detail text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/30"
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1.5 max-h-80 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => {
                onPick(r);
                setOpen(false);
                setQuery('');
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-panel"
            >
              <Icon name={resultIcon[r.type]} size={15} className="shrink-0 text-muted" />
              <div className="min-w-0">
                <p className="truncate text-detail font-medium text-ink">{r.title}</p>
                <p className="truncate text-caption text-muted">{r.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OwnerDashboard() {
  const { signOut, profile } = useAuth();
  // Deep-linkable from anywhere — the Owner Home quick actions
  // (src/pages/OwnerHome.tsx) link straight to e.g. /owner?tab=hosts.
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(VALID_TABS.includes(initialTab as Tab) ? (initialTab as Tab) : 'overview');
  const [openVehicleId, setOpenVehicleId] = useState<string | null>(null);

  const handleSignOut = async () => {
    await signOut();
    window.location.assign('/');
  };

  const handleSearchPick = (result: OwnerSearchResult) => {
    if (result.type === 'vehicle') {
      setOpenVehicleId(result.id);
      setTab('vehicles');
    } else if (result.type === 'host') {
      setTab('hosts');
    } else {
      setTab('bookings');
    }
  };

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 flex min-h-16 items-center gap-4 border-b border-line bg-noir px-5 pt-safe">
        <Logo variant="symbol" />
        <div className="shrink-0">
          <p className="flex items-center gap-1.5 font-display text-body font-semibold text-white">
            <Icon name="verified" size={16} className="text-accent-bright" /> Owner Control Center
          </p>
          <p className="text-caption text-white/50">{profile?.full_name || 'Signed in'}</p>
        </div>
        <GlobalSearch onPick={handleSearchPick} />
        <div className="ml-auto flex items-center gap-2">
          <Link to="/" className="btn btn-sm border border-white/15 text-white hover:bg-white/10">Back to site</Link>
          <button onClick={handleSignOut} className="grid h-9 w-9 place-items-center rounded-lg text-white/60 hover:bg-white/10" aria-label="Sign out">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </header>

      <div className="container-page py-6">
        <nav className="mb-6 flex gap-1.5 overflow-x-auto rounded-xl border border-line bg-panel/60 p-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-detail font-medium transition-colors ${
                tab === t.id ? 'bg-noir text-white' : 'text-ink-soft hover:bg-white'
              }`}
            >
              <Icon name={t.icon} size={16} /> {t.label}
            </button>
          ))}
        </nav>

        {tab === 'overview' && <OverviewPanel onNavigate={setTab} />}
        {tab === 'hosts' && <HostsPanel />}
        {tab === 'vehicles' && <VehiclesPanel initialManagingId={openVehicleId} />}
        {tab === 'bookings' && <BookingsPanel />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'verifications' && <VerificationsPanel />}
        {tab === 'reports' && <ReportsPanel />}
        {tab === 'monitor' && <MonitorPanel />}
        {tab === 'activity' && <ActivityPanel />}
        {tab === 'notes' && <NotesPanel />}
        {tab === 'security' && <SecurityPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  );
}
