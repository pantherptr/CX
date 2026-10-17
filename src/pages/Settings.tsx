import { ActionLabel } from '../components/ui/loading-button';
import ThemeSwitch from '../components/ThemeSwitch';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_NOTIFICATION_PREFS, fetchNotificationPrefs, saveNotificationPrefs, type NotificationPrefs } from '../lib/data/notifications';
import { useLocation, useNavigate } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { Icon, type IconName } from '../components/Icon';
import { Img } from '../components/motion';
import { motion, AnimatePresence } from '../components/motionKit';
import { Group, Row } from '../components/IosList';
import { Modal, Switch } from '../components/primitives';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useLocale } from '../lib/i18n';
import { COUNTRIES } from '../lib/i18n/countries';
import { supabase } from '../lib/supabase';
import { useMyBookings, classifyBooking, renterTier } from '../lib/data/bookings';
import { useVerification } from '../lib/data/verification';
import { VerificationFlow } from '../components/VerificationFlow';
import { eur } from '../lib/format';
import { haptics } from '../lib/native';
import { apiUrl } from '../lib/api';
import { shrinkImage } from '../lib/shrinkImage';
import { DevicesPanel } from '../components/DevicesPanel';
import { PushPrompt } from '../components/PushPrompt';
import { fetchPlatformPrefs, savePlatformPrefs, DEFAULT_PLATFORM_PREFS, type PlatformPrefs } from '../lib/data/appNotifications';
import { uiLocale } from '../lib/i18n/uiLocale';

type SectionId = 'personal' | 'driver' | 'notifications' | 'payments' | 'preferences' | 'security';
const SECTIONS: { id: SectionId; title: string; icon: IconName }[] = [
  { id: 'personal', title: 'Personal information', icon: 'user' },
  { id: 'driver', title: 'Verification', icon: 'verified' },
  { id: 'payments', title: 'Payments', icon: 'card' },
  { id: 'notifications', title: 'Notifications', icon: 'bell' },
  { id: 'preferences', title: 'Language & region', icon: 'globe' },
  { id: 'security', title: 'Security', icon: 'lock' },
];
const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));
// The five Signal Activity groups live on the server (a switched-off kind is never created).
const SIGNAL_PREF_KEYS = ['followers', 'requests', 'circle', 'respects', 'visions'] as const;

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block px-4 py-3">
      <span className="text-caption font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-caption text-faint">{hint}</span>}
    </label>
  );
}
const fieldInput = 'mt-1 block w-full bg-transparent text-[16px] font-medium text-ink outline-none placeholder:text-faint disabled:text-muted sm:text-body';

