import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { Img, vibrateTap } from '../motion';
import {
  createEmpirePost, updateEmpirePost, uploadEmpirePostMedia, mediaKindFromPath,
  type EmpirePost, type EmpireVehicleRef,
} from '../../lib/data/empireFeed';
import { validateVideoFile, VIDEO_MIME_TYPES } from '../../lib/media';
import {
  MAX_MEDIA, MAX_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_DURATION_SEC, ACCEPTED_TYPES, type PendingMedia,
} from './SignalPostComposer';
import { useAuth } from '../../lib/auth';
import { fetchHostCars } from '../../lib/data/cars';
import type { Car } from '../../data/types';
import { ProfileAvatar } from './SignalIdentityBadge';
import { motion, AnimatePresence, useReducedMotion, SPRING_SMOOTH, SPRING_SNAPPY, Tap } from '../motionKit';

const MAX_COLLAPSED_HEIGHT = 22; // px — matches one line of text-body, before it ever grows
const MAX_TEXTAREA_HEIGHT = 220; // px — caps auto-grow; content beyond this scrolls inside instead

/** SIGNAL Community's own composer — an original CX Rent take on a
 *  native social-app composer (X/Twitter's interaction density and
 *  structure as a reference for UX shape only — no shared branding,
 *  colors, icons or layout copied), replacing what used to be a form-
 *  card shared with Official publishing.
 *
 *  Deliberately its own component rather than a `mode` branch on
 *  `SignalPostComposer`: Official's picker/categories/title genuinely
 *  don't exist here (Community has no editorial system at all — the
 *  server forces `category: 'community'` regardless), and the two now
 *  share nothing UI-shaped worth a common render path. What they DO
 *  share (media staging limits/validation, the upload+publish RPCs) is
 *  imported from `SignalPostComposer` itself rather than duplicated.
 *
 *  One persistent bar, not a modal: collapsed it's just the real avatar
 *  (same identity system as everywhere else in the app — never a
 *  separate SIGNAL one) next to a single line of placeholder text;
 *  tapping/focusing it expands in place (Motion's own `layout`
 *  animation, a soft spring — see motionKit's own guidance on why a
 *  large surface gets `SPRING_SMOOTH` rather than the snappier default)
 *  to a real multi-line textarea with a compact Photo/Video (/Vehicle,
 *  Host-only) icon row and one Publish action. Collapses itself back
 *  down on blur once genuinely empty; a non-empty draft only ever
 *  closes through the explicit ✕, and only after confirming if there's
 *  something to lose.
 *
 *  `editing` reuses this same component in place of a post's own card
 *  (SignalPostCard's "Edit post") — always rendered open, pre-filled,
 *  no collapse behavior (there's nothing to collapse back into there). */
