import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import {
  createEmpireStory, addEmpireStorySlide, uploadEmpireStoryMedia, uploadEmpireStoryPoster, deleteEmpireStory,
  fetchAllEmpireStoriesAdmin, type EmpireStory, type StoryMediaType,
} from '../../lib/data/empireStories';
import {
  useEmpireHighlights, createEmpireHighlight, deleteEmpireHighlight, saveEmpireStoryToHighlight,
  uploadEmpireHighlightMedia, addEmpireHighlightSlide, type EmpireHighlight,
} from '../../lib/data/empireHighlights';
import { validateVideoFile, captureVideoPosterBlob, VIDEO_MIME_TYPES } from '../../lib/media';
import type { SignalPublisherType } from '../../lib/data/signalIdentity';
import { SignalPublisherPicker, lastSignalPublisherType } from './SignalPublisherPicker';
import { resolveSignalIdentity } from '../../lib/data/signalIdentity';
import { SignalIdentityAvatar } from './SignalIdentityBadge';
import { useAuth } from '../../lib/auth';

const MAX_SLIDES = 10;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const MAX_VIDEO_DURATION_SEC = 60; // Stories stay short — a 10-minute clip defeats the format.
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PendingSlide {
  file: File;
  preview: string;
  mediaType: StoryMediaType;
  /** Video slides only — the client-captured first-frame thumbnail,
   *  generated at staging time so publish doesn't need to re-decode the
   *  video just to get a poster. */
  posterBlob: Blob | null;
  caption: string;
  ctaLabel: string;
  ctaUrl: string;
  showDetails: boolean;
}

/** Owner/Admin-only: create a new Story (staged-then-upload-on-submit,
 *  same pattern as SignalPostComposer/ListCar.tsx), manage existing ones
 *  (active + expired, with view counts, delete, and "save to Highlight"),
 *  and manage the permanent Highlights collections themselves — kept as
 *  one sheet with three views rather than a separate admin-dashboard
 *  route, so management stays integrated into the Signal experience. */
