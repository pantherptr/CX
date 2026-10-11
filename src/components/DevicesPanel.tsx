import { useCallback, useEffect, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { useApp } from '../lib/store';
import { fetchDevices, getDeviceId, signOutOtherDevices, touchDevice, type DeviceRow } from '../lib/data/devices';

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'Active now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const iconFor = (d: DeviceRow): IconName => (/iPhone|Android|app/i.test(d.label) ? 'phone' : 'globe');

/** Settings → Security: where you are signed in, and one tap to sign every other device out. */
export function DevicesPanel() {
  const { toast } = useApp();
  const [rows, setRows] = useState<DeviceRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const me = getDeviceId();

  const load = useCallback(async () => {
    await touchDevice();
    const r = await fetchDevices();
    setRows(r.error ? [] : r.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const others = (rows ?? []).filter((d) => d.deviceId !== me);

  const signOutOthers = async () => {
    if (!window.confirm('Sign out of every other device? You stay signed in here.')) return;
    setBusy(true);
    const { error } = await signOutOtherDevices();
    setBusy(false);
    if (error) { toast({ title: 'Could not sign out other devices', desc: error, icon: 'info' }); return; }
    toast({ title: 'Other devices signed out', icon: 'check' });
    void load();
  };

  return (
    <div className="mt-5">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted">Devices &amp; access</p>
      <div className="mt-2 divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-surface">
        {rows === null ? (
          <p className="px-4 py-5 text-detail text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-5 text-detail text-muted">This device is signed in. Other devices will show up here after their next visit.</p>
        ) : (
          rows.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-050 text-accent"><Icon name={iconFor(d)} size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold text-ink">{d.label}</p>
                <p className="text-caption text-muted">{d.deviceId === me ? <span className="font-semibold text-accent">This device · {ago(d.lastSeen)}</span> : ago(d.lastSeen)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <button
        onClick={signOutOthers}
        disabled={busy || others.length === 0}
        className="btn btn-secondary btn-block mt-3 disabled:opacity-50"
      >
        {busy ? 'Signing out…' : others.length > 0 ? `Sign out ${others.length} other device${others.length === 1 ? '' : 's'}` : 'No other devices'}
      </button>
    </div>
  );
}
