import { useEffect, useState, type ChangeEvent } from 'react';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import { getSignedUrl } from '../lib/data/verification';
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
        <img src={signedUrl} alt={label} className="aspect-square w-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-2 pb-1.5 pt-4 text-[11px] font-medium text-white">{label}</span>
        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
          <Icon name="check" size={11} strokeWidth={3} />
        </span>
      </div>
    );
  }

  return (
    <label
      className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-center transition-colors ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-ink hover:bg-panel'
      }`}
    >
      <Icon name="camera" size={18} className="text-muted" />
      <span className="px-1.5 text-[11px] font-medium text-muted">{uploading ? 'Uploading…' : label}</span>
      <input type="file" accept="image/*" className="hidden" onChange={handleChange} disabled={disabled || uploading} />
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
    const { error } = await uploadInspectionPhoto(bookingId, uploaderId, phase, angle, file);
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
        <p className="max-w-xs text-[13px] text-muted">{lockedMessage}</p>
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
