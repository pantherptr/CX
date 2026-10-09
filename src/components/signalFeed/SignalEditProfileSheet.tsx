import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { MotionSheet, Tap, SharedAvatar, motion, AnimatePresence, useReducedMotion, SPRING_SNAPPY } from '../motionKit';
import { ProfileAvatar } from './SignalIdentityBadge';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../lib/store';
import { uploadSignalAvatar, uploadSignalCover, updateSignalProfile, checkUsernameAvailable, setSignalUsername, fetchSignalProfile, setMyProfilePrivate } from '../../lib/data/signalProfile';
import { Switch } from '../primitives';
import { CONTACT_WARNING, hasContactInfo } from '../../lib/contactGuard';
import { fetchVisionsEnabled, setMyVisionsEnabled } from '../../lib/data/visions';
import { useLocale } from '../../lib/i18n';

const BIO_MAX = 200;
// Mirrors validate_signal_username's own rules exactly (0059's own
// comment) — kept in sync so an invalid shape never gets misreported as
// "Already taken" just because check_signal_username_available had to
// swallow the same validation exception to stay throw-free.
const USERNAME_RE = /^(?!.*__)[a-z0-9](?:[a-z0-9_]{1,18}[a-z0-9])?$/;

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/** Editing here writes directly to the same `profiles` row Settings.tsx
 *  already edits — the exact same avatar bucket/path convention, the
 *  exact same `bio` column, no second profile system. A new photo or
 *  bio shows up everywhere that row is read from (Messages, Bookings,
 *  the main Settings page, every other SIGNAL surface) the moment
 *  `refreshProfile()` resolves — there's nothing SIGNAL-specific to
 *  re-sync. Reached only from the signed-in user's own profile. */
const BIO_RING_R = 8;
const BIO_RING_CIRCUMFERENCE = 2 * Math.PI * BIO_RING_R;

/** A small filling ring next to the bio counter — the same idea as
 *  Twitter/X's compose-box character ring, sized down to sit inline
 *  next to a field label instead of floating over a whole textarea.
 *  Ported from Magic UI's AnimatedCircularProgressBar concept (its own
 *  version is a large 100px+ dashboard gauge) down to this field row's
 *  actual scale — pure SVG, no dependency either way. */
function BioRing({ value, max }: { value: number; max: number }) {
  const ratio = Math.min(1, value / max);
  const nearLimit = ratio >= 0.9;
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" className="shrink-0 -rotate-90">
      <circle cx={10} cy={10} r={BIO_RING_R} fill="none" strokeWidth={2.5} className="stroke-white/20" />
      <circle
        cx={10}
        cy={10}
        r={BIO_RING_R}
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={BIO_RING_CIRCUMFERENCE}
        strokeDashoffset={BIO_RING_CIRCUMFERENCE * (1 - ratio)}
        className={`transition-[stroke-dashoffset,stroke] duration-200 ease-out ${nearLimit ? 'stroke-[#ff8a80]' : 'stroke-accent-bright'}`}
      />
    </svg>
  );
}