export function SignalStoryComposer({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
  const { profile } = useAuth();
  const [view, setView] = useState<'create' | 'manage' | 'highlights'>('create');
  const objectUrls = useRef<string[]>([]);
  const [publisherType, setPublisherType] = useState<SignalPublisherType>(lastSignalPublisherType());
  const [title, setTitle] = useState('');
  const [slides, setSlides] = useState<PendingSlide[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [allStories, setAllStories] = useState<EmpireStory[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingStoryId, setSavingStoryId] = useState<string | null>(null);

  const { highlights, refresh: refreshHighlights } = useEmpireHighlights();
  const [newHighlightTitle, setNewHighlightTitle] = useState('');
  const [creatingHighlight, setCreatingHighlight] = useState(false);
  const [deletingHighlightId, setDeletingHighlightId] = useState<string | null>(null);
  const [uploadingHighlightId, setUploadingHighlightId] = useState<string | null>(null);

  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  useEffect(() => {
    if (view === 'manage' && allStories === null) {
      fetchAllEmpireStoriesAdmin().then(setAllStories).catch(() => setAllStories([]));
    }
  }, [view, allStories]);

  const [validatingVideo, setValidatingVideo] = useState(false);

  const addImageFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted: PendingSlide[] = [];
    let firstError: string | null = null;
    for (const file of Array.from(list)) {
      if (slides.length + accepted.length >= MAX_SLIDES) {
        firstError ??= `A Story can have up to ${MAX_SLIDES} slides.`;
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
      accepted.push({ file, preview, mediaType: 'image', posterBlob: null, caption: '', ctaLabel: '', ctaUrl: '', showDetails: false });
    }
    if (accepted.length) setSlides((s) => [...s, ...accepted]);
    setError(firstError);
  };

  // Separate from addImageFiles (rather than one function branching on
  // file.type) because validating a video is async — reading its real
  // duration and capturing a poster frame both need to await the file
  // actually loading, unlike an image's synchronous checks.
  const addVideoFiles = async (list: FileList | null) => {
    if (!list) return;
    setValidatingVideo(true);
    setError(null);
    const accepted: PendingSlide[] = [];
    let firstError: string | null = null;
    for (const file of Array.from(list)) {
      if (slides.length + accepted.length >= MAX_SLIDES) {
        firstError ??= `A Story can have up to ${MAX_SLIDES} slides.`;
        break;
      }
      const result = await validateVideoFile(file, { maxBytes: MAX_VIDEO_BYTES, maxDurationSec: MAX_VIDEO_DURATION_SEC });
      if (!result.ok) {
        firstError ??= result.error ?? `"${file.name}" could not be used.`;
        continue;
      }
      let posterBlob: Blob | null = null;
      try {
        posterBlob = await captureVideoPosterBlob(file);
      } catch {
        // A missing poster isn't fatal — the viewer falls back to
        // decoding the video's own first frame with no `poster` set.
      }
      const preview = URL.createObjectURL(file);
      objectUrls.current.push(preview);
      accepted.push({ file, preview, mediaType: 'video', posterBlob, caption: '', ctaLabel: '', ctaUrl: '', showDetails: false });
    }
    if (accepted.length) setSlides((s) => [...s, ...accepted]);
    setError(firstError);
    setValidatingVideo(false);
  };

  const removeSlide = (i: number) => {
    setSlides((s) => {
      const target = s[i];
      if (target) URL.revokeObjectURL(target.preview);
      return s.filter((_, idx) => idx !== i);
    });
  };

  const moveSlide = (i: number, dir: -1 | 1) => {
    setSlides((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = s.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const patchSlide = (i: number, patch: Partial<PendingSlide>) => {
    setSlides((s) => s.map((slide, idx) => (idx === i ? { ...slide, ...patch } : slide)));
  };

  const handlePublish = async () => {
    if (slides.length === 0) {
      setError('Add at least one image or video.');
      return;
    }
    setPublishing(true);
    setError(null);
    const { storyId, error: createError } = await createEmpireStory(title.trim() || undefined, publisherType);
    if (createError || !storyId) {
      setError(createError ?? 'Could not create the Story — try again.');
      setPublishing(false);
      return;
    }
    for (const slide of slides) {
      try {
        const { path } = await uploadEmpireStoryMedia(slide.file);
        let posterPath: string | undefined;
        if (slide.mediaType === 'video' && slide.posterBlob) {
          try {
            posterPath = (await uploadEmpireStoryPoster(slide.posterBlob)).path;
          } catch {
            // A missing poster isn't fatal — see addVideoFiles.
          }
        }
        await addEmpireStorySlide(storyId, path, slide.mediaType, {
          caption: slide.caption.trim() || undefined,
          ctaLabel: slide.ctaLabel.trim() || undefined,
          ctaUrl: slide.ctaUrl.trim() || undefined,
          posterPath,
        });
      } catch {
        // one slide failing shouldn't abandon the rest already uploaded
      }
    }
    setPublishing(false);
    onPublished();
  };

  const handleDeleteStory = async (id: string) => {
    if (!window.confirm('Delete this Story? This cannot be undone.')) return;
    setDeletingId(id);
    const { error: deleteError } = await deleteEmpireStory(id);
    setDeletingId(null);
    if (!deleteError) {
      setAllStories((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      onPublished();
    }
  };

  const handleSaveToHighlight = async (storyId: string, highlightId: string) => {
    if (!highlightId) return;
    setSavingStoryId(storyId);
    await saveEmpireStoryToHighlight(storyId, highlightId);
    setSavingStoryId(null);
    refreshHighlights();
  };

  const handleCreateHighlight = async () => {
    if (!newHighlightTitle.trim()) return;
    setCreatingHighlight(true);
    const { error: createError } = await createEmpireHighlight(newHighlightTitle.trim());
    setCreatingHighlight(false);
    if (!createError) {
      setNewHighlightTitle('');
      refreshHighlights();
    }
  };

  const handleDeleteHighlight = async (id: string) => {
    if (!window.confirm('Delete this Highlight? This cannot be undone.')) return;
    setDeletingHighlightId(id);
    await deleteEmpireHighlight(id);
    setDeletingHighlightId(null);
    refreshHighlights();
  };

  const handleAddHighlightSlide = async (highlight: EmpireHighlight, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) return;
    setUploadingHighlightId(highlight.id);
    try {
      const { path } = await uploadEmpireHighlightMedia(file);
      await addEmpireHighlightSlide(highlight.id, path, 'image');
      refreshHighlights();
    } finally {
      setUploadingHighlightId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 animate-fade-in sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <div className="flex gap-1 rounded-full bg-panel p-1">
            <button
              onClick={() => setView('create')}
              className={`rounded-full px-3 py-1.5 text-caption font-semibold transition-colors ${view === 'create' ? 'bg-ink text-white' : 'text-ink-soft'}`}
            >
              New Story
            </button>
            <button
              onClick={() => setView('manage')}
              className={`rounded-full px-3 py-1.5 text-caption font-semibold transition-colors ${view === 'manage' ? 'bg-ink text-white' : 'text-ink-soft'}`}
            >
              Manage
            </button>
            <button
              onClick={() => setView('highlights')}
              className={`rounded-full px-3 py-1.5 text-caption font-semibold transition-colors ${view === 'highlights' ? 'bg-ink text-white' : 'text-ink-soft'}`}
            >
              Highlights
            </button>
          </div>
          <button onClick={onClose} aria-label="Close" className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
            <Icon name="x" size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {view === 'create' && (
            <>
              <SignalPublisherPicker
                value={publisherType}
                onChange={setPublisherType}
                ownerName={profile?.full_name || 'Owner'}
                ownerAvatarUrl={profile?.avatar_url ?? null}
              />

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Story title (optional)"
                className="input mt-4 !py-2.5"
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="pressable flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-6 text-detail font-semibold text-ink-soft hover:border-line-strong hover:text-ink">
                  <Icon name="image" size={17} /> Add images
                  <input
                    type="file"
                    accept={ACCEPTED_TYPES.join(',')}
                    multiple
                    className="hidden"
                    onChange={(e) => { addImageFiles(e.target.files); e.target.value = ''; }}
                  />
                </label>
                <label className="pressable flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-6 text-detail font-semibold text-ink-soft hover:border-line-strong hover:text-ink">
                  {validatingVideo ? <span className="skeleton h-4 w-4 rounded-full" /> : <Icon name="play" size={17} />}
                  Add video
                  <input
                    type="file"
                    accept={VIDEO_MIME_TYPES.join(',')}
                    multiple
                    disabled={validatingVideo}
                    className="hidden"
                    onChange={(e) => { void addVideoFiles(e.target.files); e.target.value = ''; }}
                  />
                </label>
              </div>

              {error && <p className="mt-2 text-caption font-medium text-danger">{error}</p>}

              <div className="mt-4 flex flex-col gap-3">
                {slides.map((slide, i) => (
                  <div key={slide.preview} className="flex items-start gap-3 rounded-xl border border-line p-2.5">
                    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-panel">
                      {slide.mediaType === 'video' ? (
                        <>
                          <video src={slide.preview} className="h-full w-full object-cover" muted playsInline />
                          <span className="absolute inset-0 grid place-items-center bg-black/25">
                            <Icon name="play" size={16} className="text-white" fill />
                          </span>
                        </>
                      ) : (
                        <img src={slide.preview} alt="" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-caption font-semibold text-ink-soft">Slide {i + 1}</span>
                        <button onClick={() => moveSlide(i, -1)} disabled={i === 0} aria-label="Move earlier" className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-panel disabled:opacity-30">
                          <Icon name="chevronLeft" size={13} />
                        </button>
                        <button onClick={() => moveSlide(i, 1)} disabled={i === slides.length - 1} aria-label="Move later" className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-panel disabled:opacity-30">
                          <Icon name="chevronRight" size={13} />
                        </button>
                        <button onClick={() => patchSlide(i, { showDetails: !slide.showDetails })} className="ml-auto text-caption font-medium text-accent-700">
                          {slide.showDetails ? 'Hide details' : 'Caption & link'}
                        </button>
                        <button onClick={() => removeSlide(i)} aria-label="Remove slide" className="text-muted hover:text-danger">
                          <Icon name="x" size={15} />
                        </button>
                      </div>
                      {slide.showDetails && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          <input
                            value={slide.caption}
                            onChange={(e) => patchSlide(i, { caption: e.target.value })}
                            placeholder="Caption (optional)"
                            className="input !py-1.5 text-detail"
                          />
                          <div className="flex gap-1.5">
                            <input
                              value={slide.ctaLabel}
                              onChange={(e) => patchSlide(i, { ctaLabel: e.target.value })}
                              placeholder="Button text"
                              className="input !py-1.5 flex-1 text-detail"
                            />
                            <input
                              value={slide.ctaUrl}
                              onChange={(e) => patchSlide(i, { ctaUrl: e.target.value })}
                              placeholder="Link URL"
                              className="input !py-1.5 flex-1 text-detail"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {view === 'manage' && (
            <div className="flex flex-col gap-2.5">
              {allStories === null ? (
                <p className="py-8 text-center text-detail text-muted">Loading…</p>
              ) : allStories.length === 0 ? (
                <p className="py-8 text-center text-detail text-muted">No Stories yet.</p>
              ) : (
                allStories.map((s) => {
                  const expired = new Date(s.expiresAt).getTime() < Date.now();
                  const identity = resolveSignalIdentity(s.publisherType, s.authorName, s.authorAvatarUrl);
                  return (
                    <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-line p-2.5">
                      <div className="flex items-center gap-3">
                        {s.slides[0] ? (
                          <img src={s.slides[0].mediaUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-panel text-muted"><Icon name="image" size={16} /></span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-detail font-semibold text-ink">{s.title || 'Untitled Story'}</p>
                          <p className="flex items-center gap-2 text-caption text-muted">
                            <span className="inline-flex items-center gap-1"><SignalIdentityAvatar identity={identity} size={14} /> {identity.name}</span>
                            <span className={expired ? 'text-danger' : 'text-accent-700'}>{expired ? 'Expired' : 'Active'}</span>
                            <span className="inline-flex items-center gap-1"><Icon name="eye" size={12} /> {s.viewCount}</span>
                            <span>{s.slides.length} slide{s.slides.length === 1 ? '' : 's'}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteStory(s.id)}
                          disabled={deletingId === s.id}
                          aria-label="Delete story"
                          className="shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                      {highlights && highlights.length > 0 && s.slides.length > 0 && (
                        <label className="flex items-center gap-2 text-caption text-ink-soft">
                          <Icon name="bookmark" size={13} />
                          <select
                            defaultValue=""
                            disabled={savingStoryId === s.id}
                            onChange={(e) => { handleSaveToHighlight(s.id, e.target.value); e.target.value = ''; }}
                            className="input !h-8 flex-1 !py-1 text-caption"
                          >
                            <option value="" disabled>Save to Highlight…</option>
                            {highlights.map((h) => (
                              <option key={h.id} value={h.id}>{h.title}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {view === 'highlights' && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <input
                  value={newHighlightTitle}
                  onChange={(e) => setNewHighlightTitle(e.target.value)}
                  placeholder="New Highlight name — e.g. NEW CARS"
                  className="input !py-2 flex-1 text-detail"
                />
                <button
                  onClick={handleCreateHighlight}
                  disabled={creatingHighlight || !newHighlightTitle.trim()}
                  className="btn btn-secondary btn-sm shrink-0 disabled:opacity-50"
                >
                  Create
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                {highlights === null ? (
                  <p className="py-8 text-center text-detail text-muted">Loading…</p>
                ) : highlights.length === 0 ? (
                  <p className="py-8 text-center text-detail text-muted">
                    No Highlights yet. Create one above, then save a Story into it from the Manage tab.
                  </p>
                ) : (
                  highlights.map((h) => (
                    <div key={h.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                      {h.slides[0] ? (
                        <img src={h.slides[0].mediaUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-panel text-muted"><Icon name="image" size={16} /></span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-detail font-semibold text-ink">{h.title}</p>
                        <p className="text-caption text-muted">{h.slides.length} slide{h.slides.length === 1 ? '' : 's'}</p>
                      </div>
                      <label className="pressable grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-panel">
                        {uploadingHighlightId === h.id ? (
                          <span className="skeleton h-4 w-4 rounded-full" />
                        ) : (
                          <Icon name="plus" size={16} />
                        )}
                        <input
                          type="file"
                          accept={ACCEPTED_TYPES.join(',')}
                          className="hidden"
                          onChange={(e) => { handleAddHighlightSlide(h, e.target.files); e.target.value = ''; }}
                        />
                      </label>
                      <button
                        onClick={() => handleDeleteHighlight(h.id)}
                        disabled={deletingHighlightId === h.id}
                        aria-label="Delete highlight"
                        className="shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {view === 'create' && (
          <div className="flex items-center justify-end gap-2 border-t border-line p-4">
            <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
            <button onClick={handlePublish} disabled={publishing} className="btn btn-primary btn-sm disabled:opacity-50">
              {publishing ? 'Publishing…' : 'Publish Story'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
