import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { addVision, deleteVision, fetchVisions, updateVision, type Vision, type VisionLink } from '../../lib/data/visions';
import { fetchUserStamps, syncMyTripStamps, type TripStampData } from '../../lib/data/tripMemories';
import { fetchHostCars } from '../../lib/data/cars';
import { useAuth } from '../../lib/auth';
import { validateVideoFile, VIDEO_MIME_TYPES } from '../../lib/media';
import { useLocale } from '../../lib/i18n';
import { useApp } from '../../lib/store';
import { SignalMediaViewer } from './SignalMediaViewer';
import { VisibilityPicker } from './VisibilityPicker';
import { DEFAULT_VISIBILITY, type Visibility } from '../../lib/data/privacy';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
// The storage bucket itself is capped at 50 MB per file.
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SEC = 300;

/** A profile's CX Visions: a personal, professional portfolio of photos and
 *  videos — its own space, separate from posts and never in the Signal feed.
 *  The owner adds work here directly; everyone else just looks. Tiles open in
 *  the same fullscreen media viewer the feed uses, swipeable through the whole
 *  portfolio, with the title and caption underneath. No counts, badges or
 *  reactions anywhere. */
export function SignalVisionsTab({ userId, isMe, openVisionId }: { userId: string; isMe: boolean; openVisionId?: string | null }) {
  const [items, setItems] = useState<Vision[] | null>(null);
  const [adding, setAdding] = useState(false);
  const refresh = useCallback(async () => {
    setItems(await fetchVisions(userId, 60));
  }, [userId]);

  useEffect(() => {
    setItems(null);
    void refresh();
  }, [refresh]);

  return (
    <>
      <VisionsGrid
        items={items}
        isMe={isMe}
        initialOpenId={openVisionId}
        onAdd={() => setAdding(true)}
        onChanged={() => void refresh()}
        onDeleted={(id) => setItems((prev) => (prev ?? []).filter((v) => v.id !== id))}
      />
      {adding && <VisionUploadSheet onClose={() => setAdding(false)} onAdded={() => { setAdding(false); void refresh(); }} />}
    </>
  );
}