export function SignalEditProfileSheet({
  onClose,
  onSaved,
  initialCoverUrl = null,
  onVisionsChange,
}: {
  onClose: () => void;
  /** The current cover photo, if the profile has one. */
  initialCoverUrl?: string | null;
  /** Visions was switched on/off here — the profile page shows/hides its tab. */
  onVisionsChange?: (enabled: boolean) => void;
  /** Fires right after each successful write (photo saves immediately on
   *  pick, username+bio together on the header Save) so the profile page
   *  showing this sheet can patch its own already-fetched state directly
   *  — refreshProfile() alone only updates the global auth context's
   *  copy, not this page's separate fetch_signal_profile result. */
  onSaved: (updates: { bio?: string; avatarUrl?: string; username?: string; fullName?: string; coverUrl?: string | null }) => void;
}) {
  const { session, profile, refreshProfile } = useAuth();
  const { toast } = useApp();
  const reduceMotion = useReducedMotion();
  const { t } = useLocale();
  const [isPrivate, setIsPrivate] = useState(false);
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    let cancelled = false;
    fetchSignalProfile(uid).then((p) => { if (!cancelled && p) setIsPrivate(p.isPrivate); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [session?.user.id]);
  const togglePrivate = async (next: boolean) => {
    setIsPrivate(next);
    const { error } = await setMyProfilePrivate(next);
    if (error) {
      setIsPrivate(!next);
      toast({ title: 'Could not update privacy', desc: error, icon: 'info' });
    }
  };
  const [visionsOn, setVisionsOn] = useState(false);
  const [visionsBusy, setVisionsBusy] = useState(false);
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    let cancelled = false;
    fetchVisionsEnabled(uid).then((on) => { if (!cancelled) setVisionsOn(on); });
    return () => { cancelled = true; };
  }, [session?.user.id]);
  const toggleVisions = async () => {
    if (visionsBusy) return;
    setVisionsBusy(true);
    const next = !visionsOn;
    const { error } = await setMyVisionsEnabled(next);
    setVisionsBusy(false);
    if (error) {
      toast({ title: 'Could not update Visions', desc: error, icon: 'info' });
      return;
    }
    setVisionsOn(next);
    onVisionsChange?.(next);
  };
  // A short local "closing" flag, exactly like useSheetDrag's own —
  // MotionSheet needs `open` to flip false while still mounted so its
  // exit animation can play, then reports back via `onExitComplete` once
  // that's genuinely finished, which is when the real `onClose` (the one
  // that unmounts this whole component) actually fires.
  const [closing, setClosing] = useState(false);
  const requestClose = () => setClosing(true);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(initialCoverUrl);
  const [uploadingCover, setUploadingCover] = useState(false);

  const originalUsername = profile?.username ?? '';
  const originalBio = profile?.bio ?? '';
  const originalName = profile?.full_name ?? '';
  const [name, setName] = useState(originalName);
  const [username, setUsername] = useState(originalUsername);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');

  // Live availability check, debounced — never fires for the user's own
  // unchanged username (that's always "available" to them) or while the
  // format itself is invalid, so we don't waste a round trip on
  // something check_signal_username_available would just reject anyway.
  useEffect(() => {
    const trimmed = username.trim().toLowerCase();
    if (trimmed === originalUsername.toLowerCase()) {
      setUsernameStatus('idle');
      return;
    }
    if (!trimmed) {
      setUsernameStatus('idle');
      return;
    }
    if (!USERNAME_RE.test(trimmed)) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    let cancelled = false;
    const timer = setTimeout(async () => {
      const available = await checkUsernameAvailable(trimmed);
      if (!cancelled) setUsernameStatus(available ? 'available' : 'taken');
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [username, originalUsername]);

  const handlePhotoPick = () => fileInputRef.current?.click();

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session) return;
    setUploadingPhoto(true);
    const { url, error } = await uploadSignalAvatar(session.user.id, file);
    if (!url || error) {
      setUploadingPhoto(false);
      toast({ title: 'Could not upload photo', desc: error ?? undefined, icon: 'info' });
      return;
    }
    const { error: saveError } = await updateSignalProfile(session.user.id, { avatarUrl: url });
    setUploadingPhoto(false);
    if (saveError) {
      toast({ title: 'Could not save photo', desc: saveError, icon: 'info' });
      return;
    }
    setAvatarPreview(url);
    onSaved({ avatarUrl: url });
    await refreshProfile();
    toast({ title: 'Profile photo updated', icon: 'check' });
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session) return;
    setUploadingCover(true);
    const { url, error } = await uploadSignalCover(session.user.id, file);
    if (!url || error) {
      setUploadingCover(false);
      toast({ title: 'Could not upload photo', desc: error ?? undefined, icon: 'info' });
      return;
    }
    const { error: saveError } = await updateSignalProfile(session.user.id, { coverUrl: url });
    setUploadingCover(false);
    if (saveError) {
      toast({ title: 'Could not save photo', desc: saveError, icon: 'info' });
      return;
    }
    setCoverPreview(url);
    onSaved({ coverUrl: url });
    toast({ title: 'Cover photo updated', icon: 'check' });
  };

  const handleCoverRemove = async () => {
    if (!session || !coverPreview) return;
    setUploadingCover(true);
    const { error } = await updateSignalProfile(session.user.id, { coverUrl: null });
    setUploadingCover(false);
    if (error) {
      toast({ title: 'Could not save changes', desc: error, icon: 'info' });
      return;
    }
    setCoverPreview(null);
    onSaved({ coverUrl: null });
  };

  const bioChanged = bio.trim() !== originalBio;
  const nameChanged = name.trim() !== originalName.trim();
  const usernameReady = usernameStatus === 'available';
  const hasChanges = bioChanged || nameChanged || usernameReady;

  // One combined Save — username (only when it's a real, checked-available
  // change) claimed first since it's the harder, uniqueness-constrained
  // write, then bio. Keeps both underlying calls (setSignalUsername,
  // updateSignalProfile) exactly as they were; this just orchestrates them
  // behind the one action a native "Done" button implies, instead of two
  // separate buttons the user has to know to press independently. A
  // failure at either step keeps the sheet open with everything the user
  // typed still intact — never silently drops their edit.
  const handleSave = async () => {
    if (!session || saving) return;
    if (!hasChanges) {
      requestClose();
      return;
    }
    if ((bioChanged && hasContactInfo(bio)) || (nameChanged && hasContactInfo(name))) {
      toast({ title: 'Keep it inside CX', desc: CONTACT_WARNING, icon: 'shield' });
      return;
    }
    if (nameChanged && (name.trim().length < 2 || name.trim().length > 60)) {
      toast({ title: 'Please enter your name.', desc: '2–60 characters.', icon: 'info' });
      return;
    }
    setSaving(true);
    let savedUsername: string | undefined;
    if (usernameReady) {
      const { username: saved, error } = await setSignalUsername(username.trim().toLowerCase());
      if (error || !saved) {
        setSaving(false);
        toast({ title: 'Could not save username', desc: error ?? undefined, icon: 'info' });
        return;
      }
      savedUsername = saved;
      setUsername(saved);
      setUsernameStatus('idle');
    }
    if (bioChanged || nameChanged) {
      const { error } = await updateSignalProfile(session.user.id, {
        ...(bioChanged ? { bio: bio.trim() } : {}),
        ...(nameChanged ? { fullName: name.trim() } : {}),
      });
      if (error) {
        setSaving(false);
        toast({ title: 'Could not save changes', desc: error, icon: 'info' });
        // The username half (if any) already committed for real above —
        // only bio failed, so keep the sheet open with the bio text
        // exactly as typed rather than losing it, but don't re-offer a
        // username save that already succeeded.
        return;
      }
    }
    setSaving(false);
    onSaved({
      ...(savedUsername ? { username: savedUsername } : {}),
      ...(bioChanged ? { bio: bio.trim() } : {}),
      ...(nameChanged ? { fullName: name.trim() } : {}),
    });
    await refreshProfile();
    toast({ title: 'Profile updated', icon: 'check' });
    // A quiet confirmation bump on the button itself — same "just X"
    // language FollowButton's own justFollowed already uses — before the
    // sheet closes, so the save doesn't just silently vanish.
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 220);
    window.setTimeout(requestClose, 220);
  };

  // One dialog, same family as the rest of the dark surfaces: a title and a
  // line of explanation, then labelled rows (label left, field right) and a
  // single "Save changes" at the bottom right.
  const fieldBox =
    'rounded-lg border border-white/15 bg-white/[0.04] transition-colors focus-within:border-white/60';
  const labelCls = 'text-detail font-semibold text-on-noir sm:text-right';

  return (
    <MotionSheet
      open={!closing}
      onClose={requestClose}
      onExitComplete={onClose}
      panelClassName="max-h-[88vh] w-full rounded-t-3xl border border-white/10 bg-noir text-on-noir shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] sm:h-auto sm:max-w-[34rem] sm:rounded-2xl"
    >
      <div data-surface="noir" className="relative flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-7">
        <Tap
          onClick={requestClose}
          aria-label="Close"
          scale={0.9}
          className="absolute right-4 top-3 grid h-9 w-9 place-items-center rounded-full text-on-noir-muted transition-colors hover:bg-white/10 hover:text-on-noir sm:top-5"
        >
          <Icon name="x" size={18} />
        </Tap>

        <h2 className="pr-10 font-display text-xl font-semibold text-on-noir sm:text-2xl">Edit profile</h2>
        <p className="mt-2 max-w-md text-detail leading-relaxed text-on-noir-muted">
          Make changes to your profile here. Click save when you’re done.
        </p>

        <div className="mt-6 grid gap-5">
          {/* Photo */}
          <div className="grid items-center gap-2 sm:grid-cols-[6rem_1fr] sm:gap-4">
            <p className={labelCls}>Photo</p>
            <div className="flex items-center gap-3.5">
              <Tap onClick={handlePhotoPick} aria-label="Change profile photo" scale={0.96} className="relative shrink-0">
                <SharedAvatar id="profile-avatar" active>
                  <ProfileAvatar src={avatarPreview} size={56} />
                </SharedAvatar>
                <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-white text-noir ring-2 ring-noir">
                  {uploadingPhoto ? <span className="skeleton h-2.5 w-2.5 rounded-full" /> : <Icon name="camera" size={10} />}
                </span>
              </Tap>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              <Tap
                onClick={handlePhotoPick}
                scale={0.97}
                className="rounded-lg border border-white/15 px-3.5 py-2 text-detail font-semibold text-on-noir transition-colors hover:border-white/40 hover:bg-white/5"
              >
                Change photo
              </Tap>
            </div>
          </div>

          {/* Cover — the big photo on the SIGNAL card; without one, the profile picture is used */}
          <div className="grid items-center gap-2 sm:grid-cols-[6rem_1fr] sm:gap-4">
            <p className={labelCls}>Cover</p>
            <div className="flex items-center gap-3.5">
              <Tap onClick={() => coverInputRef.current?.click()} aria-label="Change cover photo" scale={0.96} className="relative h-[4.5rem] w-14 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-white/[0.04]">
                {coverPreview ? (
                  <img src={coverPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-on-noir-muted"><Icon name="image" size={18} /></span>
                )}
                {uploadingCover && <span className="skeleton absolute inset-0" />}
              </Tap>
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
              <div className="flex flex-wrap gap-2">
                <Tap
                  onClick={() => coverInputRef.current?.click()}
                  scale={0.97}
                  className="rounded-lg border border-white/15 px-3.5 py-2 text-detail font-semibold text-on-noir transition-colors hover:border-white/40 hover:bg-white/5"
                >
                  {coverPreview ? 'Change cover' : 'Add cover'}
                </Tap>
                {coverPreview && (
                  <Tap onClick={handleCoverRemove} scale={0.97} className="rounded-lg px-3 py-2 text-detail font-semibold text-on-noir-muted transition-colors hover:text-on-noir">
                    Remove
                  </Tap>
                )}
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="grid gap-2 sm:grid-cols-[6rem_1fr] sm:items-start sm:gap-4">
            <label htmlFor="signal-name" className={`${labelCls} sm:pt-3`}>Name</label>
            <div className={`px-3.5 ${fieldBox}`}>
              <input
                id="signal-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                placeholder="Your name"
                autoComplete="name"
                className="w-full bg-transparent py-3 text-body text-on-noir outline-none placeholder:text-on-noir-muted/60"
              />
            </div>
          </div>

          {/* Username */}
          <div className="grid gap-2 sm:grid-cols-[6rem_1fr] sm:items-start sm:gap-4">
            <label htmlFor="signal-username" className={`${labelCls} sm:pt-3`}>Username</label>
            <div>
              <div className={`flex items-center gap-1 px-3.5 ${fieldBox}`}>
                <span className="text-body text-on-noir-muted">@</span>
                <input
                  id="signal-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
                  placeholder="username"
                  className="min-w-0 flex-1 bg-transparent py-3 text-body text-on-noir outline-none placeholder:text-on-noir-muted/60"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <UsernameStatusLabel status={usernameStatus} reduceMotion={Boolean(reduceMotion)} />
              </div>
              {usernameStatus === 'invalid' && (
                <p className="mt-1.5 text-caption text-[#ff8a80]">3–20 characters, lowercase letters, numbers, underscore</p>
              )}
            </div>
          </div>

          {/* Bio */}
          <div className="grid gap-2 sm:grid-cols-[6rem_1fr] sm:items-start sm:gap-4">
            <label htmlFor="signal-bio" className={`${labelCls} sm:pt-3`}>Bio</label>
            <div>
              <div className={`px-3.5 py-3 ${fieldBox}`}>
                <textarea
                  id="signal-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                  rows={4}
                  placeholder="Tell the community about yourself…"
                  className="w-full resize-none bg-transparent text-body leading-relaxed text-on-noir outline-none placeholder:text-on-noir-muted/60"
                />
              </div>
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <span className="text-micro text-on-noir-muted">{bio.length}/{BIO_MAX}</span>
                <BioRing value={bio.length} max={BIO_MAX} />
              </div>
            </div>
          </div>

          {/* Private profile — people must ask to follow you */}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
            <div className="min-w-0">
              <p className="text-body font-semibold text-on-noir">{t('Private profile')}</p>
              <p className="mt-1 text-caption leading-relaxed text-on-noir-muted">{t('Only people you accept can follow you and see your posts, Stories and Visions.')}</p>
            </div>
            <Switch checked={isPrivate} onChange={(v) => void togglePrivate(v)} label={t('Private profile')} />
          </div>

          {/* CX Visions — opt-in portfolio; untouched unless the user taps it */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
            <p className="text-micro font-semibold uppercase tracking-[0.24em] text-on-noir-muted">CX Visions</p>
            <p className="mt-2 font-display text-[17px] font-semibold leading-snug text-on-noir">{t('The world, through your lens.')}</p>
            <p className="mt-1.5 text-detail leading-relaxed text-on-noir-muted">
              {visionsOn
                ? t('Visions is on. Add your photos and videos from the Visions tab on your profile.')
                : t('Your photo and video portfolio inside CX. Each week the CX team features one or two of the best in Signal Spotlight.')}
            </p>
            <Tap
              onClick={toggleVisions}
              disabled={visionsBusy}
              scale={0.97}
              className={`mt-3 inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-detail font-semibold transition-colors disabled:opacity-60 ${
                visionsOn ? 'border border-white/15 text-on-noir hover:border-white/40 hover:bg-white/5' : 'bg-white text-noir hover:bg-white/90'
              }`}
            >
              {visionsOn ? t('Turn off Visions') : t('Turn on Visions')}
            </Tap>
            {visionsOn && <p className="mt-2 text-caption text-on-noir-muted">{t('Turning it off hides the tab; your selection is kept.')}</p>}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Tap
            onClick={handleSave}
            disabled={saving}
            scale={0.96}
            animate={{ scale: justSaved ? 1.06 : 1 }}
            transition={{ scale: reduceMotion ? { duration: 0 } : SPRING_SNAPPY }}
            className="inline-flex min-w-[9.5rem] items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-body font-semibold text-noir transition-colors hover:bg-white/90 disabled:opacity-70"
          >
            {justSaved ? <Icon name="check" size={16} strokeWidth={3} /> : saving ? 'Saving…' : 'Save changes'}
          </Tap>
        </div>
      </div>
    </MotionSheet>
  );
}

/** The username field's own quiet status word, right-aligned next to its
 *  label — a small Motion crossfade between states (idle/checking/
 *  available/taken) so it reads as one continuously-updating word rather
 *  than text popping in and out. */
function UsernameStatusLabel({ status, reduceMotion }: { status: UsernameStatus; reduceMotion: boolean }) {
  if (status === 'idle' || status === 'invalid') return null;
  const copy = status === 'checking' ? 'Checking…' : status === 'available' ? 'Available' : 'Taken';
  const color = status === 'available' ? 'text-accent-bright' : status === 'taken' ? 'text-[#ff8a80]' : 'text-on-noir-muted';
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={status}
        initial={reduceMotion ? undefined : { opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SNAPPY}
        className={`flex items-center gap-1 text-micro font-semibold ${color}`}
      >
        {status === 'available' && <Icon name="check" size={10} strokeWidth={3} />}
        {copy}
      </motion.span>
    </AnimatePresence>
  );
}
