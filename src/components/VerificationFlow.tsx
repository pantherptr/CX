import { ActionLabel } from './ui/loading-button';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useApp } from '../lib/store';
import { haptics } from '../lib/native';
import {
  ID_DOC_LABEL,
  submitIdentity,
  submitLicence,
  type DocStatus,
  type IdDocType,
  type Verification,
} from '../lib/data/verification';

/** A single photo slot: big tap target, shows the chosen photo, can be replaced. */
function PhotoSlot({
  label,
  hint,
  icon,
  file,
  onPick,
  capture,
  disabled,
}: {
  label: string;
  hint: string;
  icon: IconName;
  file: File | null;
  onPick: (f: File) => void;
  capture?: 'user' | 'environment';
  disabled?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <label className={`group relative flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[20px] border-2 border-dashed text-center transition-all active:scale-[0.985] ${
      file ? 'border-accent/50 bg-white' : 'border-line bg-panel/60 hover:border-accent/40'
    } ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      {url ? (
        <>
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          <span className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-left text-caption font-semibold text-white">
            <span className="flex items-center gap-1.5"><Icon name="checkCircle" size={15} className="text-accent-bright" /> {label}</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 backdrop-blur">Change</span>
          </span>
        </>
      ) : (
        <span className="flex flex-col items-center gap-1.5 px-3 py-4">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-accent shadow-hair ring-1 ring-line"><Icon name={icon} size={20} /></span>
          <span className="text-body font-semibold text-ink">{label}</span>
          <span className="text-caption text-muted">{hint}</span>
        </span>
      )}
      <input
        type="file"
        accept="image/*"
        {...(capture ? { capture } : {})}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }}
      />
    </label>
  );
}

const statusChip = (s: DocStatus) => {
  if (s === 'approved') return { text: 'Verified', cls: 'bg-accent/10 text-accent' };
  if (s === 'pending') return { text: 'In review', cls: 'bg-warn/15 text-warn-ink' };
  if (s === 'rejected') return { text: 'Needs a new photo', cls: 'bg-danger/10 text-danger' };
  return { text: 'Not started', cls: 'bg-panel text-muted' };
};

function StepShell({
  icon,
  title,
  subtitle,
  status,
  reason,
  open,
  onToggle,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  status: DocStatus;
  reason?: string | null;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const chip = statusChip(status);
  return (
    <section className="overflow-hidden rounded-[24px] border border-line bg-surface shadow-hair">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3.5 p-4 text-left transition-colors active:bg-panel">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${status === 'approved' ? 'bg-gradient-to-b from-accent-bright to-accent text-white shadow-[0_8px_18px_-8px_rgba(0,133,54,0.7)]' : 'bg-panel text-ink-soft'}`}>
          <Icon name={status === 'approved' ? 'check' : icon} size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[17px] font-semibold leading-tight text-ink">{title}</span>
          <span className="mt-0.5 block text-detail text-muted">{subtitle}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-caption font-semibold ${chip.cls}`}>{chip.text}</span>
      </button>
      {status === 'rejected' && reason && (
        <div className="mx-4 mb-3 flex gap-2.5 rounded-2xl bg-danger/[0.07] p-3 text-detail text-danger">
          <Icon name="info" size={17} className="mt-0.5 shrink-0" />
          <span><span className="font-semibold">Why: </span>{reason}</span>
        </div>
      )}
      {open && <div className="border-t border-line p-4 sm:p-5">{children}</div>}
    </section>
  );
}

const DOC_TYPES: { id: IdDocType; icon: IconName; hint: string }[] = [
  { id: 'id_card', icon: 'card', hint: 'Both sides' },
  { id: 'passport', icon: 'globe', hint: 'Photo page' },
  { id: 'residence_permit', icon: 'shield', hint: 'Both sides' },
  { id: 'driving_licence', icon: 'car', hint: 'Both sides · also counts as your licence' },
];

function IdentityForm({ userId, onDone, current }: { userId: string; onDone: () => void; current: Verification | null }) {
  const { toast } = useApp();
  const [docType, setDocType] = useState<IdDocType>(current?.identityDocType ?? 'id_card');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const needsBack = docType !== 'passport';
  const ready = !!front && !!selfie && (!needsBack || !!back);

  const submit = async () => {
    if (!ready || !front || !selfie) return;
    setBusy(true);
    const { error } = await submitIdentity(userId, { docType, front, back, selfie });
    setBusy(false);
    if (error) { toast({ title: 'Could not send your documents', desc: error, icon: 'info' }); return; }
    haptics.success();
    toast({ title: 'Sent for review', desc: 'We usually reply within a day.', icon: 'checkCircle' });
    onDone();
  };

  return (
    <div>
      <p className="text-caption font-semibold uppercase tracking-wide text-muted">Which document?</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {DOC_TYPES.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDocType(d.id)}
            className={`rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${docType === d.id ? 'border-accent bg-accent/[0.06] ring-2 ring-accent/25' : 'border-line bg-white'}`}
          >
            <span className={`grid h-8 w-8 place-items-center rounded-full ${docType === d.id ? 'bg-accent text-white' : 'bg-panel text-ink-soft'}`}><Icon name={d.icon} size={16} /></span>
            <span className="mt-2 block text-detail font-semibold text-ink">{ID_DOC_LABEL[d.id]}</span>
            <span className="block text-caption text-muted">{d.hint}</span>
          </button>
        ))}
      </div>

      <div className={`mt-4 grid gap-2.5 ${needsBack ? 'sm:grid-cols-2' : ''}`}>
        <PhotoSlot label={needsBack ? 'Front' : 'Photo page'} hint="Tap to take or choose a photo" icon="camera" file={front} onPick={setFront} disabled={busy} />
        {needsBack && <PhotoSlot label="Back" hint="Tap to take or choose a photo" icon="camera" file={back} onPick={setBack} disabled={busy} />}
      </div>
      <div className="mt-2.5">
        <PhotoSlot label="Selfie" hint="Your face, in good light" icon="user" file={selfie} onPick={setSelfie} capture="user" disabled={busy} />
      </div>

      {docType === 'driving_licence' && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-accent/[0.07] p-3 text-detail text-accent">
          <Icon name="sparkles" size={16} className="mt-0.5 shrink-0" />
          One upload, two steps: we will use this licence for your driving-licence verification too.
        </p>
      )}
      <ul className="mt-3 space-y-1 text-caption text-muted">
        <li>· All four corners visible, nothing covering the text.</li>
        <li>· Good light, no glare. Not a screenshot.</li>
      </ul>

      <button onClick={submit} disabled={!ready || busy} className="btn btn-primary btn-lg btn-block mt-4 disabled:opacity-50">
        <ActionLabel busy={busy} busyLabel="Uploading…">Send for verification</ActionLabel>
      </button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-caption text-muted"><Icon name="lock" size={12} /> Stored privately. Only our team can open them.</p>
    </div>
  );
}

export function LicenceForm({ userId, onDone, compact }: { userId: string; onDone: () => void; compact?: boolean }) {
  const { toast } = useApp();
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = !!front && !!back;

  const submit = async () => {
    if (!front || !back) return;
    setBusy(true);
    const { error } = await submitLicence(userId, { front, back });
    setBusy(false);
    if (error) { toast({ title: 'Could not send your licence', desc: error, icon: 'info' }); return; }
    haptics.success();
    toast({ title: 'Licence sent', desc: 'You can keep going — we check it before hand-over.', icon: 'checkCircle' });
    onDone();
  };

  return (
    <div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <PhotoSlot label="Licence — front" hint="Tap to take or choose a photo" icon="camera" file={front} onPick={setFront} disabled={busy} />
        <PhotoSlot label="Licence — back" hint="Tap to take or choose a photo" icon="camera" file={back} onPick={setBack} disabled={busy} />
      </div>
      <button onClick={submit} disabled={!ready || busy} className={`btn btn-primary btn-block mt-3 disabled:opacity-50 ${compact ? '' : 'btn-lg'}`}>
        <ActionLabel busy={busy} busyLabel="Uploading…">Send licence</ActionLabel>
      </button>
    </div>
  );
}

/** Settings → Verification: two clear steps, nothing forced. */
export function VerificationFlow({
  userId,
  verification,
  onChanged,
  focus,
}: {
  userId: string;
  verification: Verification | null;
  onChanged: () => void;
  focus?: 'identity' | 'licence';
}) {
  const v = verification;
  const identityStatus: DocStatus = v?.identityStatus ?? 'none';
  const licenceStatus: DocStatus = v?.licenceStatus ?? 'none';
  const [open, setOpen] = useState<'identity' | 'licence' | null>(focus ?? null);
  const first = useRef(true);

  // Open the step that needs attention once, when the data arrives.
  useEffect(() => {
    if (!first.current) return;
    if (focus) { setOpen(focus); first.current = false; return; }
    if (v === null) return;
    first.current = false;
    if (identityStatus === 'none' || identityStatus === 'rejected') setOpen('identity');
    else if (licenceStatus === 'none' || licenceStatus === 'rejected') setOpen('licence');
  }, [v, focus, identityStatus, licenceStatus]);

  const done = useMemo(() => [identityStatus, licenceStatus].filter((s) => s === 'approved').length, [identityStatus, licenceStatus]);
  const progress = ((identityStatus !== 'none' ? 1 : 0) + (licenceStatus !== 'none' ? 1 : 0)) / 2;

  const after = () => { setOpen(null); onChanged(); };

  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-[24px] bg-gradient-to-br from-[#0b1a10] via-[#0f3a1d] to-accent p-5 text-white shadow-[0_18px_40px_-20px_rgba(0,133,54,0.7)]">
        <p className="text-caption font-semibold uppercase tracking-wider text-white/70">Your profile</p>
        <p className="mt-1 font-display text-[1.35rem] font-bold leading-tight">
          {done === 2 ? 'Fully verified' : identityStatus === 'approved' ? 'Verified profile' : 'Get verified'}
        </p>
        <p className="mt-1 text-detail text-white/80">
          {identityStatus === 'approved'
            ? licenceStatus === 'approved' ? 'You are ready to rent and to post on SIGNAL.' : 'Add your driving licence when you want to rent a car.'
            : 'Takes about two minutes. A verified badge builds trust with hosts and the community.'}
        </p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-accent-bright transition-all duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>

      <StepShell
        icon="verified"
        title="Verify your identity"
        subtitle="ID card, passport, residence permit or licence + a selfie"
        status={identityStatus}
        reason={v?.identityReason}
        open={open === 'identity'}
        onToggle={() => setOpen((o) => (o === 'identity' ? null : 'identity'))}
      >
        {identityStatus === 'approved' ? (
          <p className="text-detail text-muted">Your identity is confirmed. You can send a new document any time from here.</p>
        ) : identityStatus === 'pending' ? (
          <p className="mb-4 text-detail text-muted">Our team is reviewing your documents — usually within a day. You can replace them below if you made a mistake.</p>
        ) : null}
        {identityStatus !== 'approved' && <IdentityForm userId={userId} current={v} onDone={after} />}
      </StepShell>

      <StepShell
        icon="car"
        title="Driving licence"
        subtitle={identityStatus === 'approved' || licenceStatus !== 'none' ? 'Needed before you rent a car — not for SIGNAL' : 'Needed before you rent a car'}
        status={licenceStatus}
        reason={v?.licenceReason}
        open={open === 'licence'}
        onToggle={() => setOpen((o) => (o === 'licence' ? null : 'licence'))}
      >
        {licenceStatus === 'approved' ? (
          <p className="text-detail text-muted">Your licence is verified. You are ready to rent.</p>
        ) : (
          <>
            {licenceStatus === 'pending' && <p className="mb-4 text-detail text-muted">Our team is checking your licence. You can already book — it is confirmed before hand-over.</p>}
            <LicenceForm userId={userId} onDone={after} />
          </>
        )}
      </StepShell>

      {identityStatus === 'none' && licenceStatus === 'none' && (
        <p className="px-1 text-center text-caption text-muted">Only here for SIGNAL? Identity is all you need — no licence required.</p>
      )}
    </div>
  );
}

/** A quiet one-line prompt for dashboards: shows only when something is left to do. */
export function VerifyNudge({ verification, loading }: { verification: Verification | null; loading?: boolean }) {
  if (loading) return null;
  const id = verification?.identityStatus ?? 'none';
  const lic = verification?.licenceStatus ?? 'none';
  const rejected = id === 'rejected' || lic === 'rejected';
  // Once the photos have been sent (waiting for review or already approved) there is nothing left for the
  // person to do, so the bar goes away. It stays only for: a document to redo, identity not sent at all, or
  // identity approved with no licence sent yet (needed to rent).
  const idSent = id === 'pending' || id === 'approved';
  if (!rejected && idSent && !(id === 'approved' && lic === 'none')) return null;
  const text = rejected
    ? 'A document needs a new photo — tap to see why.'
    : id === 'none'
      ? 'Verify your profile — two minutes, and your badge builds trust.'
      : id === 'approved' && lic === 'none'
        ? 'Add your driving licence to start renting.'
        : 'Finish your verification.';
  return (
    <Link
      to={lic === 'none' && id === 'approved' ? '/settings#licence' : '/settings#verification'}
      className={`mt-4 flex items-center gap-3 rounded-2xl p-3 pr-4 text-detail font-semibold transition-transform active:scale-[0.99] ${
        rejected ? 'bg-danger/[0.07] text-danger' : 'bg-accent/[0.08] text-accent'
      }`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${rejected ? 'bg-danger/10' : 'bg-accent/15'}`}><Icon name={rejected ? 'info' : 'verified'} size={18} /></span>
      <span className="min-w-0 flex-1">{text}</span>
      <Icon name="chevronRight" size={16} className="shrink-0" />
    </Link>
  );
}
