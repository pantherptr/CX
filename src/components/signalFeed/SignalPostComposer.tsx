import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import {
  EMPIRE_CATEGORIES, createEmpirePost, updateEmpirePost, uploadEmpirePostMedia,
  type EmpireCategory, type EmpirePost,
} from '../../lib/data/empireFeed';
import type { SignalPublisherType } from '../../lib/data/signalIdentity';
import { SignalPublisherPicker, lastSignalPublisherType } from './SignalPublisherPicker';
import { useAuth } from '../../lib/auth';

const MAX_IMAGES = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PendingImage {
  file: File;
  preview: string;
}

/** Owner/Admin-only publish form — mounted by the page only when
 *  `roleFromFlags(profile)` resolves to owner/admin (UX gate only; the
 *  real enforcement is `is_admin()` inside every RPC this calls). Reused
 *  for both creating a new post and editing an existing one — `editing`
 *  pre-fills the form and swaps Publish for Save. Images are staged
 *  locally with a preview and only uploaded on submit, same pattern as
 *  the listing photo step in ListCar.tsx. */
export function SignalPostComposer({
  editing,
  onDone,
  onCancel,
}: {
  /** Present → editing this post. Absent → composing a new one. */
  editing?: EmpirePost;
  onDone: (post: EmpirePost) => void;
  onCancel?: () => void;
}) {
  const { profile } = useAuth();
  const objectUrls = useRef<string[]>([]);
  const [publisherType, setPublisherType] = useState<SignalPublisherType>(editing?.publisherType ?? lastSignalPublisherType());
  const [category, setCategory] = useState<EmpireCategory>(editing?.category ?? 'news');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [commentsDisabled, setCommentsDisabled] = useState(editing?.commentsDisabled ?? false);
  // Existing (already-uploaded) media paths, kept unless removed; newly
  // staged files are uploaded only on submit and appended after.
  const [existingPaths, setExistingPaths] = useState<string[]>(editing?.mediaPaths ?? []);
  const [existingUrls, setExistingUrls] = useState<string[]>(editing?.mediaUrls ?? []);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const totalImages = existingPaths.length + pending.length;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted: PendingImage[] = [];
    let firstError: string | null = null;

    for (const file of Array.from(list)) {
      if (totalImages + accepted.length >= MAX_IMAGES) {
        firstError ??= `You can add up to ${MAX_IMAGES} images.`;
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
      accepted.push({ file, preview });
    }

    if (accepted.length) setPending((p) => [...p, ...accepted]);
    setImageError(firstError);
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
    setImageError(null);
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
      for (const img of pending) {
        const { path } = await uploadEmpirePostMedia(img.file);
        uploaded.push(path);
      }
      const mediaPaths = [...existingPaths, ...uploaded];
      const input = { category, title: title.trim() || undefined, body: body.trim(), mediaPaths, commentsDisabled, publisherType };
      const result = editing ? await updateEmpirePost(editing.id, input) : await createEmpirePost(input);
      if (result.error || !result.post) {
        setError(result.error ?? 'Something went wrong — try again.');
        return;
      }
      onDone(result.post);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card mb-5 p-4 sm:p-5">
      <SignalPublisherPicker
        value={publisherType}
        onChange={setPublisherType}
        ownerName={profile?.full_name || 'Owner'}
        ownerAvatarUrl={profile?.avatar_url ?? null}
      />

      <div className="mt-4 flex flex-wrap gap-1.5">
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
          {existingUrls.map((url, i) => (
            <div key={`existing-${url}`} className="group relative aspect-square overflow-hidden rounded-xl bg-panel">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => removeExisting(i)}
                aria-label="Remove image"
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
          {pending.map((img, i) => (
            <div key={img.preview} className="group relative aspect-square overflow-hidden rounded-xl bg-panel">
              <img src={img.preview} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => removePending(i)}
                aria-label="Remove image"
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {imageError && <p className="mt-2 text-caption font-medium text-danger">{imageError}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          className={`pressable inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-detail font-semibold transition-colors ${
            dragOver ? 'border-accent bg-accent-050 text-accent-700' : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
          } ${totalImages >= MAX_IMAGES ? 'pointer-events-none opacity-40' : ''}`}
        >
          <Icon name="image" size={16} />
          Add images
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
        </label>

        <label className="inline-flex items-center gap-2 text-detail font-medium text-ink-soft">
          <input type="checkbox" checked={commentsDisabled} onChange={(e) => setCommentsDisabled(e.target.checked)} className="h-4 w-4 rounded" />
          Disable comments
        </label>
      </div>

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
