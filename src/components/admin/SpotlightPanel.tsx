import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { useApp } from '../../lib/store';
import {
  fetchSpotlightQueue, fetchSpotlightPublishers, publishSpotlight, setSpotlightStatus,
  type SpotlightCandidate, type SpotlightPublisher,
} from '../../lib/data/spotlight';

const STATUS_LABEL: Record<SpotlightCandidate['status'], string> = {
  candidate: 'Available', draft: 'Draft', published: 'Live in feed', archived: 'Archived',
};

/** Signal Spotlight queue — Owner/Admin only (mounted inside AdminDashboard,
 *  itself behind AdminRoute; every RPC re-checks is_admin() server-side).
 *  Shows the public Visions of verified accounts (Verified Client, Verified Host, CX Team). Nothing here changes a
 *  Vision: publishing creates an editorial entry that points at it,
 *  archiving/removing only affects that entry. */
export function SpotlightPanel() {
  const { toast } = useApp();
  const [items, setItems] = useState<SpotlightCandidate[] | null>(null);
  const [publishers, setPublishers] = useState<SpotlightPublisher[]>([]);
  const [selected, setSelected] = useState<SpotlightCandidate | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    const { items: rows, error } = await fetchSpotlightQueue();
    setItems(rows);
    setLoadError(error);
  };
  useEffect(() => {
    void load();
    fetchSpotlightPublishers().then(setPublishers);
  }, []);

  const act = async (v: SpotlightCandidate, status: 'archived' | 'removed') => {
    const verb = status === 'archived' ? 'Archive this Spotlight?' : 'Hide this Vision from the Spotlight list?';
    if (!window.confirm(verb)) return;
    const { error } = await setSpotlightStatus(v.visionId, status);
    if (error) {
      toast({ title: 'Could not update', desc: error, icon: 'info' });
      return;
    }
    void load();
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-lead font-semibold text-ink">Signal Spotlight</h2>
        <p className="mt-1 text-detail text-muted">Every public Vision from a verified account. Select one to publish it to the Signal feed as a CX Spotlight — the creator doesn't need to do anything.</p>
      </div>

      {loadError && <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-detail text-danger">{loadError}</p>}
      {items === null && <p className="py-10 text-center text-detail text-muted">Loading…</p>}
      {items && items.length === 0 && !loadError && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-detail text-muted">No Visions from verified accounts yet.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items?.map((v) => (
          <div key={v.visionId} className="card overflow-hidden">
            <div className="relative aspect-[4/5] bg-panel">
              {v.mediaKind === 'video' ? (
                <video src={v.mediaUrl} controls muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <img src={v.mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <span className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${v.status === 'published' ? 'bg-accent-bright text-noir' : 'bg-black/60 text-white'}`}>
                {STATUS_LABEL[v.status]}
              </span>
            </div>
            <div className="space-y-1 p-3.5">
              <p className="truncate text-detail font-semibold text-ink">{v.title || 'Untitled'}</p>
              <p className="truncate text-caption text-muted">
                {v.creatorName}{v.creatorUsername ? ` · @${v.creatorUsername}` : ''}
              </p>
              {v.badge && <p className="inline-flex items-center gap-1 text-caption font-semibold text-accent-700"><Icon name="verified" size={12} /> {v.badge}</p>}
              <p className="truncate text-caption text-muted">
                {[v.city, v.carLabel].filter(Boolean).join(' · ') || '—'}
              </p>
              <p className="text-caption text-faint">{new Date(v.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              {v.status === 'published' && v.entryPublisher && <p className="text-caption text-accent-700">Published as {v.entryPublisher}{v.entryTitle ? ` · “${v.entryTitle}”` : ''}</p>}
              <div className="flex flex-wrap gap-2 pt-2">
                <button type="button" onClick={() => setSelected(v)} className="btn btn-primary btn-sm rounded-full">
                  {v.status === 'published' ? 'Edit' : v.status === 'archived' ? 'Re-publish' : 'Select'}
                </button>
                {v.status === 'published' && (
                  <button type="button" onClick={() => void act(v, 'archived')} className="btn btn-secondary btn-sm rounded-full">Archive</button>
                )}
                <button type="button" onClick={() => void act(v, 'removed')} className="btn btn-secondary btn-sm rounded-full text-danger">Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <PublishModal
          candidate={selected}
          publishers={publishers}
          onClose={() => setSelected(null)}
          onPublished={() => { setSelected(null); toast({ title: 'Spotlight published', icon: 'checkCircle' }); void load(); }}
        />
      )}
    </div>
  );
}

function PublishModal({
  candidate, publishers, onClose, onPublished,
}: { candidate: SpotlightCandidate; publishers: SpotlightPublisher[]; onClose: () => void; onPublished: () => void }) {
  const { toast } = useApp();
  const [publisherId, setPublisherId] = useState(publishers[0]?.id ?? '');
  const [curatedBy, setCuratedBy] = useState('');
  const [city, setCity] = useState(candidate.city ?? '');
  const [title, setTitle] = useState(candidate.entryTitle ?? candidate.title ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!publisherId && publishers[0]) setPublisherId(publishers[0].id); }, [publishers, publisherId]);

  const publish = async () => {
    if (!publisherId || busy) return;
    setBusy(true);
    const { error } = await publishSpotlight({ visionId: candidate.visionId, publisherId, curatedBy, city, title });
    setBusy(false);
    if (error) {
      toast({ title: 'Could not publish', desc: error, icon: 'info' });
      return;
    }
    onPublished();
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-end justify-center bg-black/55 sm:items-center" role="dialog" aria-modal="true" onClick={busy ? undefined : onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-bg p-5 shadow-pop sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-micro font-semibold uppercase tracking-[0.24em] text-faint">Publish Signal Spotlight</p>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-panel"><Icon name="x" size={17} /></button>
        </div>

        <div className="mt-3 flex gap-3">
          <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-panel">
            {candidate.mediaKind === 'video'
              ? <video src={candidate.mediaUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              : <img src={candidate.mediaUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 self-center text-caption text-muted">
            <p className="truncate text-detail font-semibold text-ink">{candidate.title || 'Untitled'}</p>
            <p className="truncate">{candidate.carLabel ?? '—'}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3.5">
          <label className="block">
            <span className="field-label">Publishing account</span>
            <select value={publisherId} onChange={(e) => setPublisherId(e.target.value)} className="input mt-1.5" disabled={busy}>
              {publishers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span className="mt-1 block text-caption text-faint">Official CX accounts only.</span>
          </label>
          <label className="block">
            <span className="field-label">Curated by <span className="font-normal text-faint">(optional)</span></span>
            <input value={curatedBy} onChange={(e) => setCuratedBy(e.target.value.slice(0, 60))} placeholder="Editor or creative name" className="input mt-1.5" disabled={busy} />
          </label>
          <label className="block">
            <span className="field-label">City</span>
            <input value={city} onChange={(e) => setCity(e.target.value.slice(0, 60))} placeholder="Milano" className="input mt-1.5" disabled={busy} />
          </label>
          <label className="block">
            <span className="field-label">Editorial title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="Night Drive" className="input mt-1.5" disabled={busy} />
          </label>
          <div>
            <span className="field-label">Original creator</span>
            <div className="mt-1.5 flex items-center justify-between rounded-xl border border-line bg-panel/60 px-3.5 py-3 text-detail text-ink-soft">
              <span className="truncate">{candidate.creatorUsername ? `@${candidate.creatorUsername}` : candidate.creatorName}</span>
              <span className="inline-flex items-center gap-1 text-caption text-faint"><Icon name="lock" size={12} /> locked</span>
            </div>
          </div>
        </div>

        <button type="button" onClick={publish} disabled={!publisherId || busy} className="btn btn-primary mt-5 min-h-12 w-full justify-center rounded-full text-[15px] disabled:opacity-50">
          {busy ? 'Publishing…' : 'Publish to the Signal feed'}
        </button>
      </div>
    </div>
  );
}
