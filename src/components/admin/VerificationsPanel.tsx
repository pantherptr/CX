import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { useApp } from '../../lib/store';
import { fetchVerificationCases, decideVerification, type VerificationCase } from '../../lib/data/admin';
import { getSignedUrl, ID_DOC_LABEL, REJECTION_REASONS, type DocStatus } from '../../lib/data/verification';
import { uiLocale } from '../../lib/i18n/uiLocale';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(uiLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const chip = (s: DocStatus) =>
  s === 'approved' ? 'bg-accent/10 text-accent'
  : s === 'pending' ? 'bg-warn/15 text-warn-ink'
  : s === 'rejected' ? 'bg-danger/10 text-danger'
  : 'bg-panel text-muted';

/** One private document: signed link fetched on demand, tap to open it large. */
function Doc({ path, label, onOpen }: { path: string | null; label: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    setUrl(null);
    if (path) void getSignedUrl('verification-documents', path, 900).then((u) => { if (!off) setUrl(u); });
    return () => { off = true; };
  }, [path]);
  if (!path) return <div className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-line text-caption text-faint">{label}: missing</div>;
  return (
    <button type="button" onClick={() => url && onOpen(url)} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-panel ring-1 ring-line">
      {url ? <img src={url} alt={label} className="h-full w-full object-cover" /> : <span className="absolute inset-0 animate-pulse bg-black/[0.05]" />}
      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-caption font-semibold text-white backdrop-blur">{label}</span>
    </button>
  );
}