export default function Settings() {
  const { toast } = useApp();
  const navigate = useNavigate();
  const { t, country, resetCountry, chooseCountry } = useLocale();
  const { session, profile, refreshProfile, signOut } = useAuth();
  const { bookings } = useMyBookings(session?.user.id);
  const { verification, refresh: refreshVerification } = useVerification(session?.user.id);
  const { hash } = useLocation();
  const [section, setSection] = useState<SectionId | null>(null);

  const completed = (bookings ?? []).filter((b) => classifyBooking(b) === 'completed');
  const tier = renterTier(completed.length);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trips / messages / promotions / push — saved to the account and honoured by the server.
  const [platformPrefs, setPlatformPrefs] = useState<PlatformPrefs>(DEFAULT_PLATFORM_PREFS);
  useEffect(() => {
    let cancelled = false;
    fetchPlatformPrefs().then((p) => { if (!cancelled) setPlatformPrefs(p); });
    return () => { cancelled = true; };
  }, []);
  const flip = (k: keyof PlatformPrefs) => {
    const next = { ...platformPrefs, [k]: !platformPrefs[k] };
    setPlatformPrefs(next);
    void savePlatformPrefs(next);
  };
  // Signal Activity preferences: read from the server, saved to the server on each change.
  const [signalPrefs, setSignalPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  useEffect(() => {
    let cancelled = false;
    fetchNotificationPrefs().then((p) => { if (!cancelled) setSignalPrefs(p); });
    return () => { cancelled = true; };
  }, []);
  const flipSignal = (k: (typeof SIGNAL_PREF_KEYS)[number]) => {
    const next = { ...signalPrefs, [k]: !signalPrefs[k] };
    setSignalPrefs(next);
    void saveNotificationPrefs(next);
  };

  const [pwd, setPwd] = useState({ next: '', confirm: '' });
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    const raw = hash.slice(1);
    const id = raw === 'licence' || raw === 'verification' ? 'driver' : raw;
    if (SECTION_IDS.has(id)) setSection(id as SectionId);
  }, [hash]);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    setLocation(profile.location ?? '');
  }, [profile]);

  const savePersonalInfo = async () => {
    if (!session) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName, phone, location }).eq('id', session.user.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save changes', desc: error.message, icon: 'info' });
      return;
    }
    await refreshProfile();
    toast({ title: 'Changes saved', icon: 'check' });
  };

  const changePassword = async () => {
    if (pwd.next.length < 8) { toast({ title: 'Use at least 8 characters', icon: 'info' }); return; }
    if (pwd.next !== pwd.confirm) { toast({ title: "The two passwords don't match", icon: 'info' }); return; }
    setPwdSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd.next });
    setPwdSaving(false);
    if (error) { toast({ title: 'Could not change the password', desc: error.message, icon: 'info' }); return; }
    setPwd({ next: '', confirm: '' });
    toast({ title: 'Password updated', icon: 'check' });
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Real deletion — see api/delete-account.ts. Required by Apple's App
  // Store guidelines (5.1.1(v)) for any app with account creation; the
  // endpoint cascades through the whole schema via
  // `profiles.id references auth.users(id) on delete cascade`, and
  // refuses to run at all while the account has an upcoming/active
  // booking on either side (renter or host) so deleting your own account
  // can never silently wipe out someone else's confirmed trip.
  const handleDeleteAccount = async () => {
    if (!session) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(apiUrl('/api/delete-account'), { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (!res.ok) {
        haptics.error();
        setDeleteError(data.error ?? "Couldn't delete your account — please try again.");
        setDeleting(false);
        return;
      }
      await signOut();
      window.location.assign('/');
    } catch {
      haptics.error();
      setDeleteError('Network error — please check your connection and try again.');
      setDeleting(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked || !session) return;
    setUploadingPhoto(true);
    const file = await shrinkImage(picked, 800, 0.85);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { cacheControl: '31536000', upsert: false });
    if (uploadError) {
      setUploadingPhoto(false);
      toast({ title: 'Could not upload photo', desc: uploadError.message, icon: 'info' });
      return;
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: pub.publicUrl }).eq('id', session.user.id);
    setUploadingPhoto(false);
    if (updateError) {
      toast({ title: 'Could not save photo', desc: updateError.message, icon: 'info' });
      return;
    }
    await refreshProfile();
    toast({ title: 'Profile photo updated', icon: 'check' });
  };

  const verifyLabel = !verification || (verification.identityStatus === 'none' && verification.licenceStatus === 'none')
    ? 'Not verified'
    : verification.identityStatus === 'approved' && verification.licenceStatus === 'approved' ? 'Fully verified'
    : verification.identityStatus === 'approved' ? 'Verified'
    : verification.identityStatus === 'rejected' || verification.licenceStatus === 'rejected' ? 'Action needed'
    : 'Under review';

  const memberSince = profile?.created_at ? new Date(profile.created_at).getFullYear() : null;
  const roleChips = [profile?.is_owner && 'Owner', profile?.is_host && 'Host'].filter(Boolean) as string[];
  const payments = useMemo(() => (bookings ?? []).filter((b) => classifyBooking(b) !== 'cancelled'), [bookings]);
  const sectionMeta = SECTIONS.find((s) => s.id === section);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

  const avatar = (size: string) =>
    uploadingPhoto ? (
      <span className={`skeleton block rounded-full ${size}`} />
    ) : profile?.avatar_url ? (
      <Img src={profile.avatar_url} alt="" className={`rounded-full object-cover ${size}`} fallback={<span className={`grid place-items-center rounded-full bg-panel text-ink-soft ${size}`}><Icon name="user" size={28} /></span>} />
    ) : (
      <span className={`grid place-items-center rounded-full bg-panel text-ink-soft ${size}`}><Icon name="user" size={28} /></span>
    );

  return (
    <DashboardShell variant="customer" active="Settings">
      <div className="mx-auto max-w-2xl p-4 pb-28 sm:p-6 lg:p-8">
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleAvatarChange} />

        <AnimatePresence mode="wait" initial={false}>
          {section === null ? (
            <motion.div key="hub" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
              {/* Profile header */}
              <div className="flex flex-col items-center pt-2 text-center">
                <button onClick={() => fileInputRef.current?.click()} aria-label={t('Change photo')} className="group relative">
                  {avatar('h-24 w-24')}
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-8 w-8 place-items-center rounded-full bg-ink text-white ring-[3px] ring-bg transition-transform group-hover:scale-110"><Icon name="camera" size={14} /></span>
                </button>
                <h1 className="mt-4 font-display text-[1.7rem] font-bold leading-tight tracking-tight text-ink">{profile?.full_name || session?.user.email?.split('@')[0] || 'Your profile'}</h1>
                <p className="mt-0.5 text-body text-muted">{session?.user.email}</p>
                {(tier || roleChips.length > 0) && (
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    {tier && <span className="rounded-full bg-ink px-3 py-1 text-caption font-semibold text-white">{tier}</span>}
                    {roleChips.map((r) => <span key={r} className="rounded-full bg-surface px-3 py-1 text-caption font-semibold text-ink ring-1 ring-line">{r}</span>)}
                  </div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2.5">
                {[
                  { v: String(completed.length), l: 'Trips' },
                  { v: String((bookings ?? []).filter((b) => ['upcoming', 'active'].includes(classifyBooking(b))).length), l: 'Upcoming' },
                  { v: memberSince ? String(memberSince) : '—', l: 'Member since' },
                ].map((x) => (
                  <div key={x.l} className="rounded-[18px] bg-surface p-3 text-center ring-1 ring-line">
                    <p className="font-display text-xl font-semibold text-ink">{x.v}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-faint">{t(x.l)}</p>
                  </div>
                ))}
              </div>

              <Group title={t('Account')}>
                {SECTIONS.slice(0, 4).map((s) => (
                  <Row key={s.id} icon={s.icon} title={t(s.title)} value={s.id === 'driver' ? t(verifyLabel) : undefined} onClick={() => setSection(s.id)} />
                ))}
              </Group>
              <Group title={t('App')}>
                {SECTIONS.slice(4).map((s) => (
                  <Row key={s.id} icon={s.icon} title={t(s.title)} value={s.id === 'preferences' ? country?.name : undefined} onClick={() => setSection(s.id)} />
                ))}
              </Group>
              <Group title={t('Shortcuts')}>
                <Row icon="trips" title={t('My trips')} onClick={() => navigate('/dashboard#trips')} />
                <Row icon="heart" title={t('Saved cars')} onClick={() => navigate('/dashboard#saved')} />
                <Row icon="message" title={t('Messages')} onClick={() => navigate('/messages')} />
              </Group>

              <button
                onClick={async () => { await signOut(); navigate('/'); }}
                className="mt-7 w-full rounded-[22px] border border-line bg-surface py-3.5 text-body font-semibold text-danger transition-colors active:bg-panel"
              >
                {t('Sign out')}
              </button>
            </motion.div>
          ) : (
            <motion.div key={section} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
              <div className="flex items-center gap-3">
                <button onClick={() => { setSection(null); if (hash) navigate('/settings', { replace: true }); }} aria-label={t('Back')} className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-ink ring-1 ring-line">
                  <Icon name="chevronLeft" size={20} />
                </button>
                <h1 className="font-display text-[1.5rem] font-bold tracking-tight text-ink">{t(sectionMeta?.title ?? '')}</h1>
              </div>

              {section === 'personal' && (
                <>
                  <div className="mt-5 flex items-center gap-4 rounded-[22px] border border-line bg-surface p-4">
                    {avatar('h-16 w-16')}
                    <div className="min-w-0 flex-1">
                      <button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto} className="btn btn-secondary btn-sm disabled:opacity-60">
                        {uploadingPhoto ? t('Uploading…') : t('Change photo')}
                      </button>
                      <p className="mt-1.5 text-caption text-muted">{t('JPG or PNG, up to 5MB')}</p>
                    </div>
                  </div>
                  <div className="mt-4 divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-surface">
                    <Field label={t('Full name')}><input value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldInput} autoComplete="name" /></Field>
                    <Field label={t('Email')} hint={t('Your email is your sign-in and can’t be changed here.')}><input value={session?.user.email ?? ''} disabled className={fieldInput} /></Field>
                    <Field label={t('Phone')}><input value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldInput} type="tel" autoComplete="tel" /></Field>
                    <Field label={t('Location')}><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, country" className={fieldInput} /></Field>
                  </div>
                  <button onClick={savePersonalInfo} disabled={saving} className="btn btn-primary btn-lg btn-block mt-5 disabled:opacity-60"><ActionLabel busy={saving} busyLabel={t('Saving…')}>{t('Save changes')}</ActionLabel></button>
                </>
              )}

              {section === 'driver' && session && (
                <VerificationFlow userId={session.user.id} verification={verification} onChanged={refreshVerification} focus={hash === '#licence' ? 'licence' : undefined} />
              )}

              {section === 'notifications' && (
                <>
                  <Group>
                    {([
                      { k: 'trips', t: 'Trip updates', d: 'Bookings, reminders, payments and payouts.' },
                      { k: 'messages', t: 'Messages', d: 'Get notified when someone writes to you.' },
                      { k: 'promos', t: 'Promotions & offers', d: 'Occasional deals and CX news.' },
                      { k: 'push', t: 'Push notifications', d: 'Alerts on your phone and browser, even when the site is closed.' },
                    ] as const).map((r) => (
                      <label key={r.k} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5">
                        <div className="min-w-0">
                          <p className="text-body font-medium text-ink">{t(r.t)}</p>
                          <p className="text-detail text-muted">{t(r.d)}</p>
                        </div>
                        <Switch checked={!!platformPrefs[r.k]} onChange={() => flip(r.k)} label={r.t} />
                      </label>
                    ))}
                  </Group>
                  <Group><PushPrompt userId={session?.user.id} variant="row" /></Group>
                  <p className="mt-3 px-1 text-caption text-muted">{t('These choices are saved to your account.')}</p>
                  <p className="mt-6 px-1 text-caption font-semibold uppercase tracking-wide text-muted">{t('Signal Activity')}</p>
                  <Group>
                    {([
                      { k: 'followers', t: 'New followers', d: 'When someone starts following you.' },
                      { k: 'requests', t: 'Accepted requests', d: 'When a follow request of yours is accepted.' },
                      { k: 'circle', t: 'CX Circle', d: 'When you and someone follow each other.' },
                      { k: 'respects', t: 'Grouped Respects', d: 'Respects from people who do not follow you come as one note — never who.' },
                      { k: 'visions', t: 'Visions & Spotlight', d: 'When CX selects or features one of your Visions.' },
                    ] as const).map((r) => (
                      <label key={r.k} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5">
                        <div className="min-w-0">
                          <p className="text-body font-medium text-ink">{t(r.t)}</p>
                          <p className="text-detail text-muted">{t(r.d)}</p>
                        </div>
                        <Switch checked={signalPrefs[r.k]} onChange={() => flipSignal(r.k)} label={r.t} />
                      </label>
                    ))}
                  </Group>
                  <p className="mt-3 px-1 text-caption text-muted">{t('These choices are saved to your account.')}</p>
                </>
              )}

              {section === 'payments' && (
                <>
                  <div className="mt-5 flex gap-3 rounded-[22px] border border-line bg-surface p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink"><Icon name="lock" size={18} /></span>
                    <p className="text-detail leading-relaxed text-muted">{t('You enter your card securely at checkout. CX never stores your card details.')}</p>
                  </div>
                  <Group title={t('Payment history')}>
                    {payments.length === 0 ? (
                      <p className="px-4 py-6 text-center text-detail text-muted">{t('No payments yet.')}</p>
                    ) : (
                      payments.slice(0, 12).map((b) => (
                        <div key={b.id} className="flex items-center gap-3.5 px-4 py-3.5">
                          <Img src={b.car.image} alt="" className="h-11 w-14 shrink-0 rounded-xl object-cover" fallback={<span className="h-11 w-14 shrink-0 rounded-xl bg-panel" />} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body font-medium text-ink">{b.car.make} {b.car.model}</span>
                            <span className="block text-caption text-muted">{fmt(b.startDate)} · {b.reference}</span>
                          </span>
                          <span className="shrink-0 text-body font-semibold text-ink">{eur(b.totalPrice)}</span>
                        </div>
                      ))
                    )}
                  </Group>
                </>
              )}

              {section === 'preferences' && (
                <>
                  <Group>
                    <div className="px-1 py-1"><ThemeSwitch className="rounded-none !px-3 !py-3" /></div>
                  </Group>
                  <div className="h-4" />
                  <Group>
                    {COUNTRIES.filter((c) => c.lang).map((c) => {
                      const on = country?.code === c.code;
                      return (
                        <button key={c.code} onClick={() => { chooseCountry(c.code); haptics.tick(); }} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors active:bg-panel">
                          <span className="text-2xl leading-none">{c.flag}</span>
                          <span className="flex-1 text-body font-medium text-ink">{c.name}</span>
                          {on && <Icon name="check" size={18} className="text-ink" />}
                        </button>
                      );
                    })}
                  </Group>
                  <button onClick={() => { resetCountry(); }} className="mt-4 w-full rounded-[22px] border border-line bg-surface py-3 text-detail font-semibold text-muted transition-colors hover:text-ink">
                    {t('See all countries')}
                  </button>
                  <p className="mt-3 px-1 text-caption text-muted">{t('The site language follows the country you choose.')}</p>
                </>
              )}

              {section === 'security' && (
                <>
                  <DevicesPanel />
                  <div className="mt-5 divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-surface">
                    <Field label={t('New password')} hint={t('At least 8 characters.')}><input type="password" autoComplete="new-password" value={pwd.next} onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))} placeholder="••••••••" className={fieldInput} /></Field>
                    <Field label={t('Confirm new password')}><input type="password" autoComplete="new-password" value={pwd.confirm} onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))} placeholder="••••••••" className={fieldInput} /></Field>
                  </div>
                  <button onClick={changePassword} disabled={pwdSaving || !pwd.next} className="btn btn-primary btn-lg btn-block mt-4 disabled:opacity-50">{pwdSaving ? t('Saving…') : t('Update password')}</button>

                  <div className="mt-8 rounded-[22px] border border-danger/25 bg-danger/[0.03] p-4">
                    <p className="text-body font-semibold text-danger">{t('Delete account')}</p>
                    <p className="mt-1 text-detail leading-relaxed text-muted">
                      Permanently deletes your CX account and all associated data — bookings, messages, favorites, reviews and identity documents. This can&apos;t be undone.
                    </p>
                    <button
                      onClick={() => { haptics.warning(); setDeleteError(null); setDeleteConfirmText(''); setDeleteOpen(true); }}
                      className="btn btn-sm mt-3 border border-danger/40 text-danger hover:bg-danger/10"
                    >
                      <Icon name="info" size={15} /> {t('Delete my account')}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Modal open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} labelledBy="delete-account-title">
        <div className="p-6 sm:p-7">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-danger/10 text-danger">
            <Icon name="info" size={20} />
          </span>
          <h2 id="delete-account-title" className="mt-4 font-display text-xl font-semibold text-ink">Delete your account?</h2>
          <p className="mt-2 text-body leading-relaxed text-muted">
            This permanently deletes your account and everything tied to it — bookings, messages, favorites,
            reviews, and any identity documents you&apos;ve submitted. This cannot be undone.
          </p>
          <label className="mt-4 block">
            <span className="field-label">Type DELETE to confirm</span>
            <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className="input" autoComplete="off" />
          </label>
          {deleteError && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2.5 text-detail text-danger">{deleteError}</p>}
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row-reverse">
            <button onClick={handleDeleteAccount} disabled={deleteConfirmText !== 'DELETE' || deleting} className="btn btn-block bg-danger text-white hover:bg-danger/90 disabled:opacity-50">
              {deleting ? 'Deleting…' : 'Permanently delete my account'}
            </button>
            <button onClick={() => setDeleteOpen(false)} disabled={deleting} className="btn btn-secondary btn-block">Cancel</button>
          </div>
        </div>
      </Modal>
    </DashboardShell>
  );
}
