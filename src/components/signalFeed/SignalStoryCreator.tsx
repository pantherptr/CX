import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { vibrateTap } from '../motion';
import { motion, AnimatePresence, useReducedMotion, SPRING_SMOOTH, SPRING_SNAPPY, Tap } from '../motionKit';
import {
  createEmpireStory, addEmpireStorySlide, uploadEmpireStoryMedia, uploadEmpireStoryPoster,
  type StoryMediaType, type StoryTextAlign, type StoryTextSize, type StoryBgStyle,
} from '../../lib/data/empireStories';
import { validateVideoFile } from '../../lib/media';
import { cropImageFileToStoryCanvas, capturePosterFromVideoFile } from '../../lib/storyMedia';
import type { SignalPublisherType } from '../../lib/data/signalIdentity';
import { SignalPublisherPicker, lastSignalPublisherType } from './SignalPublisherPicker';
import { SignalStoryComposer } from './SignalStoryComposer';
import { SignalStoryCamera } from './SignalStoryCamera';
import { StoryCanvas } from './StoryCanvas';
import { STORY_BG_STYLES } from './StoryTextSlide';
import { useAuth } from '../../lib/auth';

const MAX_SLIDES = 10;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const MAX_VIDEO_DURATION_SEC = 60;
const CLOSE_SWIPE_THRESHOLD_PX = 120;

interface StagedSlide {
  key: string;
  file: File | null;
  preview: string;
  mediaType: StoryMediaType;
  posterBlob: Blob | null;
  caption: string;
  textContent?: string;
  textAlign?: StoryTextAlign;
  textSize?: StoryTextSize;
  bgStyle?: StoryBgStyle;
}

/** SIGNAL's Story camera — the real entry point for "Add Story", not a
 *  form or a picker sheet. Opens straight into a live `getUserMedia`
 *  viewfinder (`SignalStoryCamera`); Gallery and Text are reached from
 *  inside that screen, not from a separate menu. Every capture path —
 *  camera photo, camera video, gallery photo, gallery video, text — lands
 *  in the same strict-9:16 editor (`StoryCanvas`), so a Story always
 *  looks the same shape regardless of how it was made.
 *
 *  9:16 is enforced at the pixel level, not just visually: a gallery
 *  photo is cover-cropped and re-encoded to a fixed 1080x1920 canvas
 *  before it's ever staged (`cropImageFileToStoryCanvas`); a camera photo
 *  is captured directly at that same resolution from the live video
 *  frame. Video isn't re-encoded (impractical client-side) — instead
 *  every renderer (editor, viewer) displays it through the same
 *  `object-cover` treatment inside `StoryCanvas`, so the *composition* is
 *  always 9:16 even though the underlying file isn't physically cropped.
 *
 *  No backend change: same `create_empire_story`/`add_empire_story_slide`
 *  RPCs, same upload helpers, same optional `title` (already nullable
 *  server-side). Same `{ onClose, onPublished, mode }` contract as the
 *  composer it replaces. */
