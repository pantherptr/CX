import { useEffect, useState, type ChangeEvent } from 'react';
import { Icon } from './Icon';
import { Img } from './motion';
import { useApp } from '../lib/store';
import { getSignedUrl } from '../lib/data/verification';
import { shrinkImage } from '../lib/shrinkImage';
import { useLocale } from '../lib/i18n';
import {
  INSPECTION_ANGLES,
  uploadInspectionPhoto,
  type InspectionAngle,
  type InspectionPhase,
  type InspectionPhoto,
} from '../lib/data/inspections';

/** One angle's tile: either a real uploaded photo (signed URL) or an
 *  upload placeholder. No fake "pending" state — a tile is either done or
 *  it isn't. */
function Tile({
  angle,
  label,
  photo,
  uploading,
  disabled,
  onUpload,
}: {
  angle: InspectionAngle;
  label: string;
  photo: InspectionPhoto | undefined;
  uploading: boolean;
  disabled: boolean;
  onUpload: (angle: InspectionAngle, file: File) => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    getSignedUrl('inspection-photos', photo.photoPath).then((url) => {
      if (!cancelled) setSignedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [photo]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onUpload(angle, file);
  };

  if (signedUrl) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-line">
        <Img
          src={signedUrl}
          alt={label}
          className="aspect-[4/3] w-full object-cover"
          fallback={<span className="grid aspect-[4/3] w-full place-items-center bg-panel text-muted"><Icon name="image" size={22} /></span>}
        />
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-2 pb-1.5 pt-4 text-label font-medium text-white">{label}</span>
        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
          <Icon name="check" size={11} strokeWidth={3} />
        </span>
      </div>
    );
  }

  return (
    <label
      className={`flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-center transition-colors ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-ink hover:bg-panel'
      }`}
    >
      <Icon name="camera" size={18} className="text-muted" />
      <span className="px-1.5 text-label font-medium text-muted">{uploading ? 'Uploading…' : label}</span>
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChange} disabled={disabled || uploading} />
    </label>
  );
}

export function InspectionGrid({
  bookingId,
  uploaderId,
  phase,
  photos,
  onUploaded,
  locked,
  lockedMessage,
}: {
  bookingId: string;
  uploaderId: string;
  phase: InspectionPhase;
  photos: InspectionPhoto[];
  onUploaded: () => void;
  locked?: boolean;
  lockedMessage?: string;
}) {
  const { toast } = useApp();
  const [uploadingAngle, setUploadingAngle] = useState<InspectionAngle | null>(null);

  const handleUpload = async (angle: InspectionAngle, file: File) => {
    setUploadingAngle(angle);
    const small = await shrinkImage(file).catch(() => file);
    const { error } = await uploadInspectionPhoto(bookingId, uploaderId, phase, angle, small);
    setUploadingAngle(null);
    if (error) {
      toast({ title: 'Could not upload photo', desc: error, icon: 'info' });
      return;
    }
    onUploaded();
  };

  if (locked) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-line py-8 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted"><Icon name="camera" size={20} /></span>
        <p className="max-w-xs text-detail text-muted">{lockedMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
      {INSPECTION_ANGLES.map((a) => (
        <Tile
          key={a.id}
          angle={a.id}
          label={a.label}
          photo={photos.find((p) => p.phase === phase && p.angle === a.id)}
          uploading={uploadingAngle === a.id}
          disabled={uploadingAngle !== null}
          onUpload={handleUpload}
        />
      ))}
    </div>
  );
}

const MAIN_ANGLES: InspectionAngle[] = ['front', 'rear', 'left', 'right'];

/** The simple version: one card, one thing at a time. Four photos (front, back, both sides) before pick-up
 *  and the same four after return; interior, dashboard and fuel are optional extras. */
export function InspectionCard({
  bookingId,
  uploaderId,
  photos,
  onUploaded,
  afterLocked,
  startOnReturn,
}: {
  bookingId: string;
  uploaderId: string;
  photos: InspectionPhoto[];
  onUploaded: () => void;
  /** The "after return" tab is not open yet (the trip has not started). */
  afterLocked: boolean;
  /** Open on the "after return" tab (the car has already changed hands). */
  startOnReturn: boolean;
}) {
  const { t } = useLocale();
  const { toast } = useApp();
  const [phase, setPhase] = useState<InspectionPhase>(startOnReturn && !afterLocked ? 'post' : 'pre');
  const [more, setMore] = useState(false);
  const [uploadingAngle, setUploadingAngle] = useState<InspectionAngle | null>(null);

  const done = MAIN_ANGLES.filter((a) => photos.some((p) => p.phase === phase && p.angle === a)).length;
  const extras = INSPECTION_ANGLES.filter((a) => !MAIN_ANGLES.includes(a.id));
  const complete = done === MAIN_ANGLES.length;

  const upload = async (angle: InspectionAngle, file: File) => {
    setUploadingAngle(angle);
    const small = await shrinkImage(file).catch(() => file);
    const { error } = await uploadInspectionPhoto(bookingId, uploaderId, phase, angle, small);
    setUploadingAngle(null);
    if (error) {
      toast({ title: t('Could not upload photo'), desc: error, icon: 'info' });
      return;
    }
    onUploaded();
  };

  const tile = (id: InspectionAngle, label: string) => (
    <Tile
      key={`${phase}-${id}`}
      angle={id}
      label={t(label)}
      photo={photos.find((p) => p.phase === phase && p.angle === id)}
      uploading={uploadingAngle === id}
      disabled={uploadingAngle !== null}
      onUpload={upload}
    />
  );

  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-hair sm:p-5">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-panel p-1" role="tablist">
        {(['pre', 'post'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={phase === p}
            onClick={() => setPhase(p)}
            className={`rounded-xl py-2.5 text-detail font-semibold transition-colors ${phase === p ? 'bg-surface text-ink shadow-hair' : 'text-muted'}`}
          >
            {p === 'pre' ? t('Before pick-up') : t('After return')}
          </button>
        ))}
      </div>

      {phase === 'post' && afterLocked ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-panel text-muted"><Icon name="camera" size={21} /></span>
          <p className="max-w-[16rem] text-detail text-muted">{t('Opens once your trip has started.')}</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-detail text-muted">
              {phase === 'pre'
                ? t('Four photos of the car: front, back and both sides. They protect you and the host.')
                : t('The same four photos, after the car is back.')}
            </p>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-caption font-bold ${complete ? 'bg-accent text-white' : 'bg-panel text-ink-soft'}`}>
              {complete ? t('Done') : `${done}/4`}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / 4) * 100}%` }} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {MAIN_ANGLES.map((id) => tile(id, INSPECTION_ANGLES.find((a) => a.id === id)?.label ?? id))}
          </div>

          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            className="mt-4 inline-flex items-center gap-1.5 text-detail font-semibold text-ink-soft"
          >
            <Icon name={more ? 'chevronUp' : 'chevronDown'} size={15} /> {t('More photos (optional)')}
          </button>
          {more && <div className="mt-3 grid grid-cols-3 gap-3">{extras.map((a) => tile(a.id, a.label))}</div>}
        </>
      )}
    </div>
  );
}