export function SignalCommunityComposer({
  editing,
  expanded = false,
  onExpand,
  onCollapse,
  onCancel,
  onDone,
}: {
  editing?: EmpirePost;
  /** Forces the composer open from outside (e.g. the Quick Control's
   *  "Create Post" shortcut) — the composer also opens itself the
   *  moment the user taps/focuses it directly, so this only matters for
   *  triggering it from elsewhere in the UI. */
  expanded?: boolean;
  /** Fired the moment a still-collapsed composer is focused, so a
   *  caller-owned `expanded` can track reality if it cares to. */
  onExpand?: () => void;
  /** Fired when an empty composer collapses (blur) or a non-empty one
   *  is explicitly dismissed and confirmed — never fired while `editing`. */
  onCollapse?: () => void;
  /** `editing` only — backs out of an edit-in-progress with no confirm,
   *  same as the original form's own Cancel button. Unused otherwise:
   *  the persistent bar's own dismiss is `onCollapse`, above. */
  onCancel?: () => void;
  onDone: (post: EmpirePost) => void;
}) {
  const { profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const objectUrls = useRef<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const blurTimerRef = useRef<number>(0);

  const [focused, setFocused] = useState(false);
  const [body, setBody] = useState(editing?.body ?? '');
  const [existingPaths, setExistingPaths] = useState<string[]>(editing?.mediaPaths ?? []);
  const [existingUrls, setExistingUrls] = useState<string[]>(editing?.mediaUrls ?? []);
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [validatingVideo, setValidatingVideo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState(false);

  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [hostCars, setHostCars] = useState<Car[] | null>(null);
  const [loadingCars, setLoadingCars] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<EmpireVehicleRef | null>(editing?.vehicle ?? null);
  const canAttachVehicle = Boolean(profile?.is_host);

  const totalMedia = existingPaths.length + pending.length;
  const isOpen = Boolean(editing) || expanded || focused || body.trim().length > 0 || totalMedia > 0;
  const canPublish = (body.trim().length > 0 || totalMedia > 0) && !submitting;

  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => () => window.clearTimeout(blurTimerRef.current), []);

  // Auto-grow — recomputed on every keystroke and whenever the composer
  // opens/closes, capped so a very long draft scrolls inside itself
  // rather than pushing the whole feed down indefinitely.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!isOpen) {
      el.style.height = `${MAX_COLLAPSED_HEIGHT}px`;
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [body, isOpen]);

  const carToVehicleRef = (car: Car): EmpireVehicleRef => ({
    id: car.id, slug: car.slug, make: car.make, model: car.model, year: car.year,
    city: car.city, pricePerDay: car.pricePerDay, imageUrl: car.images[0] ?? null,
  });

  const openVehiclePicker = () => {
    setVehiclePickerOpen((v) => !v);
    if (!hostCars && !loadingCars && profile?.id) {
      setLoadingCars(true);
      fetchHostCars(profile.id).then(setHostCars).catch(() => setHostCars([])).finally(() => setLoadingCars(false));
    }
  };

  const addImageFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted: PendingMedia[] = [];
    let firstError: string | null = null;
    for (const file of Array.from(list)) {
      if (totalMedia + accepted.length >= MAX_MEDIA) {
        firstError ??= `You can add up to ${MAX_MEDIA} items.`;
        break;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        firstError ??= `“${file.name}” must be a JPEG, PNG or WebP image.`;
        continue;
      }
      if (file.size > MAX_BYTES) {
        firstError ??= `“${file.name}” is larger than 5MB.`;
        continue;
      }
      const preview = URL.createObjectURL(file);
      objectUrls.current.push(preview);
      accepted.push({ file, preview, mediaKind: 'image' });
    }
    if (accepted.length) setPending((p) => [...p, ...accepted]);
    setMediaError(firstError);
  };

  const addVideoFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setValidatingVideo(true);
    setMediaError(null);
    try {
      const accepted: PendingMedia[] = [];
      let firstError: string | null = null;
      for (const file of Array.from(list)) {
        if (totalMedia + accepted.length >= MAX_MEDIA) {
          firstError ??= `You can add up to ${MAX_MEDIA} items.`;
          break;
        }
        const result = await validateVideoFile(file, { maxBytes: MAX_VIDEO_BYTES, maxDurationSec: MAX_VIDEO_DURATION_SEC });
        if (!result.ok) {
          firstError ??= result.error ?? `"${file.name}" couldn't be added.`;
          continue;
        }
        const preview = URL.createObjectURL(file);
        objectUrls.current.push(preview);
        accepted.push({ file, preview, mediaKind: 'video' });
      }
      if (accepted.length) setPending((p) => [...p, ...accepted]);
      setMediaError(firstError);
    } finally {
      setValidatingVideo(false);
    }
  };

  const removeExisting = (index: number) => {
    setExistingPaths((p) => p.filter((_, i) => i !== index));
    setExistingUrls((u) => u.filter((_, i) => i !== index));
  };

  const removePending = (index: number) => {
    setPending((p) => {
      const target = p[index];
      if (target) URL.revokeObjectURL(target.preview);
      return p.filter((_, i) => i !== index);
    });
    setMediaError(null);
  };

  const resetDraft = () => {
    setBody('');
    pending.forEach((m) => URL.revokeObjectURL(m.preview));
    setPending([]);
    setExistingPaths([]);
    setExistingUrls([]);
    setSelectedVehicle(null);
    setVehiclePickerOpen(false);
    setMediaError(null);
    setError(null);
  };

  // Clicking a toolbar control (Photo/Video/Vehicle/Publish/✕) must never
  // fight the textarea's own blur-to-collapse behavior below — preventing
  // the mousedown's default keeps focus exactly where it already is
  // instead of racing a blur event against the click that follows it.
  const holdFocus = (e: React.MouseEvent) => e.preventDefault();

  const handleFocus = () => {
    window.clearTimeout(blurTimerRef.current);
    if (!focused && !expanded) onExpand?.();
    setFocused(true);
  };

  // A short grace window rather than collapsing the instant focus
  // leaves the textarea — opening a file picker (Photo/Video) also
  // blurs it, and by the time this fires, a chosen file has already
  // landed in `pending`, so a real selection never gets mistaken for
  // "the user walked away from an empty composer."
  const handleBlur = () => {
    setFocused(false);
    if (editing) return;
    blurTimerRef.current = window.setTimeout(() => {
      if (body.trim().length === 0 && totalMedia === 0) onCollapse?.();
    }, 160);
  };

  const handleClose = () => {
    window.clearTimeout(blurTimerRef.current);
    const hasDraft = body.trim().length > 0 || totalMedia > 0;
    if (hasDraft && !window.confirm('Discard this post?')) return;
    resetDraft();
    setFocused(false);
    onCollapse?.();
  };

  const handleSubmit = async () => {
    if (!canPublish) return;
    setSubmitting(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const media of pending) {
        const { path } = await uploadEmpirePostMedia(media.file);
        uploaded.push(path);
      }
      const mediaPaths = [...existingPaths, ...uploaded];
      const input = {
        category: 'community' as const, body: body.trim(), mediaPaths, publisherType: 'self' as const,
        vehicleId: selectedVehicle?.id ?? null,
      };
      const result = editing ? await updateEmpirePost(editing.id, input) : await createEmpirePost(input);
      if (result.error || !result.post) {
        setError(result.error ?? 'Something went wrong — try again.');
        return;
      }
      // create_empire_post returns a bare row with no joined author
      // columns (see mapCreatedPost) — Official's own composer got away
      // with leaving those blank because it always did a full `refresh()`
      // afterward, which re-fetches through the real join. This composer
      // prepends the post locally instead (no reload, no scroll jump —
      // see SignalCommunityComposer's own header comment), so a blank
      // name/avatar would actually be visible; filled in here from the
      // real signed-in profile already on hand, same reasoning the
      // original code already applied to `vehicle`.
      const finalPost: EmpirePost = editing ? {
        ...result.post,
        likeCount: editing.likeCount, commentCount: editing.commentCount, saveCount: editing.saveCount,
        viewCount: editing.viewCount, shareCount: editing.shareCount, likedByMe: editing.likedByMe, savedByMe: editing.savedByMe,
        authorUsername: editing.authorUsername,
        authorIsOwner: editing.authorIsOwner, authorIsAdmin: editing.authorIsAdmin,
        authorIsHost: editing.authorIsHost, authorIsVerifiedClient: editing.authorIsVerifiedClient,
        pinnedToProfile: editing.pinnedToProfile, isArchived: editing.isArchived,
        vehicle: selectedVehicle,
      } : {
        ...result.post,
        authorName: profile?.full_name || 'CX Rent user',
        authorAvatarUrl: profile?.avatar_url ?? null,
        authorUsername: profile?.username ?? null,
        authorRole: profile?.is_host ? 'host' : 'client',
        authorIsOwner: Boolean(profile?.is_owner),
        authorIsAdmin: Boolean(profile?.is_admin),
        authorIsHost: Boolean(profile?.is_host),
        authorIsVerifiedClient: Boolean(profile?.is_verified_client),
        vehicle: selectedVehicle,
      };
      if (!editing) {
        vibrateTap();
        setJustPublished(true);
        window.setTimeout(() => setJustPublished(false), 260);
        resetDraft();
      }
      onDone(finalPost);
    } finally {
      setSubmitting(false);
    }
  };

  const avatarFallback = (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel text-ink-soft">
      <Icon name="user" size={18} />
    </span>
  );

  return (
    <motion.div layout={!reduceMotion} transition={SPRING_SMOOTH} className={`mb-3 rounded-2xl border border-line bg-surface px-3.5 py-3 ${isOpen ? '' : 'transition-colors hover:border-line-strong'}`}>
      <div className="flex items-start gap-2.5">
        {profile?.avatar_url ? (
          <ProfileAvatar src={profile.avatar_url} size={36} />
        ) : avatarFallback}

        <div className="min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="Share something with the community…"
            rows={1}
            className="w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-body leading-[22px] text-ink placeholder:text-muted focus:outline-none focus:ring-0"
            style={{ height: MAX_COLLAPSED_HEIGHT, maxHeight: MAX_TEXTAREA_HEIGHT, overflowY: 'auto' }}
          />

          <AnimatePresence initial={false}>
            {isOpen && (existingUrls.length > 0 || pending.length > 0) && (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                transition={SPRING_SMOOTH}
                className="overflow-hidden"
              >
                <div className="mt-2.5 flex gap-2 overflow-x-auto no-scrollbar">
                  {existingUrls.map((url, i) => {
                    const isVideo = mediaKindFromPath(url) === 'video';
                    return (
                      <div key={`existing-${url}`} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-panel">
                        {isVideo ? (
                          <video src={url} muted playsInline className="h-full w-full object-cover" />
                        ) : (
                          <Img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover"
                            fallback={<span className="grid h-full w-full place-items-center text-muted"><Icon name="image" size={14} /></span>}
                          />
                        )}
                        {isVideo && (
                          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/20">
                            <Icon name="play" size={14} className="text-white" />
                          </div>
                        )}
                        <button
                          onMouseDown={holdFocus}
                          onClick={() => removeExisting(i)}
                          aria-label="Remove media"
                          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white"
                        >
                          <Icon name="x" size={11} />
                        </button>
                      </div>
                    );
                  })}
                  {pending.map((media, i) => (
                    <div key={media.preview} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-panel">
                      {media.mediaKind === 'video' ? (
                        <video src={media.preview} muted playsInline className="h-full w-full object-cover" />
                      ) : (
                        <img src={media.preview} alt="" className="h-full w-full object-cover" />
                      )}
                      {media.mediaKind === 'video' && (
                        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/20">
                          <Icon name="play" size={14} className="text-white" />
                        </div>
                      )}
                      <button
                        onMouseDown={holdFocus}
                        onClick={() => removePending(i)}
                        aria-label="Remove media"
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white"
                      >
                        <Icon name="x" size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {mediaError && <p className="mt-1.5 text-caption font-medium text-danger">{mediaError}</p>}
          {error && <p className="mt-1.5 text-caption font-medium text-danger">{error}</p>}

          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                transition={SPRING_SMOOTH}
                className="overflow-hidden"
              >
                <div className="mt-2.5 flex items-center gap-0.5 border-t border-line pt-2.5">
                  <label
                    onMouseDown={holdFocus}
                    aria-label="Add photo"
                    className={`pressable grid h-8 w-8 cursor-pointer place-items-center rounded-full text-accent-700 transition-colors hover:bg-accent-050 ${totalMedia >= MAX_MEDIA ? 'pointer-events-none opacity-40' : ''}`}
                  >
                    <Icon name="image" size={18} />
                    <input
                      type="file"
                      accept={ACCEPTED_TYPES.join(',')}
                      multiple
                      className="hidden"
                      onChange={(e) => { addImageFiles(e.target.files); e.target.value = ''; }}
                    />
                  </label>
                  <label
                    onMouseDown={holdFocus}
                    aria-label="Add video"
                    className={`pressable grid h-8 w-8 cursor-pointer place-items-center rounded-full text-accent-700 transition-colors hover:bg-accent-050 ${totalMedia >= MAX_MEDIA || validatingVideo ? 'pointer-events-none opacity-40' : ''}`}
                  >
                    {validatingVideo ? <span className="skeleton h-4 w-4 rounded-full" /> : <Icon name="play" size={18} />}
                    <input
                      type="file"
                      accept={VIDEO_MIME_TYPES.join(',')}
                      className="hidden"
                      onChange={(e) => { addVideoFiles(e.target.files); e.target.value = ''; }}
                    />
                  </label>
                  {canAttachVehicle && (
                    <Tap
                      onMouseDown={holdFocus}
                      onClick={openVehiclePicker}
                      aria-expanded={vehiclePickerOpen}
                      aria-label="Attach vehicle"
                      className={`grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-accent-050 ${selectedVehicle ? 'text-accent-700' : 'text-accent-700'}`}
                    >
                      <Icon name="car" size={17} fill={Boolean(selectedVehicle)} />
                    </Tap>
                  )}

                  <span className="flex-1" />

                  <Tap
                    onMouseDown={holdFocus}
                    onClick={handleSubmit}
                    disabled={!canPublish}
                    animate={{ scale: justPublished ? 1.05 : 1 }}
                    transition={{ scale: SPRING_SNAPPY }}
                    className={`rounded-full px-4 py-1.5 text-detail font-semibold transition-colors ${
                      canPublish ? 'bg-ink text-white hover:bg-ink/90' : 'bg-panel text-faint'
                    }`}
                  >
                    {submitting ? 'Posting…' : editing ? 'Save' : 'Post'}
                  </Tap>

                  <button
                    onMouseDown={holdFocus}
                    onClick={editing ? onCancel : handleClose}
                    aria-label={editing ? 'Cancel editing' : 'Close composer'}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink"
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>

                {canAttachVehicle && vehiclePickerOpen && (
                  <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto rounded-xl border border-line bg-panel p-2">
                    {loadingCars ? (
                      <p className="px-2 py-3 text-detail text-muted">Loading your vehicles…</p>
                    ) : !hostCars || hostCars.length === 0 ? (
                      <p className="px-2 py-3 text-detail text-muted">You don't have any listed vehicles yet.</p>
                    ) : (
                      hostCars.map((car) => {
                        const isSelected = selectedVehicle?.id === car.id;
                        return (
                          <button
                            key={car.id}
                            type="button"
                            onMouseDown={holdFocus}
                            onClick={() => { setSelectedVehicle(isSelected ? null : carToVehicleRef(car)); setVehiclePickerOpen(false); }}
                            className={`pressable flex shrink-0 flex-col overflow-hidden rounded-lg border text-left transition-colors ${
                              isSelected ? 'border-accent ring-2 ring-accent-100' : 'border-line hover:border-line-strong'
                            }`}
                            style={{ width: 108 }}
                          >
                            <span className="block h-16 w-full bg-surface">
                              {car.images[0] && (
                                <Img
                                  src={car.images[0]}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  fallback={<span className="grid h-full w-full place-items-center text-muted"><Icon name="car" size={18} /></span>}
                                />
                              )}
                            </span>
                            <span className="truncate px-1.5 py-1 text-[11px] font-semibold text-ink">{car.make} {car.model}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                {selectedVehicle && !vehiclePickerOpen && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-panel px-2.5 py-1.5">
                    {selectedVehicle.imageUrl && (
                      <Img
                        src={selectedVehicle.imageUrl}
                        alt=""
                        className="h-7 w-7 rounded-md object-cover"
                        fallback={<span className="grid h-7 w-7 place-items-center rounded-md bg-surface text-muted"><Icon name="car" size={13} /></span>}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-caption font-medium text-ink">
                      {selectedVehicle.make} {selectedVehicle.model} · {selectedVehicle.year}
                    </span>
                    <button onMouseDown={holdFocus} onClick={() => setSelectedVehicle(null)} aria-label="Remove vehicle" className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted hover:text-danger">
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
