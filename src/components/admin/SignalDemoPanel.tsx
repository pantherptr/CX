import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { useApp } from '../../lib/store';
import {
  fetchSignalDemoSettings, setSignalDemoSettings, fetchSignalDemoStats,
  generateSignalDemoContentNow, clearSignalDemoContent, regenerateSignalDemoContent,
  type SignalDemoSettings,
} from '../../lib/data/signalDemo';

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-accent' : 'bg-panel-2'}`}
      role="switch"
      aria-checked={on}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function NumberField({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="field-label">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        className="input"
      />
    </label>
  );
}

/** SIGNAL Community's demo content engine — Owner/Admin only (this
 *  panel only ever mounts inside AdminDashboard, itself behind
 *  `AdminRoute`; every RPC it calls also independently re-checks
 *  `is_admin()` server-side, so this is a convenience surface, not the
 *  real security boundary — same convention every other admin control
 *  in this app already follows). Generation/clearing only ever touch
 *  `signal_demo_*` tables — never a real profile, never a real post
 *  (see 0062_signal_demo_content_engine.sql for the full separation
 *  this relies on). */
export function SignalDemoPanel() {
  const { toast } = useApp();
  const [settings, setSettings] = useState<SignalDemoSettings | null>(null);
  const [stats, setStats] = useState<{ profileCount: number; postCount: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'generate' | 'clear' | 'regenerate' | null>(null);

  const load = () => {
    fetchSignalDemoSettings().then(setSettings).catch(() => {});
    fetchSignalDemoStats().then(setStats).catch(() => {});
  };

  useEffect(load, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { settings: updated, error } = await setSignalDemoSettings(settings);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save settings', desc: error, icon: 'info' });
      return;
    }
    setSettings(updated);
    toast({ title: 'Demo settings saved', icon: 'checkCircle' });
  };

  const handleGenerate = async () => {
    setBusy('generate');
    const { result, error } = await generateSignalDemoContentNow();
    setBusy(null);
    if (error) {
      toast({ title: 'Could not generate demo content', desc: error, icon: 'info' });
      return;
    }
    toast({ title: `Added ${result?.postsInserted ?? 0} posts, ${result?.profilesInserted ?? 0} new profiles`, icon: 'checkCircle' });
    load();
  };

  const handleClear = async () => {
    if (!window.confirm('Delete all demo profiles and posts? This cannot be undone. Real content is never touched.')) return;
    setBusy('clear');
    const { postsDeleted, profilesDeleted, error } = await clearSignalDemoContent();
    setBusy(null);
    if (error) {
      toast({ title: 'Could not clear demo content', desc: error, icon: 'info' });
      return;
    }
    toast({ title: `Removed ${postsDeleted} posts, ${profilesDeleted} profiles`, icon: 'checkCircle' });
    load();
  };

  const handleRegenerate = async () => {
    if (!window.confirm('Clear all demo content and generate a fresh batch?')) return;
    setBusy('regenerate');
    const { result, error } = await regenerateSignalDemoContent();
    setBusy(null);
    if (error) {
      toast({ title: 'Could not regenerate demo content', desc: error, icon: 'info' });
      return;
    }
    toast({ title: `Fresh batch: ${result?.postsInserted ?? 0} posts, ${result?.profilesInserted ?? 0} profiles`, icon: 'checkCircle' });
    load();
  };

  if (!settings) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-20 rounded-xl" />
        <div className="skeleton h-52 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-detail font-semibold text-ink">SIGNAL Community demo content</p>
          <p className="mt-0.5 text-caption text-muted">
            {stats ? `${stats.postCount} demo posts · ${stats.profileCount} demo profiles` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-detail font-medium text-ink-soft">{settings.enabled ? 'Enabled' : 'Disabled'}</span>
          <Toggle on={settings.enabled} disabled={saving} onClick={() => setSettings({ ...settings, enabled: !settings.enabled })} />
        </div>
      </div>

      <div className="card p-4">
        <p className="mb-3 text-detail font-semibold text-ink">Daily generation</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField label="Profiles / day" value={settings.demoProfilesPerDay} onChange={(v) => setSettings({ ...settings, demoProfilesPerDay: v })} />
          <NumberField label="Posts / day" value={settings.demoPostsPerDay} onChange={(v) => setSettings({ ...settings, demoPostsPerDay: v })} />
          <NumberField label="Photos / day" value={settings.demoPhotosPerDay} onChange={(v) => setSettings({ ...settings, demoPhotosPerDay: v })} />
          <NumberField label="Videos / day" value={settings.demoVideosPerDay} onChange={(v) => setSettings({ ...settings, demoVideosPerDay: v })} />
        </div>
        <p className="mt-2 text-caption text-faint">
          Videos aren't generated yet (no video-asset pipeline) — this stays a real setting for when one exists, it just has no effect today.
        </p>
        <div className="mt-4 max-w-[200px]">
          <NumberField label="Retention (days)" value={settings.retentionDays} onChange={(v) => setSettings({ ...settings, retentionDays: Math.max(1, v) })} min={1} />
        </div>
        <p className="mt-2 text-caption text-faint">Demo posts older than this are cleaned up automatically. Real content is never affected.</p>
        <button onClick={save} disabled={saving} className="btn btn-primary btn-sm mt-4 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <div className="card p-4">
        <p className="mb-1 text-detail font-semibold text-ink">Manual controls</p>
        <p className="mb-3 text-caption text-muted">
          Generation and clearing only ever touch demo profiles/posts — never a real user or a real post.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <button onClick={handleGenerate} disabled={busy !== null} className="btn btn-secondary btn-sm disabled:opacity-60">
            <Icon name="sparkles" size={15} /> {busy === 'generate' ? 'Generating…' : 'Generate now'}
          </button>
          <button onClick={handleRegenerate} disabled={busy !== null} className="btn btn-secondary btn-sm disabled:opacity-60">
            <Icon name="sort" size={15} /> {busy === 'regenerate' ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button onClick={handleClear} disabled={busy !== null} className="btn btn-secondary btn-sm text-danger disabled:opacity-60">
            <Icon name="trash" size={15} /> {busy === 'clear' ? 'Clearing…' : 'Clear all demo content'}
          </button>
        </div>
      </div>
    </div>
  );
}
