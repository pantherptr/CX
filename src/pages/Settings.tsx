import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { Icon, type IconName } from '../components/Icon';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'personal', label: 'Personal information', icon: 'user' },
  { id: 'driver', label: 'Driver information', icon: 'car' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'payments', label: 'Payment methods', icon: 'card' },
  { id: 'security', label: 'Security', icon: 'lock' },
  { id: 'preferences', label: 'Preferences', icon: 'settings' },
];

const TAB_IDS = new Set(TABS.map((t) => t.id));

function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={full ? 'sm:col-span-2' : ''}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-panel-2'}`} role="switch" aria-checked={on}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function Settings() {
  const { toast } = useApp();
  const { session, profile, refreshProfile } = useAuth();
  const { hash } = useLocation();
  const [tab, setTab] = useState('personal');
  const [toggles, setToggles] = useState({ trip: true, promo: false, host: true, sms: true, push: true });
  const flip = (k: keyof typeof toggles) => setToggles((t) => ({ ...t, [k]: !t[k] }));

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = hash.slice(1);
    if (TAB_IDS.has(id)) setTab(id);
  }, [hash]);

  // Populate the editable fields once the real profile has loaded — it
  // arrives a beat after the session does.
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    setLocation(profile.location ?? '');
  }, [profile]);

  const savePersonalInfo = async () => {
    if (!session) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, phone, location })
      .eq('id', session.user.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save changes', desc: error.message, icon: 'info' });
      return;
    }
    await refreshProfile();
    toast({ title: 'Changes saved', icon: 'check' });
  };

  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session) return;
    setUploadingPhoto(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) {
      setUploadingPhoto(false);
      toast({ title: 'Could not upload photo', desc: uploadError.message, icon: 'info' });
      return;
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: pub.publicUrl })
      .eq('id', session.user.id);
    setUploadingPhoto(false);
    if (updateError) {
      toast({ title: 'Could not save photo', desc: updateError.message, icon: 'info' });
      return;
    }
    await refreshProfile();
    toast({ title: 'Profile photo updated', icon: 'check' });
  };

  return (
    <DashboardShell variant="customer" active="Settings">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Settings</h1>
        <p className="mt-1 text-[14px] text-muted">Manage your account, preferences and payment details.</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* Sub-nav */}
          <nav className="flex gap-2 overflow-x-auto pb-1 no-scrollbar lg:flex-col lg:overflow-visible">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[14px] font-medium transition-colors ${
                  tab === t.id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-panel'
                }`}
              >
                <Icon name={t.icon} size={18} className={tab === t.id ? 'text-white' : 'text-muted'} />
                <span className="whitespace-nowrap">{t.label}</span>
              </button>
            ))}
          </nav>

          {/* Panel */}
          <div className="card p-6 sm:p-8">
            {tab === 'personal' && (
              <div className="animate-fade-in">
                <div className="flex items-center gap-4">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-accent-050 text-accent">
                      <Icon name="user" size={26} />
                    </span>
                  )}
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    <button
                      onClick={handleAvatarPick}
                      disabled={uploadingPhoto}
                      className="btn btn-secondary btn-sm disabled:opacity-60"
                    >
                      {uploadingPhoto ? 'Uploading…' : 'Change photo'}
                    </button>
                    <p className="mt-1.5 text-[12.5px] text-muted">JPG or PNG, up to 5MB</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" full>
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
                  </Field>
                  <Field label="Email" full>
                    <input value={session?.user.email ?? ''} disabled className="input opacity-60" />
                  </Field>
                  <Field label="Phone">
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
                  </Field>
                  <Field label="Location">
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="City, country"
                      className="input"
                    />
                  </Field>
                </div>
              </div>
            )}

            {tab === 'driver' && (
              <div className="animate-fade-in">
                <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-accent-050 p-3.5 text-[13.5px] text-accent-700">
                  <Icon name="verified" size={18} className="shrink-0" /> Your driving licence is verified.
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Licence number" full><input defaultValue="RSSLXA92E14F205X" className="input" /></Field>
                  <Field label="Issuing country"><input defaultValue="Italy" className="input" /></Field>
                  <Field label="Expiry date"><input type="date" defaultValue="2029-05-14" className="input" /></Field>
                  <Field label="Date of birth"><input type="date" defaultValue="1992-05-14" className="input" /></Field>
                  <Field label="Years driving"><input defaultValue="12" className="input" /></Field>
                </div>
              </div>
            )}

            {tab === 'notifications' && (
              <div className="animate-fade-in divide-y divide-line">
                {[
                  { k: 'trip' as const, t: 'Trip updates', d: 'Booking confirmations, reminders and changes.' },
                  { k: 'host' as const, t: 'Messages from hosts', d: 'Get notified when a host replies to you.' },
                  { k: 'promo' as const, t: 'Promotions & offers', d: 'Occasional deals and Velora news.' },
                  { k: 'sms' as const, t: 'SMS notifications', d: 'Time-sensitive alerts by text message.' },
                  { k: 'push' as const, t: 'Push notifications', d: 'Real-time alerts on your devices.' },
                ].map((r) => (
                  <div key={r.k} className="flex items-center justify-between py-4 first:pt-0">
                    <div className="pr-4">
                      <p className="text-[14.5px] font-medium text-ink">{r.t}</p>
                      <p className="text-[13px] text-muted">{r.d}</p>
                    </div>
                    <Toggle on={toggles[r.k]} onClick={() => flip(r.k)} />
                  </div>
                ))}
              </div>
            )}

            {tab === 'payments' && (
              <div className="animate-fade-in">
                <div className="space-y-3">
                  {[
                    { brand: 'Visa', last: '4242', exp: '08/28', primary: true },
                    { brand: 'Mastercard', last: '5588', exp: '11/26', primary: false },
                  ].map((card) => (
                    <div key={card.last} className="flex items-center gap-4 rounded-xl border border-line p-4">
                      <span className="grid h-10 w-14 place-items-center rounded-lg bg-ink text-[11px] font-semibold uppercase text-white">{card.brand.slice(0, 4)}</span>
                      <div className="flex-1">
                        <p className="text-[14px] font-medium text-ink">•••• {card.last}</p>
                        <p className="text-[12.5px] text-muted">Expires {card.exp}</p>
                      </div>
                      {card.primary && <span className="badge badge-accent">Default</span>}
                      <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-panel"><Icon name="x" size={16} /></button>
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary mt-4"><Icon name="plus" size={16} /> Add payment method</button>
              </div>
            )}

            {tab === 'security' && (
              <div className="animate-fade-in space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Current password"><input type="password" defaultValue="password" className="input" /></Field>
                  <div className="hidden sm:block" />
                  <Field label="New password"><input type="password" placeholder="••••••••" className="input" /></Field>
                  <Field label="Confirm new password"><input type="password" placeholder="••••••••" className="input" /></Field>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line p-4">
                  <div>
                    <p className="text-[14.5px] font-medium text-ink">Two-factor authentication</p>
                    <p className="text-[13px] text-muted">Add an extra layer of security to your account.</p>
                  </div>
                  <Toggle on={toggles.push} onClick={() => flip('push')} />
                </div>
              </div>
            )}

            {tab === 'preferences' && (
              <div className="animate-fade-in grid gap-4 sm:grid-cols-2">
                <Field label="Language"><select className="input"><option>English (EU)</option><option>Italiano</option><option>Français</option><option>Deutsch</option></select></Field>
                <Field label="Currency"><select className="input"><option>EUR (€)</option><option>GBP (£)</option><option>USD ($)</option></select></Field>
                <Field label="Distance units"><select className="input"><option>Kilometres</option><option>Miles</option></select></Field>
                <Field label="Time zone"><select className="input"><option>Europe/Rome (CET)</option><option>Europe/Paris</option><option>Europe/Amsterdam</option></select></Field>
              </div>
            )}

            <div className="mt-8 flex items-center justify-end gap-3 border-t border-line pt-6">
              <button className="btn btn-ghost text-muted hover:text-ink">Cancel</button>
              <button
                onClick={tab === 'personal' ? savePersonalInfo : () => toast({ title: 'Changes saved', icon: 'check' })}
                disabled={saving}
                className="btn btn-primary disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
