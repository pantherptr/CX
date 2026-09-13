import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import {
  EMPIRE_CATEGORIES, createEmpirePost, updateEmpirePost, uploadEmpirePostMedia, mediaKindFromPath,
  type EmpireCategory, type EmpirePost, type EmpireVehicleRef,
} from '../../lib/data/empireFeed';
import { validateVideoFile, VIDEO_MIME_TYPES } from '../../lib/media';
import type { SignalPublisherType } from '../../lib/data/signalIdentity';
import { SignalPublisherPicker, lastSignalPublisherType } from './SignalPublisherPicker';
import { useAuth } from '../../lib/auth';
import { fetchHostCars } from '../../lib/data/cars';
import type { Car } from '../../data/types';

const MAX_MEDIA = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_VIDEO_DURATION_SEC = 180;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PendingMedia {
  file: File;
  preview: string;
  mediaKind: 'image' | 'video';
}

/** The Signal publish form — mounted by the page for whichever authorized
 *  publishers it is (UX gate only; the real enforcement is
 *  `can_publish_signal_content()` inside every RPC this calls). Reused
 *  for both creating a new post and editing an existing one — `editing`
 *  pre-fills the form and swaps Publish for Save. Media is staged
 *  locally with a preview and only uploaded on submit, same pattern as
 *  the listing photo step in ListCar.tsx. Images and video share one
 *  staging list and one upload pass — `uploadEmpirePostMedia` is already
 *  file-type-agnostic, so only selection/validation differ by kind.
 *
 *  `mode` is the one thing that changes between publishers: `'official'`
 *  (Owner/Admin, the default) shows the Owner/CX Assistant/CX picker;
 *  `'self'` (Host/Verified Client) hides it entirely and always publishes
 *  under the caller's own real identity — the server forces this
 *  regardless of what's sent, this just keeps the UI honest about it. */