function Decision({
  busy,
  onApprove,
  onReject,
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const reason = [...picked, note.trim()].filter(Boolean).join('. ');

  if (!rejecting) {
    return (
      <div className="mt-3 flex gap-2">
        <button onClick={() => setRejecting(true)} disabled={busy} className="btn btn-secondary btn-sm !text-danger disabled:opacity-50"><Icon name="x" size={14} /> Reject…</button>
        <button onClick={onApprove} disabled={busy} className="btn btn-accent-bright btn-sm disabled:opacity-50"><Icon name="checkCircle" size={14} /> Approve</button>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-2xl border border-danger/25 bg-danger/[0.03] p-3">
      <p className="text-caption font-semibold text-danger">Why? The person receives this as a message from CX.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REJECTION_REASONS.map((r) => {
          const on = picked.includes(r);
          return (
            <button key={r} type="button" onClick={() => setPicked((p) => (on ? p.filter((x) => x !== r) : [...p, r]))}
              className={`rounded-full px-3 py-1.5 text-caption font-semibold transition-colors ${on ? 'bg-danger text-white' : 'bg-white text-ink ring-1 ring-line'}`}>
              {r}
            </button>
          );
        })}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note (optional)" className="input mt-2 !text-[16px] sm:!text-body" />
      <div className="mt-2 flex gap-2">
        <button onClick={() => setRejecting(false)} className="btn btn-secondary btn-sm">Cancel</button>
        <button onClick={() => onReject(reason)} disabled={busy || reason.length < 3} className="btn btn-sm bg-danger text-white disabled:opacity-50">Send rejection</button>
      </div>
    </div>
  );
}

/** Owner / Admin: review identity and driving licence documents, with a reason on every rejection. */
export function VerificationsPanel() {
  const { toast } = useApp();
  const [cases, setCases] = useState<VerificationCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'waiting' | 'all'>('waiting');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchVerificationCases()
      .then((c) => { setCases(c); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load verifications.'));
  }, []);
  useEffect(load, [load]);

  const waitingCount = useMemo(() => (cases ?? []).filter((c) => c.identityStatus === 'pending' || c.licenceStatus === 'pending').length, [cases]);
  const shown = (cases ?? []).filter((c) => filter === 'all' || c.identityStatus === 'pending' || c.licenceStatus === 'pending');

  const decide = async (c: VerificationCase, kind: 'identity' | 'licence', decision: 'approved' | 'rejected', reason?: string) => {
    setBusy(true);
    const { error: err } = await decideVerification(c.userId, kind, decision, reason);
    setBusy(false);
    if (err) { toast({ title: 'Could not save the decision', desc: err, icon: 'info' }); return; }
    toast({ title: decision === 'approved' ? 'Approved' : 'Rejected — message sent', desc: c.userName, icon: 'checkCircle' });
    load();
  };

  if (error) {
    return <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">{error} — run migration 0106 in Supabase if you have not yet.</p>;
  }
  if (!cases) return <p className="py-10 text-center text-detail text-muted">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lead font-semibold text-ink">Verifications</h2>
          <p className="mt-1 text-detail text-muted">{waitingCount === 0 ? 'Nothing waiting for review.' : `${waitingCount} waiting for review, oldest first.`}</p>
        </div>
        <div className="flex rounded-full bg-panel p-0.5 text-caption font-semibold">
          {(['waiting', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 capitalize ${filter === f ? 'bg-white text-ink shadow-hair' : 'text-muted'}`}>{f}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface px-4 py-10 text-center text-detail text-muted">No verifications here.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((c) => {
            const open = openId === c.userId;
            return (
              <li key={c.userId} className="overflow-hidden rounded-2xl border border-line bg-surface">
                <button type="button" onClick={() => setOpenId(open ? null : c.userId)} className="flex w-full items-center gap-3 p-3.5 text-left active:bg-panel">
                  {c.userAvatar ? <img src={c.userAvatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={17} /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{c.userName}</span>
                    <span className="block text-caption text-muted">{fmt(c.identitySubmittedAt ?? c.licenceSubmittedAt)}</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-caption font-semibold ${chip(c.identityStatus)}`}>ID {c.identityStatus === 'none' ? '—' : c.identityStatus}</span>
                  <span className={`rounded-full px-2.5 py-1 text-caption font-semibold ${chip(c.licenceStatus)}`}>Licence {c.licenceStatus === 'none' ? '—' : c.licenceStatus}</span>
                  <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} className="shrink-0 text-faint" />
                </button>

                {open && (
                  <div className="space-y-5 border-t border-line p-4">
                    {c.identityStatus !== 'none' && (
                      <div>
                        <p className="text-detail font-semibold text-ink">Identity — {c.docType ? ID_DOC_LABEL[c.docType] : 'document'}</p>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <Doc path={c.identityFront} label="Front" onOpen={setZoom} />
                          <Doc path={c.identityBack} label={c.docType === 'passport' ? 'No back' : 'Back'} onOpen={setZoom} />
                          <Doc path={c.selfie} label="Selfie" onOpen={setZoom} />
                        </div>
                        {c.identityStatus === 'pending' ? (
                          <Decision busy={busy} onApprove={() => decide(c, 'identity', 'approved')} onReject={(r) => decide(c, 'identity', 'rejected', r)} />
                        ) : (
                          <p className="mt-2 text-caption text-muted">
                            {c.identityStatus === 'approved' ? 'Approved.' : `Rejected: ${c.identityReason ?? ''}`}
                          </p>
                        )}
                      </div>
                    )}
                    {c.licenceStatus !== 'none' && (
                      <div>
                        <p className="text-detail font-semibold text-ink">Driving licence</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <Doc path={c.licenceFront} label="Front" onOpen={setZoom} />
                          <Doc path={c.licenceBack} label="Back" onOpen={setZoom} />
                        </div>
                        {c.licenceStatus === 'pending' ? (
                          <Decision busy={busy} onApprove={() => decide(c, 'licence', 'approved')} onReject={(r) => decide(c, 'licence', 'rejected', r)} />
                        ) : (
                          <p className="mt-2 text-caption text-muted">
                            {c.licenceStatus === 'approved' ? 'Approved.' : `Rejected: ${c.licenceReason ?? ''}`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {zoom && (
        <div className="fixed inset-0 z-[300] grid place-items-center bg-black/90 p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
          <button aria-label="Close" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white" onClick={() => setZoom(null)}><Icon name="x" size={20} /></button>
        </div>
      )}
    </div>
  );
}