export function SignalStoryCreator({
  onClose,
  onPublished,
  mode = 'official',
}: {
  onClose: () => void;
  onPublished: () => void;
  mode?: 'official' | 'self';
}) {
  const { profile } = useAuth();
  const reduceMotion = !!useReducedMotion();
  const objectUrls = useRef<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [stage, setStage] = useState<'camera' | 'editor'>('camera');
  const [publisherType, setPublisherType] = useState<SignalPublisherType>(mode === 'self' ? 'self' : lastSignalPublisherType());
  const [slides, setSlides] = useState<StagedSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const activeSlide = slides[activeIndex] ?? null;

  const patchActiveSlide = (patch: Partial<StagedSlide>) => {
    setSlides((s) => s.map((slide, i) => (i === activeIndex ? { ...slide, ...patch } : slide)));
  };

  const goToEditor = (staged: StagedSlide[]) => {
    if (staged.length === 0) return;
    setSlides(staged);
    setActiveIndex(0);
    setError(null);
    setStage('editor');
  };

  const stageFile = (file: File, mediaType: StoryMediaType, posterBlob: Blob | null = null): StagedSlide => {
    const preview = URL.createObjectURL(file);
    objectUrls.current.push(preview);
    return { key: crypto.randomUUID(), file, preview, mediaType, posterBlob, caption: '' };
  };

  const handlePhotoBlob = (blob: Blob) => {
    const file = new File([blob], `signal-story-${Date.now()}.jpg`, { type: 'image/jpeg' });
    goToEditor([stageFile(file, 'image')]);
  };

  const handleVideoFile = (file: File, posterBlob: Blob | null) => {
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`That recording is larger than ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))}MB — try a shorter clip.`);
      return;
    }
    goToEditor([stageFile(file, 'video', posterBlob)]);
  };

  const handleGalleryFiles = async (list: FileList) => {
    setProcessing(true);
    setError(null);
    const staged: StagedSlide[] = [];
    let firstError: string | null = null;
    for (const file of Array.from(list)) {
      if (staged.length >= MAX_SLIDES) {
        firstError ??= `A Story can have up to ${MAX_SLIDES} slides.`;
        break;
      }
      if (file.type.startsWith('image/')) {
        try {
          const cropped = await cropImageFileToStoryCanvas(file);
          const croppedFile = new File([cropped], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
          staged.push(stageFile(croppedFile, 'image'));
        } catch {
          firstError ??= `"${file.name}" could not be used.`;
        }
      } else if (file.type.startsWith('video/')) {
        const result = await validateVideoFile(file, { maxBytes: MAX_VIDEO_BYTES, maxDurationSec: MAX_VIDEO_DURATION_SEC });
        if (!result.ok) {
          firstError ??= result.error ?? `"${file.name}" could not be used.`;
          continue;
        }
        let posterBlob: Blob | null = null;
        try {
          posterBlob = await capturePosterFromVideoFile(file);
        } catch {
          // Non-fatal — the viewer falls back to the video's own first frame.
        }
        staged.push(stageFile(file, 'video', posterBlob));
      } else {
        firstError ??= `"${file.name}" isn't a supported photo or video.`;
      }
    }
    setProcessing(false);
    if (staged.length) goToEditor(staged);
    else if (firstError) setError(firstError);
  };

  const handleTextStory = () => {
    goToEditor([{
      key: crypto.randomUUID(), file: null, preview: '', mediaType: 'text', posterBlob: null, caption: '',
      textContent: '', textAlign: 'center', textSize: 'md', bgStyle: 'noir',
    }]);
    window.setTimeout(() => textareaRef.current?.focus(), reduceMotion ? 0 : 260);
  };

  const removeActiveSlide = () => {
    const target = slides[activeIndex];
    if (target?.file) URL.revokeObjectURL(target.preview);
    const next = slides.filter((_, i) => i !== activeIndex);
    if (next.length === 0) {
      setStage('camera');
      setSlides([]);
      return;
    }
    setSlides(next);
    setActiveIndex((i) => Math.min(i, next.length - 1));
  };

  const handlePublish = async () => {
    if (slides.length === 0) return;
    if (slides.some((s) => s.mediaType === 'text' && !s.textContent?.trim())) {
      setError('Add some text to your Story.');
      return;
    }
    setPublishing(true);
    setError(null);
    const { storyId, error: createError } = await createEmpireStory(undefined, publisherType);
    if (createError || !storyId) {
      setError(createError ?? 'Could not create the Story — try again.');
      setPublishing(false);
      return;
    }
    let succeeded = 0;
    for (const slide of slides) {
      try {
        if (slide.mediaType === 'text') {
          const { error: slideError } = await addEmpireStorySlide(storyId, null, 'text', {
            textContent: slide.textContent?.trim(), textAlign: slide.textAlign, textSize: slide.textSize, bgStyle: slide.bgStyle,
          });
          if (!slideError) succeeded++;
          continue;
        }
        const { path } = await uploadEmpireStoryMedia(slide.file!);
        let posterPath: string | undefined;
        if (slide.mediaType === 'video' && slide.posterBlob) {
          try {
            posterPath = (await uploadEmpireStoryPoster(slide.posterBlob)).path;
          } catch {
            // Non-fatal — see handleGalleryFiles/SignalStoryCamera.
          }
        }
        const { error: slideError } = await addEmpireStorySlide(storyId, path, slide.mediaType, {
          caption: slide.caption.trim() || undefined, posterPath,
        });
        if (!slideError) succeeded++;
      } catch {
        // One slide failing shouldn't abandon the rest already uploaded.
      }
    }
    setPublishing(false);
    if (succeeded === 0) {
      setError('Could not upload your Story — check your connection and try again.');
      return;
    }
    vibrateTap();
    onPublished();
  };

  const handleClose = () => {
    if (slides.length > 0 && !window.confirm('Discard this Story?')) return;
    onClose();
  };

  const backToCamera = () => {
    slides.forEach((s) => s.file && URL.revokeObjectURL(s.preview));
    setSlides([]);
    setStage('camera');
    setError(null);
  };

  return (
    <StoryCreatorShell reduceMotion={reduceMotion} onDismiss={handleClose}>
      <AnimatePresence mode="wait" initial={false}>
        {stage === 'camera' ? (
          <motion.div
            key="camera"
            className="relative h-full w-full"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            <SignalStoryCamera
              onPhotoBlob={handlePhotoBlob}
              onVideoFile={handleVideoFile}
              onGalleryFiles={(files) => void handleGalleryFiles(files)}
              onTextStory={handleTextStory}
              onClose={handleClose}
              maxVideoDurationSec={MAX_VIDEO_DURATION_SEC}
              reduceMotion={reduceMotion}
              topRightSlot={mode === 'official' ? (
                <Tap onClick={() => setManageOpen(true)} scale={0.94} className="rounded-full bg-black/30 px-3 py-1.5 text-caption font-semibold text-white backdrop-blur-sm">
                  Manage
                </Tap>
              ) : (
                <span className="h-9 w-9" aria-hidden="true" />
              )}
            />
            {processing && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/40">
                <div className="rounded-xl bg-black/70 px-4 py-2.5 text-caption font-medium text-white backdrop-blur-sm">Preparing your Story…</div>
              </div>
            )}
            {error && !processing && (
              <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-6" style={{ top: 'max(env(safe-area-inset-top), 12px)', marginTop: 56 }}>
                <div className="pointer-events-auto rounded-xl bg-black/70 px-3 py-2 text-center text-caption font-medium text-white backdrop-blur-sm">{error}</div>
              </div>
            )}
          </motion.div>
        ) : (
          <EditorStage
            key="editor"
            reduceMotion={reduceMotion}
            mode={mode}
            publisherType={publisherType}
            onPublisherChange={setPublisherType}
            ownerName={profile?.full_name || 'Owner'}
            ownerAvatarUrl={profile?.avatar_url ?? null}
            slides={slides}
            activeIndex={activeIndex}
            activeSlide={activeSlide}
            textareaRef={textareaRef}
            error={error}
            publishing={publishing}
            onSelectSlide={setActiveIndex}
            onRemoveActive={removeActiveSlide}
            onPatchActive={patchActiveSlide}
            onBack={backToCamera}
            onPublish={handlePublish}
          />
        )}
      </AnimatePresence>

      {manageOpen && (
        <SignalStoryComposer
          mode={mode}
          initialView="manage"
          onClose={() => setManageOpen(false)}
          onPublished={() => { setManageOpen(false); onPublished(); }}
        />
      )}
    </StoryCreatorShell>
  );
}