export function SignalPostComposer({
  editing,
  onDone,
  onCancel,
  mode = 'official',
}: {
  /** Present → editing this post. Absent → composing a new one. */
  editing?: EmpirePost;
  onDone: (post: EmpirePost) => void;
  onCancel?: () => void;
  mode?: 'official' | 'self';
}) {
  const { profile } = useAuth();
  const objectUrls = useRef<string[]>([]);
  const [publisherType, setPublisherType] = useState<SignalPublisherType>(mode === 'self' ? 'self' : (editing?.publisherType ?? lastSignalPublisherType()));
  const [category, setCategory] = useState<EmpireCategory>(editing?.category ?? 'news');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  // Existing (already-uploaded) media paths, kept unless removed; newly
  // staged files are uploaded only on submit and appended after.
  const [existingPaths, setExistingPaths] = useState<string[]>(editing?.mediaPaths ?? []);
  const [existingUrls, setExistingUrls] = useState<string[]>(editing?.mediaUrls ?? []);
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [validatingVideo, setValidatingVideo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vehicle attachment — Hosts only (the picker only ever lists the
  // caller's own cars; ownership is re-checked server-side regardless).
  // `hostCars` loads lazily the first time the picker opens, not on
  // every composer mount, since most posts never touch it.
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [hostCars, setHostCars] = useState<Car[] | null>(null);
  const [loadingCars, setLoadingCars] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<EmpireVehicleRef | null>(editing?.vehicle ?? null);
  const canAttachVehicle = mode === 'self' && Boolean(profile?.is_host);

  const carToVehicleRef = (car: Car): EmpireVehicleRef => ({
    id: car.id, slug: car.slug, make: car.make, model: car.model, year: car.year,
    city: car.city, pricePerDay: car.pricePerDay, imageUrl: car.images[0] ?? null,
  });

  const openVehiclePicker = () => {
    setVehiclePickerOpen((v) => !v);
    if (!hostCars && !loadingCars && profile?.id) {
      setLoadingCars(true);
      fetchHostCars(profile.id)
        .then(setHostCars)
        .catch(() => setHostCars([]))
        .finally(() => setLoadingCars(false));
    }
  };

  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const totalMedia = existingPaths.length + pending.length;

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

  const handleSubmit = async () => {
    if (!body.trim()) {
      setError('Write something before publishing.');
      return;
    }
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
        category, title: title.trim() || undefined, body: body.trim(), mediaPaths, publisherType,
        vehicleId: canAttachVehicle ? (selectedVehicle?.id ?? null) : undefined,
      };
      const result = editing ? await updateEmpirePost(editing.id, input) : await createEmpirePost(input);
      if (result.error || !result.post) {
        setError(result.error ?? 'Something went wrong — try again.');
        return;
      }
      // update_empire_post returns a bare row with no joined counts (see
      // mapCreatedPost) — carry the real, already-known engagement
      // numbers over from the pre-edit post rather than letting them
      // flash to zero until the next full refetch. Same reasoning for
      // `vehicle`: the bare row only has a `vehicle_id` uuid, but this
      // component already has the full picked vehicle's details from
      // building the picker, so it's cheaper and simpler to attach them
      // here than to have the server resolve and return them again.
      onDone(editing ? {
        ...result.post,
        likeCount: editing.likeCount, commentCount: editing.commentCount, saveCount: editing.saveCount,
        viewCount: editing.viewCount, shareCount: editing.shareCount, likedByMe: editing.likedByMe, savedByMe: editing.savedByMe,
        authorIsHost: editing.authorIsHost, authorIsVerifiedClient: editing.authorIsVerifiedClient,
        vehicle: canAttachVehicle ? selectedVehicle : editing.vehicle,
      } : { ...result.post, vehicle: canAttachVehicle ? selectedVehicle : null });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card mb-5 p-4 sm:p-5">
      {mode === 'official' && (
        <SignalPublisherPicker
          value={publisherType}
          onChange={setPublisherType}
          ownerName={profile?.full_name || 'Owner'}
          ownerAvatarUrl={profile?.avatar_url ?? null}
        />
      )}

      <div className={`flex flex-wrap gap-1.5 ${mode === 'official' ? 'mt-4' : ''}`}>
        {EMPIRE_CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`rounded-full px-3 py-1.5 text-caption font-semibold uppercase tracking-wide transition-colors ${
              category === c.value ? 'bg-ink text-white' : 'bg-panel text-ink-soft hover:bg-panel-2'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="input mt-3 !py-2.5 font-display font-semibold"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share news, an announcement, a new car…"
        rows={4}
        className="input mt-2 resize-none !py-2.5"
      />

      {(existingUrls.length > 0 || pending.length > 0) && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {existingUrls.map((url, i) => {
            const isVideo = mediaKindFromPath(url) === 'video';
            return (
              <div key={`existing-${url}`} className="group relative aspect-square overflow-hidden rounded-xl bg-panel">
                {isVideo ? (
                  <>
                    <video src={url} muted playsInline className="h-full w-full object-cover" />
                    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/20">
                      <Icon name="play" size={18} className="text-white" />
                    </div>
                  </>
                ) : (
                  <img src={url} alt="" className="h-full w-full object-cover" />
                )}
                <button
                  onClick={() => removeExisting(i)}
                  aria-label="Remove media"
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
            );
          })}
          {pending.map((media, i) => (
            <div key={media.preview} className="group relative aspect-square overflow-hidden rounded-xl bg-panel">
              {media.mediaKind === 'video' ? (
                <>
                  <video src={media.preview} muted playsInline className="h-full w-full object-cover" />
                  <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/20">
                    <Icon name="play" size={18} className="text-white" />
                  </div>
                </>
              ) : (
                <img src={media.preview} alt="" className="h-full w-full object-cover" />
              )}
              <button
                onClick={() => removePending(i)}
                aria-label="Remove media"
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {mediaError && <p className="mt-2 text-caption font-medium text-danger">{mediaError}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addImageFiles(e.dataTransfer.files); }}
          className={`pressable inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-detail font-semibold transition-colors ${
            dragOver ? 'border-accent bg-accent-050 text-accent-700' : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
          } ${totalMedia >= MAX_MEDIA ? 'pointer-events-none opacity-40' : ''}`}
        >
          <Icon name="image" size={16} />
          Add images
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            multiple
            className="hidden"
            onChange={(e) => { addImageFiles(e.target.files); e.target.value = ''; }}
          />
        </label>

        <label
          className={`pressable inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-detail font-semibold text-ink-soft transition-colors hover:border-line-strong hover:text-ink ${
            totalMedia >= MAX_MEDIA || validatingVideo ? 'pointer-events-none opacity-40' : ''
          }`}
        >
          {validatingVideo ? <span className="skeleton h-4 w-4 rounded-full" /> : <Icon name="play" size={16} />}
          {validatingVideo ? 'Checking…' : 'Add video'}
          <input
            type="file"
            accept={VIDEO_MIME_TYPES.join(',')}
            className="hidden"
            onChange={(e) => { addVideoFiles(e.target.files); e.target.value = ''; }}
          />
        </label>

        {canAttachVehicle && (
          <button
            type="button"
            onClick={openVehiclePicker}
            aria-expanded={vehiclePickerOpen}
            className={`pressable inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-detail font-semibold transition-colors ${
              selectedVehicle ? 'border-accent bg-accent-050 text-accent-700' : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
            }`}
          >
            <Icon name="car" size={16} />
            {selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : 'Vehicle'}
          </button>
        )}
      </div>

      {/* The vehicle picker — a compact horizontal strip of the Host's
          own cars only (fetchHostCars is already scoped to `profile.id`;
          the RPC re-checks ownership again regardless). Tapping the
          already-selected car deselects it — a post attaches at most
          one vehicle. */}
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
                  onClick={() => { setSelectedVehicle(isSelected ? null : carToVehicleRef(car)); setVehiclePickerOpen(false); }}
                  className={`pressable flex shrink-0 flex-col overflow-hidden rounded-lg border text-left transition-colors ${
                    isSelected ? 'border-accent ring-2 ring-accent-100' : 'border-line hover:border-line-strong'
                  }`}
                  style={{ width: 108 }}
                >
                  <span className="block h-16 w-full bg-surface">
                    {car.images[0] && <img src={car.images[0]} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className="truncate px-1.5 py-1 text-[11px] font-semibold text-ink">{car.make} {car.model}</span>
                </button>
              );
            })
          )}
        </div>
      )}

      {selectedVehicle && !vehiclePickerOpen && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2">
          {selectedVehicle.imageUrl && <img src={selectedVehicle.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />}
          <span className="min-w-0 flex-1 truncate text-detail font-medium text-ink">
            {selectedVehicle.make} {selectedVehicle.model} · {selectedVehicle.year}
          </span>
          <button onClick={() => setSelectedVehicle(null)} aria-label="Remove vehicle" className="text-muted hover:text-danger">
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-detail font-medium text-danger">{error}</p>}

      <div className="mt-4 flex items-center justify-end gap-2">
        {onCancel && (
          <button onClick={onCancel} className="btn btn-secondary btn-sm">
            Cancel
          </button>
        )}
        <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary btn-sm disabled:opacity-50">
          {submitting ? 'Publishing…' : editing ? 'Save changes' : 'Publish'}
        </button>
      </div>
    </div>
  );
}
