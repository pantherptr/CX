import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { MotionSheet, Tap, SharedAvatar, motion, AnimatePresence, useReducedMotion, SPRING_SNAPPY } from '../motionKit';
import { ProfileAvatar } from './SignalIdentityBadge';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../lib/store';
import { uploadSignalAvatar, updateSignalProfile, checkUsernameAvailable, setSignalUsername } from '../../lib/data/signalProfile';

const BIO_MAX = 200;
// Mirrors validate_signal_username's own rules exactly (0059's own
// comment) — kept in sync so an invalid shape never gets misreported as
// "Already taken" just because check_signal_username_available had to
// swallow the same validation exception to stay throw-free.
const USERNAME_RE = /^(?!.*__)[a-z0-9](?:[a-z0-9_]{1,18}[a-z0-9])?$/;

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/** One native-feeling field row — a label, a value, and a bottom hairline
 *  standing in for the field's own boundary instead of a bordered box.
 *  Both Username and Bio are built on this so the two read as one
 *  continuous, integrated form rather than two floating input cards. */
function FieldRow({
  label,
  trailing,
  children,
}: {
  label: string;
  /** Right-aligned status/counter next to the label — kept tiny and quiet. */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-line py-3 first:pt-0">
      <div className="flex items-center justify-between">
        <p className="text-micro font-semibold uppercase tracking-wide text-faint">{label}</p>
        {trailing}
      </div>
      {children}
    </div>
  );
}

/** Editing here writes directly to the same `profiles` row Settings.tsx
 *  already edits — the exact same avatar bucket/path convention, the
 *  exact same `bio` column, no second profile system. A new photo or
 *  bio shows up everywhere that row is read from (Messages, Bookings,
 *  the main Settings page, every other SIGNAL surface) the moment
 *  `refreshProfile()` resolves — there's nothing SIGNAL-specific to
 *  re-sync. Reached only from the signed-in user's own profile. */
export function SignalEditProfileSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  /** Fires right after each successful write (photo saves immediately on
   *  pick, username+bio together on the header Save) so the profile page
   *  showing this sheet can patch its own already-fetched state directly
   *  — refreshProfile() alone only updates the global auth context's
   *  copy, not this page's separate fetch_signal_profile result. */
  onSaved: (updates: { bio?: string; avatarUrl?: string; username?: string }) => void;
}) {
  const { session, profile, refreshProfile } = useAuth();
  const { toast } = useApp();
  const reduceMotion = useReducedMotion();
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const originalUsername = profile?.username ?? '';
  const originalBio = profile?.bio ?? '';
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

  const bioChanged = bio.trim() !== originalBio;
  const usernameReady = usernameStatus === 'available';
  const hasChanges = bioChanged || usernameReady;

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
    if (bioChanged) {
      const trimmed = bio.trim();
      const { error } = await updateSignalProfile(session.user.id, { bio: trimmed });
      if (error) {
        setSaving(false);
        toast({ title: 'Could not save your bio', desc: error, icon: 'info' });
        // The username half (if any) already committed for real above —
        // only bio failed, so keep the sheet open with the bio text
        // exactly as typed rather than losing it, but don't re-offer a
        // username save that already succeeded.
        return;
      }
    }
    setSaving(false);
    onSaved({ ...(savedUsername ? { username: savedUsername } : {}), ...(bioChanged ? { bio: bio.trim() } : {}) });
    await refreshProfile();
    toast({ title: 'Profile updated', icon: 'check' });
    requestClose();
  };

  return (
    <MotionSheet
      open={!closing}
      onClose={requestClose}
      onExitComplete={onClose}
      panelClassName="max-h-[80vh] rounded-t-3xl bg-surface sm:h-auto sm:max-h-[70vh] sm:max-w-[380px] sm:rounded-2xl"
    >
      {/* A compact native-style nav bar — back/close on the left, the
          one real action (Save) on the right, nothing competing for
          attention in between. Replaces the old full-width black button
          at the bottom, which read as heavier than the rest of this
          screen ever needed to be. */}
      <div className="flex h-12 shrink-0 items-center border-b border-line px-3">
        <Tap onClick={requestClose} aria-label="Close" scale={0.92} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-panel">
          <Icon name="chevronLeft" size={19} />
        </Tap>
        <span className="flex-1 text-center text-detail font-semibold text-ink">Edit Profile</span>
        <Tap
          onClick={handleSave}
          disabled={saving}
          scale={0.94}
          className={`shrink-0 rounded-full px-3 py-1.5 text-detail font-semibold transition-colors ${
            hasChanges ? 'text-accent-700 hover:bg-accent-050' : 'text-faint'
          }`}
        >
          {saving ? 'Saving…' : 'Save'}
        </Tap>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {/* Photo — smaller, quieter than before: the camera badge alone
            carries the "tap to change" affordance, with a small factual
            caption underneath rather than a standalone green CTA link. */}
        <div className="flex items-center gap-3.5 pb-4">
          <Tap onClick={handlePhotoPick} aria-label="Change profile photo" scale={0.96} className="relative shrink-0">
            <SharedAvatar id="profile-avatar" active>
              <ProfileAvatar src={avatarPreview} size={56} />
            </SharedAvatar>
            <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white ring-2 ring-surface">
              {uploadingPhoto ? <span className="skeleton h-2.5 w-2.5 rounded-full" /> : <Icon name="camera" size={10} />}
            </span>
          </Tap>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <Tap onClick={handlePhotoPick} scale={0.97} className="min-w-0 text-detail font-semibold text-ink">
            Change photo
          </Tap>
        </div>

        <FieldRow
          label="Username"
          trailing={
            <UsernameStatusLabel status={usernameStatus} reduceMotion={Boolean(reduceMotion)} />
          }
        >
          <div className="mt-1 flex items-baseline gap-0.5">
            <span className="text-body text-faint">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
              placeholder="username"
              className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-faint"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          {usernameStatus === 'invalid' && (
            <p className="mt-1 text-caption text-danger">3–20 characters, lowercase letters, numbers, underscore</p>
          )}
        </FieldRow>

        <FieldRow label="Bio" trailing={<span className="text-micro text-faint">{bio.length}/{BIO_MAX}</span>}>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
            rows={3}
            placeholder="Tell the community about yourself…"
            className="mt-1 w-full resize-none bg-transparent text-body leading-relaxed text-ink outline-none placeholder:text-faint"
          />
        </FieldRow>
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
  const color = status === 'available' ? 'text-accent-700' : status === 'taken' ? 'text-danger' : 'text-faint';
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