/** The one full-screen surface every stage renders inside — owns the
 *  swipe-down-to-dismiss gesture (Motion's own `drag`, same
 *  `dragElastic`/velocity-or-offset-threshold idiom `MotionSheet`
 *  already established) and the fast spring entrance. */
function StoryCreatorShell({
  reduceMotion,
  onDismiss,
  children,
}: {
  reduceMotion: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[300] flex flex-col bg-noir text-on-noir"
      role="dialog"
      aria-modal="true"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
      transition={reduceMotion ? { duration: 0 } : SPRING_SNAPPY}
      drag={reduceMotion ? false : 'y'}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.5 }}
      onDragEnd={(_e, info) => {
        if (info.velocity.y > 600 || info.offset.y > CLOSE_SWIPE_THRESHOLD_PX) onDismiss();
      }}
    >
      {children}
    </motion.div>
  );
}

function EditorStage({
  reduceMotion,
  mode,
  publisherType,
  onPublisherChange,
  ownerName,
  ownerAvatarUrl,
  slides,
  activeIndex,
  activeSlide,
  textareaRef,
  error,
  publishing,
  onSelectSlide,
  onRemoveActive,
  onPatchActive,
  onBack,
  onPublish,
}: {
  reduceMotion: boolean;
  mode: 'official' | 'self';
  publisherType: SignalPublisherType;
  onPublisherChange: (t: SignalPublisherType) => void;
  ownerName: string;
  ownerAvatarUrl: string | null;
  slides: StagedSlide[];
  activeIndex: number;
  activeSlide: StagedSlide | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  error: string | null;
  publishing: boolean;
  onSelectSlide: (i: number) => void;
  onRemoveActive: () => void;
  onPatchActive: (patch: Partial<StagedSlide>) => void;
  onBack: () => void;
  onPublish: () => void;
}) {
  const [captionOpen, setCaptionOpen] = useState(false);
  if (!activeSlide) return null;
  const isText = activeSlide.mediaType === 'text';

  return (
    <motion.div
      className="h-full w-full"
      initial={reduceMotion ? false : { opacity: 0, scale: 1.03 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
      transition={reduceMotion ? { duration: 0 } : SPRING_SMOOTH}
    >
      <StoryCanvas>
        {isText ? (
          <TextCanvas slide={activeSlide} textareaRef={textareaRef} onChange={(patch) => onPatchActive(patch)} />
        ) : activeSlide.mediaType === 'video' ? (
          <video src={activeSlide.preview} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
        ) : (
          <img src={activeSlide.preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}

        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-safe" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
          <Tap onClick={onBack} aria-label="Back" scale={0.9} className="grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50">
            <Icon name="chevronLeft" size={20} />
          </Tap>
          {slides.length > 1 && (
            <span className="rounded-full bg-black/30 px-2.5 py-1 text-caption font-semibold text-white/80 backdrop-blur-sm">
              {activeIndex + 1} / {slides.length}
            </span>
          )}
          <Tap onClick={onRemoveActive} aria-label="Remove" scale={0.9} className="grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50">
            <Icon name="trash" size={17} />
          </Tap>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 pb-safe pt-6">
          {!isText && (
            captionOpen ? (
              <input
                autoFocus
                value={activeSlide.caption}
                onChange={(e) => onPatchActive({ caption: e.target.value })}
                onBlur={() => { if (!activeSlide.caption.trim()) setCaptionOpen(false); }}
                placeholder="Add a caption…"
                maxLength={200}
                className="w-full border-0 bg-transparent text-body text-white placeholder:text-white/50 focus:outline-none focus:ring-0"
              />
            ) : (
              <button onClick={() => setCaptionOpen(true)} className="pressable self-start text-body text-white/80 hover:text-white">
                {activeSlide.caption || 'Add a caption…'}
              </button>
            )
          )}

          {isText && (
            <div className="flex items-center gap-3">
              <div className="flex gap-1 rounded-full bg-white/10 p-0.5">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onPatchActive({ textAlign: a })}
                    aria-label={`Align ${a}`}
                    aria-pressed={activeSlide.textAlign === a}
                    className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${activeSlide.textAlign === a ? 'bg-white text-noir' : 'text-white/70 hover:bg-white/10'}`}
                  >
                    <Icon name={a === 'left' ? 'chevronLeft' : a === 'right' ? 'chevronRight' : 'minus'} size={13} />
                  </button>
                ))}
              </div>
              <div className="flex gap-1 rounded-full bg-white/10 p-0.5">
                {(['sm', 'md', 'lg'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => onPatchActive({ textSize: sz })}
                    aria-label={`Text size ${sz}`}
                    aria-pressed={activeSlide.textSize === sz}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase transition-colors ${activeSlide.textSize === sz ? 'bg-white text-noir' : 'text-white/70 hover:bg-white/10'}`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {STORY_BG_STYLES.map((bg) => (
                  <button
                    key={bg.value}
                    type="button"
                    onClick={() => onPatchActive({ bgStyle: bg.value })}
                    aria-label={bg.label}
                    aria-pressed={activeSlide.bgStyle === bg.value}
                    className={`h-6 w-6 shrink-0 rounded-full ${bg.className} ${activeSlide.bgStyle === bg.value ? 'ring-2 ring-white ring-offset-2 ring-offset-noir' : ''}`}
                  />
                ))}
              </div>
            </div>
          )}

          {slides.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {slides.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => onSelectSlide(i)}
                  className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${i === activeIndex ? 'border-accent-bright' : 'border-transparent opacity-60'}`}
                >
                  {s.mediaType === 'video' ? (
                    <video src={s.preview} className="h-full w-full object-cover" muted playsInline />
                  ) : (
                    <img src={s.preview} alt="" className="h-full w-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}

          {mode === 'official' && (
            <div className="rounded-2xl bg-white/[0.06] p-2">
              <SignalPublisherPicker value={publisherType} onChange={onPublisherChange} ownerName={ownerName} ownerAvatarUrl={ownerAvatarUrl} />
            </div>
          )}

          {error && <p className="text-caption font-medium text-danger">{error}</p>}

          <Tap
            onClick={onPublish}
            disabled={publishing}
            scale={0.97}
            className="btn w-full justify-center bg-accent-bright text-noir hover:bg-accent-bright/90 disabled:opacity-60"
          >
            {publishing ? 'Posting…' : 'Post Story'}
          </Tap>
        </div>
      </StoryCanvas>
    </motion.div>
  );
}

/** The text Story canvas — same `StoryTextSlide` background/align/size
 *  treatment the viewer itself renders, with a real transparent
 *  `<textarea>` laid directly over it instead of a separate preview +
 *  separate input (what's being typed IS the Story, at all times). */
function TextCanvas({
  slide,
  textareaRef,
  onChange,
}: {
  slide: StagedSlide;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (patch: Partial<StagedSlide>) => void;
}) {
  const bgDef = STORY_BG_STYLES.find((b) => b.value === slide.bgStyle) ?? STORY_BG_STYLES[0];
  const alignClass = slide.textAlign === 'left' ? 'items-start text-left' : slide.textAlign === 'right' ? 'items-end text-right' : 'items-center text-center';
  const sizeClass = slide.textSize === 'sm' ? 'text-xl' : slide.textSize === 'lg' ? 'text-5xl' : 'text-3xl';
  return (
    <div className={`absolute inset-0 flex flex-col justify-center gap-2 p-8 ${bgDef.className} ${alignClass}`}>
      <textarea
        ref={textareaRef}
        value={slide.textContent ?? ''}
        onChange={(e) => onChange({ textContent: e.target.value })}
        placeholder="Type your Story…"
        maxLength={280}
        rows={4}
        className={`signal-story-text-input w-full resize-none whitespace-pre-wrap break-words border-0 bg-transparent font-display font-semibold leading-tight text-white placeholder:text-white/50 focus:outline-none focus:ring-0 ${sizeClass} ${alignClass}`}
      />
    </div>
  );
}