/** The portfolio layout itself — presentation plus the owner's "manage" mode. */
export function VisionsGrid({
  items, isMe, onAdd, onDeleted, onChanged, initialOpenId,
}: {
  items: Vision[] | null;
  isMe: boolean;
  onAdd?: () => void;
  onDeleted?: (id: string) => void;
  onChanged?: () => void;
  /** Deep link (a Spotlight card) — open this Vision once the list is in. */
  initialOpenId?: string | null;
}) {
  const { t } = useLocale();
  const { toast } = useApp();
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<Vision | null>(null);
  const [kind, setKind] = useState<'all' | 'image' | 'video'>('all');
  const hasBoth = Boolean(items && items.some((v) => v.mediaKind === 'image') && items.some((v) => v.mediaKind === 'video'));
  const shown = items ? (kind === 'all' || !hasBoth ? items : items.filter((v) => v.mediaKind === kind)) : null;
  const consumedDeepLink = useRef(false);
  useEffect(() => {
    if (!items || !initialOpenId || consumedDeepLink.current) return;
    const i = items.findIndex((v) => v.id === initialOpenId);
    if (i >= 0) {
      consumedDeepLink.current = true;
      setKind('all');
      setOpenAt(i);
    }
  }, [items, initialOpenId]);

  const remove = async (v: Vision) => {
    if (!window.confirm(t('Remove this from your Visions?'))) return;
    const { error } = await deleteVision(v.id);
    if (error) {
      toast({ title: 'Could not remove it', desc: error, icon: 'info' });
      return;
    }
    onDeleted?.(v.id);
  };

  return (
    <div>
      <header className="flex flex-col gap-4 px-1 pb-5 pt-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="text-micro font-semibold uppercase tracking-[0.3em] text-faint">CX Visions</p>
          <h2 className="mt-2 font-display text-[22px] font-semibold leading-tight tracking-tight text-ink">{t('The moments worth keeping.')}</h2>
        </div>
        {isMe && (
          <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
            {items && items.length > 0 && (
              <button
                type="button"
                onClick={() => setManaging((m) => !m)}
                aria-pressed={managing}
                className={`pressable min-h-10 rounded-full px-3.5 text-detail font-semibold transition-colors ${managing ? 'bg-panel text-ink' : 'text-muted hover:text-ink'}`}
              >
                {managing ? t('Done') : t('Manage')}
              </button>
            )}
            <button type="button" onClick={onAdd} className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-detail font-semibold text-white transition-colors hover:bg-ink/90">
              <Icon name="plus" size={15} strokeWidth={2.6} /> {t('Add')}
            </button>
          </div>
        )}
      </header>

      {isMe && <SpotlightRules />}

      {hasBoth && (
        <div className="mb-3 flex items-center gap-1.5" role="tablist" aria-label="Filter">
          {([['all', t('All')], ['image', t('Photos')], ['video', t('Videos')]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`pressable min-h-9 rounded-full px-3.5 text-caption font-semibold transition-colors ${kind === k ? 'bg-ink text-white' : 'bg-panel text-ink-soft hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {items === null && (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <span key={i} className="skeleton aspect-[4/5] rounded-sm" />)}
        </div>
      )}

      {items && items.length === 0 && (
        <div className="px-6 py-14 text-center">
          <p className="text-body text-muted">
            {isMe ? t('Your portfolio is empty. Add the photos and videos you want to be remembered for.') : t('No Visions yet.')}
          </p>
          {isMe && (
            <button type="button" onClick={onAdd} className="pressable mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-detail font-semibold text-white">
              <Icon name="plus" size={15} strokeWidth={2.6} /> {t('Add to Visions')}
            </button>
          )}
        </div>
      )}

      {shown && shown.length > 0 && (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:grid-flow-dense">
          {shown.map((v, i) => {
            const isVideo = v.mediaKind === 'video';
            // Only with two tiles after it to sit beside — otherwise the big tile would have no height.
            const feature = i % 5 === 0 && i + 2 < shown.length;
            return (
              <div key={v.id} style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }} className={`relative aspect-[4/5] animate-fade-up [animation-fill-mode:backwards] ${feature ? 'sm:col-span-2 sm:row-span-2 sm:aspect-auto' : ''}`}>
                <button
                  type="button"
                  onClick={() => (managing ? undefined : setOpenAt(i))}
                  aria-label={v.title || 'Vision'}
                  className="pressable group absolute inset-0 overflow-hidden bg-panel"
                >
                  {isVideo ? (
                    <video src={v.mediaUrl} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <Img src={v.mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" fallback={<span className="grid h-full w-full place-items-center text-muted"><Icon name="image" size={22} /></span>} />
                  )}
                  {isVideo && (
                    <span className="pointer-events-none absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"><Icon name="play" size={10} fill /></span>
                  )}
                </button>
                {isMe && v.visibility && v.visibility !== 'public' && !managing && (
                  <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                    <Icon name={v.visibility === 'private' ? 'lock' : v.visibility === 'circle' ? 'sparkles' : 'users'} size={11} />
                  </span>
                )}
                {v.title && !managing && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2.5 pb-2 pt-8">
                    <span translate="no" className="line-clamp-1 text-[12px] font-medium text-white/95">{v.title}</span>
                  </span>
                )}
                {v.spotlighted && !managing && (
                  <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                    <Icon name="sparkles" size={10} /> Spotlight
                  </span>
                )}
                {managing && (
                  <div className="absolute left-2 top-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditing(v)}
                      aria-label={t('Edit')}
                      className="grid h-9 w-9 place-items-center rounded-full bg-black/65 text-white backdrop-blur-sm transition-colors hover:bg-black/85"
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(v)}
                      aria-label={t('Remove')}
                      className="grid h-9 w-9 place-items-center rounded-full bg-black/65 text-white backdrop-blur-sm transition-colors hover:bg-danger"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && <VisionEditSheet vision={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged?.(); }} />}

      {shown && openAt !== null && shown[openAt] && (
        <SignalMediaViewer
          images={shown.map((v) => v.mediaUrl)}
          captions={shown.map((v) => ({ title: v.title, caption: v.caption, badge: v.spotlighted ? t('Selected for Signal Spotlight') : null }))}
          sharedKey="visions"
          startIndex={openAt}
          onClose={() => setOpenAt(null)}
        />
      )}
    </div>
  );
}

interface Staged { file: File; preview: string; kind: 'image' | 'video' }

/** Add photos/videos to the portfolio. One file → give it a title and caption;
 *  several → they go in together, untitled. */
export function VisionUploadSheet({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { t } = useLocale();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [link, setLink] = useState<VisionLink>({ tripStampId: null, carId: null });
  // New Visions start with followers only — public is a choice.
  const [visibility, setVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setChecking(true);
    setError(null);
    const next: Staged[] = [];
    let firstError: string | null = null;
    for (const file of Array.from(list)) {
      if (staged.length + next.length >= 12) { firstError ??= t('Up to 12 at a time.'); break; }
      if (IMAGE_TYPES.includes(file.type)) {
        if (file.size > MAX_IMAGE_BYTES) { firstError ??= `“${file.name}” ${t('is larger than 25 MB.')}`; continue; }
        const preview = URL.createObjectURL(file);
        urls.current.push(preview);
        next.push({ file, preview, kind: 'image' });
      } else {
        const r = await validateVideoFile(file, { maxBytes: MAX_VIDEO_BYTES, maxDurationSec: MAX_VIDEO_SEC });
        if (!r.ok) { firstError ??= r.error ?? `“${file.name}”`; continue; }
        const preview = URL.createObjectURL(file);
        urls.current.push(preview);
        next.push({ file, preview, kind: 'video' });
      }
    }
    setStaged((s) => [...s, ...next]);
    setError(firstError);
    setChecking(false);
  };

  const publish = async () => {
    if (staged.length === 0 || progress) return;
    setError(null);
    setProgress({ done: 0, total: staged.length });
    const single = staged.length === 1;
    for (let i = 0; i < staged.length; i++) {
      const s = staged[i];
      const { error: err } = await addVision(s.file, s.kind, single ? title : '', single ? caption : '', single ? link : undefined, visibility);
      if (err) {
        setError(err);
        setProgress(null);
        return;
      }
      setProgress({ done: i + 1, total: staged.length });
    }
    onAdded();
  };

  const busy = Boolean(progress) || checking;
  return (
    <div className="fixed inset-0 z-[320] flex items-end justify-center bg-black/55 sm:items-center" role="dialog" aria-modal="true" onClick={busy ? undefined : onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop sm:max-w-lg sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-micro font-semibold uppercase tracking-[0.3em] text-faint">CX Visions</p>
            <h3 className="mt-1.5 font-display text-[20px] font-semibold text-ink">{t('Add to Visions')}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-panel hover:text-ink disabled:opacity-40">
            <Icon name="x" size={18} />
          </button>
        </div>

        <label className={`pressable mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong bg-panel/50 px-4 py-5 text-center text-detail font-semibold text-ink-soft transition-colors hover:border-ink ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          <Icon name="image" size={22} />
          {checking ? t('Checking…') : staged.length > 0 ? t('Add more') : t('Choose photos or videos')}
          <span className="text-caption font-normal text-muted">{t('Photos up to 25 MB · videos up to 50 MB')}</span>
          <input
            type="file"
            multiple
            accept={[...IMAGE_TYPES, ...VIDEO_MIME_TYPES].join(',')}
            className="hidden"
            onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }}
          />
        </label>

        {staged.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {staged.map((s, i) => (
              <div key={s.preview} className="group relative aspect-square overflow-hidden rounded-lg bg-panel">
                {s.kind === 'video' ? <video src={s.preview} muted playsInline className="h-full w-full object-cover" /> : <img src={s.preview} alt="" className="h-full w-full object-cover" />}
                {s.kind === 'video' && <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/20 text-white"><Icon name="play" size={16} fill /></span>}
                {!busy && (
                  <button type="button" onClick={() => setStaged((p) => p.filter((_, j) => j !== i))} aria-label="Remove" className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white">
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {staged.length === 1 && (
          <div className="mt-4 space-y-2">
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder={t('Title (optional)')} className="input !py-3 font-display font-semibold" disabled={busy} />
            <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 400))} rows={3} placeholder={t('Caption — place, camera, story… (optional)')} className="input resize-none !py-3" disabled={busy} />
            <VisionLinkFields link={link} onChange={setLink} disabled={busy} />
          </div>
        )}

        {staged.length > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-caption text-faint">{t('Who can see this')}</span>
            <VisibilityPicker value={visibility} onChange={setVisibility} disabled={busy} />
          </div>
        )}

        {error && <p className="mt-3 text-detail font-medium text-danger">{error}</p>}

        <button
          type="button"
          onClick={publish}
          disabled={staged.length === 0 || busy}
          className="btn btn-primary mt-4 min-h-12 w-full justify-center rounded-full text-[15px] disabled:opacity-50"
        >
          {progress ? `${t('Uploading')} ${progress.done}/${progress.total}…` : t('Add to Visions')}
        </button>
      </div>
    </div>
  );
}

/** Optional "Link to" (a verified trip, or one of your own listed cars) — it only
 *  lets a Spotlight show the city and the car. Nothing to fill in to be considered. */
function VisionLinkFields({ link, onChange, disabled }: { link: VisionLink; onChange: (l: VisionLink) => void; disabled?: boolean }) {
  const { t } = useLocale();
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const [stamps, setStamps] = useState<TripStampData[]>([]);
  const [cars, setCars] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      await syncMyTripStamps().catch(() => undefined);
      const [st, hc] = await Promise.all([
        fetchUserStamps(uid).catch(() => [] as TripStampData[]),
        profile?.is_host ? fetchHostCars(uid).catch(() => []) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setStamps(st);
      setCars(hc.map((c) => ({ id: c.id, label: `${c.make} ${c.model} ${c.year}` })));
    })();
    return () => { cancelled = true; };
  }, [uid, profile?.is_host]);

  if (stamps.length === 0 && cars.length === 0) return null;
  const value = link.tripStampId ? `stamp:${link.tripStampId}` : link.carId ? `car:${link.carId}` : '';
  const pick = (v: string) => {
    if (!v) onChange({ tripStampId: null, carId: null });
    else if (v.startsWith('stamp:')) onChange({ tripStampId: v.slice(6), carId: null });
    else onChange({ tripStampId: null, carId: v.slice(4) });
  };
  return (
    <div className="rounded-2xl border border-line bg-panel/50 p-3">
      <label className="block">
        <span className="field-label">{t('Link to')} <span className="font-normal text-faint">({t('optional')})</span></span>
        <select value={value} onChange={(e) => pick(e.target.value)} disabled={disabled} className="input mt-1.5 !py-3">
          <option value="">{t('Nothing')}</option>
          {stamps.length > 0 && (
            <optgroup label={t('Verified trips')}>
              {stamps.map((s) => <option key={s.id} value={`stamp:${s.id}`}>{`${s.car.make} ${s.car.model} · ${s.city}`}</option>)}
            </optgroup>
          )}
          {cars.length > 0 && (
            <optgroup label={t('My cars')}>
              {cars.map((c) => <option key={c.id} value={`car:${c.id}`}>{c.label}</option>)}
            </optgroup>
          )}
        </select>
      </label>
    </div>
  );
}

/** Edit a Vision's title, caption, link and Spotlight candidacy. */
function VisionEditSheet({ vision, onClose, onSaved }: { vision: Vision; onClose: () => void; onSaved: () => void }) {
  const { t } = useLocale();
  const { toast } = useApp();
  const [title, setTitle] = useState(vision.title ?? '');
  const [caption, setCaption] = useState(vision.caption ?? '');
  const [link, setLink] = useState<VisionLink>({ tripStampId: vision.tripStampId, carId: vision.carId });
  const [visibility, setVisibility] = useState<Visibility>((vision.visibility ?? 'public') as Visibility);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await updateVision(vision.id, title, caption, link, visibility);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save', desc: error, icon: 'info' });
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-end justify-center bg-black/55 sm:items-center" role="dialog" aria-modal="true" onClick={saving ? undefined : onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop sm:max-w-lg sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-[20px] font-semibold text-ink">{t('Edit Vision')}</h3>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-panel hover:text-ink"><Icon name="x" size={18} /></button>
        </div>
        <div className="mt-4 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder={t('Title (optional)')} className="input !py-3 font-display font-semibold" disabled={saving} />
          <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 400))} rows={3} placeholder={t('Caption — place, camera, story… (optional)')} className="input resize-none !py-3" disabled={saving} />
          <VisionLinkFields link={link} onChange={setLink} disabled={saving} />
          <div className="flex items-center gap-2 pt-1">
            <span className="text-caption text-faint">{t('Who can see this')}</span>
            <VisibilityPicker value={visibility} onChange={setVisibility} disabled={saving} />
          </div>
        </div>
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary mt-4 min-h-12 w-full justify-center rounded-full text-[15px] disabled:opacity-50">
          {saving ? t('Saving…') : t('Save')}
        </button>
      </div>
    </div>
  );
}

/** What Signal Spotlight is and how CX picks — shown to the Vision's owner. */
function SpotlightRules() {
  const { t } = useLocale();
  return (
    <div className="mb-5 flex gap-3 rounded-2xl border border-line bg-panel/50 px-3.5 py-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-white"><Icon name="sparkles" size={13} /></span>
      <div className="min-w-0">
        <p className="text-micro font-semibold uppercase tracking-[0.22em] text-ink">{t('How Spotlight works')}</p>
        <p className="mt-1 text-caption leading-relaxed text-muted">
          {t('Every week the CX team picks one or two Visions for Signal Spotlight — sometimes none. Quality and professionalism decide; the best work gets more visibility.')}
        </p>
        <p className="mt-1 text-caption leading-relaxed text-faint">{t('Picked from the public Visions of verified accounts.')}</p>
      </div>
    </div>
  );
}
