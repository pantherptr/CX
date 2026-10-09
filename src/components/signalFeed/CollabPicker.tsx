import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { useLocale } from '../../lib/i18n';
import { collabHandle, fetchMyCircle, type CollabPerson } from '../../lib/data/collab';
import type { Visibility } from '../../lib/data/privacy';

/** Collab only works on public / followers content. */
export const collabAllowed = (v: Visibility) => v === 'public' || v === 'followers';

/** "Invite collaborator" — one quiet pill in the composer. Opens a list of your CX Circle
 *  (people you follow back); nothing is sent until the content is published. */
export function CollabPicker({
  value, onChange, visibility, disabled,
}: { value: CollabPerson | null; onChange: (p: CollabPerson | null) => void; visibility: Visibility; disabled?: boolean }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  if (!collabAllowed(visibility)) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-faint">{t('Collab')}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="pressable inline-flex min-h-9 items-center gap-1.5 rounded-full bg-panel px-3 text-caption font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
        >
          <Icon name="users" size={13} />
          {value ? <span translate="no">{collabHandle(value)}</span> : t('Invite collaborator')}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} disabled={disabled} aria-label={t('Remove')} className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-panel hover:text-ink">
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      {open && <CollabSheet onClose={() => setOpen(false)} onPick={(p) => { onChange(p); setOpen(false); }} />}
    </>
  );
}

function CollabSheet({ onClose, onPick }: { onClose: () => void; onPick: (p: CollabPerson) => void }) {
  const { t } = useLocale();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<CollabPerson[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const h = window.setTimeout(() => {
      fetchMyCircle(q.trim()).then((rows) => { if (!cancelled) setPeople(rows); });
    }, q ? 220 : 0);
    return () => { cancelled = true; window.clearTimeout(h); };
  }, [q]);
  return (
    <div className="fixed inset-0 z-[320] flex items-end justify-center bg-black/55 sm:items-center" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-micro font-semibold uppercase tracking-[0.3em] text-faint">CX Collab</p>
            <h3 className="mt-1.5 font-display text-[20px] font-semibold text-ink">{t('Invite collaborator')}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-panel hover:text-ink">
            <Icon name="x" size={18} />
          </button>
        </div>
        <p className="mt-2 text-detail text-muted">{t('Only people in your CX Circle can be invited. Once they accept, this goes to the followers of both profiles.')}</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search your CX Circle')} className="input mt-3 !py-3" autoFocus />
        <div className="mt-3">
          {people === null ? (
            <p className="py-6 text-center text-detail text-muted">{t('Loading…')}</p>
          ) : people.length === 0 ? (
            <p className="py-6 text-center text-detail text-muted">{t('Nobody in your CX Circle yet — follow each other first.')}</p>
          ) : (
            people.map((p) => (
              <button key={p.id} type="button" onClick={() => onPick(p)} className="pressable flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-panel">
                {p.avatarUrl ? (
                  <Img src={p.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" fallback={<span className="grid h-10 w-10 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>} />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>
                )}
                <span className="min-w-0">
                  <span translate="no" className="block truncate text-[15px] font-semibold text-ink">{p.name}</span>
                  {p.username && <span translate="no" className="block truncate text-caption text-muted">@{p.username}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
