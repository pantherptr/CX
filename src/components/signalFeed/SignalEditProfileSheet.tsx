import { useRef, useState } from 'react';
import { Icon } from '../Icon';
import { useSheetDrag } from '../motion';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../lib/store';
import { uploadSignalAvatar, updateSignalProfile } from '../../lib/data/signalProfile';

const BIO_MAX = 200;

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
   *  pick, bio on Save) so the profile page showing this sheet can patch
   *  its own already-fetched state directly — refreshProfile() alone
   *  only updates the global auth context's copy, not this page's
   *  separate fetch_signal_profile result. */
  onSaved: (updates: { bio?: string; avatarUrl?: string }) => void;
}) {
  const { session, profile, refreshProfile } = useAuth();
  const { toast } = useApp();
  const { handlers, style, closing, requestClose } = useSheetDrag(onClose);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSaveBio = async () => {
    if (!session) return;
    setSaving(true);
    const trimmed = bio.trim();
    const { error } = await updateSignalProfile(session.user.id, { bio: trimmed });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save your bio', desc: error, icon: 'info' });
      return;
    }
    onSaved({ bio: trimmed });
    await refreshProfile();
    toast({ title: 'Profile updated', icon: 'check' });
    requestClose();
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 animate-fade-in sm:items-center"
      style={{ opacity: closing ? 0 : undefined, transition: 'opacity 220ms var(--ease-out-expo)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface animate-sheet-in sm:h-auto sm:max-h-[75vh] sm:max-w-sm sm:rounded-2xl"
        style={style}
      >
        <div {...handlers} className="flex flex-col items-center pt-2 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-line" aria-hidden="true" />
        </div>
        <div {...handlers} className="flex items-center gap-2 border-b border-line px-5 py-4">
          <span className="font-display font-semibold text-ink">Edit Profile</span>
          <button onClick={requestClose} aria-label="Close" className="pressable ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
            <Icon name="x" size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col items-center gap-2">
            <button onClick={handlePhotoPick} aria-label="Change profile photo" className="pressable relative">
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <span className="grid h-20 w-20 place-items-center rounded-full bg-panel text-ink-soft">
                  <Icon name="user" size={32} />
                </span>
              )}
              <span className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full bg-ink text-white ring-2 ring-surface">
                {uploadingPhoto ? <span className="skeleton h-3 w-3 rounded-full" /> : <Icon name="camera" size={13} />}
              </span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            <button onClick={handlePhotoPick} className="pressable text-caption font-semibold text-accent-700">
              Change photo
            </button>
          </div>

          <p className="mb-1.5 mt-5 text-caption font-semibold uppercase tracking-wide text-faint">Bio</p>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
            rows={4}
            placeholder="Tell the community about yourself…"
            className="input resize-none !py-2.5"
          />
          <p className="mt-1 text-right text-caption text-faint">{bio.length}/{BIO_MAX}</p>

          <button onClick={handleSaveBio} disabled={saving} className="btn btn-primary btn-block mt-3 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
