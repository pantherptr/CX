import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { AnnouncementCard } from '../AnnouncementCard';
import { Modal } from '../primitives';
import { useApp } from '../../lib/store';
import { uiLocale } from '../../lib/i18n/uiLocale';
import { searchSignalPeople, type SignalPeopleResult } from '../../lib/data/signalProfile';
import {
  AUDIENCES, CTA_TARGETS, fetchAnnouncements, sendAnnouncement,
  type AnnouncementAudience, type SystemAnnouncement,
} from '../../lib/data/announcements';

const TITLE_MAX = 80;
const BODY_MAX = 500;

const fmt = (iso: string) => new Date(iso).toLocaleString(uiLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Owner / Admin: write one message for everyone, a group, or chosen people. It lands in their notifications
 *  as a plain notice; it can carry one button that opens a section of the app. */
export function AnnouncementsPanel() {
  const { toast } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [people, setPeople] = useState<SignalPeopleResult[]>([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<SignalPeopleResult[]>([]);
  const [withButton, setWithButton] = useState(false);
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaPath, setCtaPath] = useState(CTA_TARGETS[0].path);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<SystemAnnouncement[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = async () => {
    const r = await fetchAnnouncements();
    setHistory(r.data);
    setHistoryError(r.error);
  };
  useEffect(() => { void loadHistory(); }, []);

  // people search (debounced)
  useEffect(() => {
    const term = q.trim();
    if (audience !== 'people' || term.length < 2) { setFound([]); return; }
    let off = false;
    const id = window.setTimeout(() => {
      searchSignalPeople(term, 8).then((r) => { if (!off) setFound(r.filter((p) => !people.some((x) => x.id === p.id))); }).catch(() => { if (!off) setFound([]); });
    }, 250);
    return () => { off = true; window.clearTimeout(id); };
  }, [q, audience, people]);

  const buttonOk = !withButton || (ctaLabel.trim().length > 0 && ctaLabel.trim().length <= 30);
  const audienceOk = audience !== 'people' || people.length > 0;
  const canSend = title.trim().length > 0 && body.trim().length > 0 && buttonOk && audienceOk;
  const audienceLabel = useMemo(() => {
    if (audience === 'people') return people.length === 1 ? people[0].fullName : `${people.length} people`;
    return AUDIENCES.find((a) => a.id === audience)?.label ?? '';
  }, [audience, people]);

  const send = async () => {
    setSending(true);
    const r = await sendAnnouncement({
      title: title.trim(),
      body: body.trim(),
      audience,
      userIds: people.map((p) => p.id),
      ctaLabel: withButton ? ctaLabel.trim() : null,
      ctaUrl: withButton ? ctaPath : null,
    });
    setSending(false);
    setConfirm(false);
    if (r.error) {
      toast({ title: 'Could not send', desc: r.error, icon: 'info' });
      return;
    }
    toast({ title: 'Announcement sent', desc: `Delivered to ${r.count} ${r.count === 1 ? 'person' : 'people'}.`, icon: 'checkCircle' });
    setTitle(''); setBody(''); setPeople([]); setQ(''); setWithButton(false); setCtaLabel('');
    void loadHistory();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section>
        <h2 className="font-display text-lead font-semibold text-ink">New announcement</h2>
        <p className="mt-1 text-detail text-muted">A plain notice in people&apos;s notifications. Tapping it opens nothing, unless you add a button.</p>

        <div className="mt-5 space-y-5">
          <div>
            <label className="mb-1.5 flex items-baseline justify-between text-detail font-semibold text-ink" htmlFor="ann-title">
              Title <span className="text-caption font-normal text-faint">{title.length}/{TITLE_MAX}</span>
            </label>
            <input id="ann-title" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="What is new?" className="input" />
          </div>

          <div>
            <label className="mb-1.5 flex items-baseline justify-between text-detail font-semibold text-ink" htmlFor="ann-body">
              Message <span className="text-caption font-normal text-faint">{body.length}/{BODY_MAX}</span>
            </label>
            <textarea id="ann-body" value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Write it short and clear." className="input resize-none" />
          </div>

          <div>
            <p className="mb-2 text-detail font-semibold text-ink">Who receives it</p>
            <div className="flex flex-wrap gap-2">
              {AUDIENCES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAudience(a.id)}
                  aria-pressed={audience === a.id}
                  className={`min-h-11 rounded-full border px-4 text-detail font-semibold transition-colors ${audience === a.id ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-soft hover:bg-panel'}`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-caption text-muted">{AUDIENCES.find((a) => a.id === audience)?.hint}</p>

            {audience === 'people' && (
              <div className="mt-3 rounded-2xl border border-line bg-surface p-3">
                {people.length > 0 && (
                  <ul className="mb-3 flex flex-wrap gap-2">
                    {people.map((p) => (
                      <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-panel py-1 pl-3 pr-1.5 text-caption font-semibold text-ink">
                        {p.fullName}
                        <button type="button" onClick={() => setPeople((cur) => cur.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.fullName}`} className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-line">
                          <Icon name="x" size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="relative">
                  <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or @username" className="input !pl-10" />
                </div>
                {found.length > 0 && (
                  <ul className="mt-2 overflow-hidden rounded-xl border border-line">
                    {found.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => { setPeople((cur) => [...cur, p]); setQ(''); }} className="flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-panel">
                          <span className="min-w-0 flex-1 truncate text-detail font-semibold text-ink">{p.fullName}</span>
                          {p.username && <span className="shrink-0 text-caption text-muted">@{p.username}</span>}
                          <Icon name="plus" size={15} className="shrink-0 text-muted" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-detail font-semibold text-ink">Add a button</span>
                <span className="block text-caption text-muted">Opens a section of the app for them.</span>
              </span>
              <input type="checkbox" checked={withButton} onChange={(e) => setWithButton(e.target.checked)} className="h-5 w-5 accent-[#00d447]" />
            </label>
            {withButton && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="ann-cta-label" className="mb-1 block text-caption font-semibold text-muted">Button text</label>
                  <input id="ann-cta-label" value={ctaLabel} maxLength={30} onChange={(e) => setCtaLabel(e.target.value)} placeholder="e.g. See what's new" className="input" />
                </div>
                <div>
                  <label htmlFor="ann-cta-path" className="mb-1 block text-caption font-semibold text-muted">Opens</label>
                  <select id="ann-cta-path" value={ctaPath} onChange={(e) => setCtaPath(e.target.value)} className="input">
                    {CTA_TARGETS.map((c) => <option key={c.path} value={c.path}>{c.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <button type="button" disabled={!canSend} onClick={() => setConfirm(true)} className="btn btn-primary btn-lg w-full disabled:opacity-50 sm:w-auto">
            <Icon name="send" size={17} /> Review &amp; send
          </button>
        </div>
      </section>

      <aside className="space-y-6">
        <div>
          <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">What they will see</h3>
          <AnnouncementCard
            title={title.trim() || 'Your title'}
            body={body.trim() || 'Your message appears here.'}
            ctaLabel={withButton ? ctaLabel.trim() || 'Button' : null}
            time="now"
            unread
          />
        </div>

        <div>
          <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">Sent</h3>
          {historyError ? (
            <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">{historyError} — run migration 0135 in Supabase if you have not yet.</p>
          ) : history === null ? (
            <p className="py-6 text-center text-detail text-muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface px-4 py-8 text-center text-detail text-muted">Nothing sent yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="rounded-2xl border border-line bg-surface p-3.5">
                  <p className="truncate text-detail font-semibold text-ink">{h.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-caption text-muted">{h.body}</p>
                  <p className="mt-1.5 text-caption text-faint">
                    {fmt(h.createdAt)} · {AUDIENCES.find((a) => a.id === h.audience)?.label} · {h.recipientsCount} {h.recipientsCount === 1 ? 'person' : 'people'}
                    {h.ctaLabel ? ` · button “${h.ctaLabel}”` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <Modal open={confirm} onClose={() => !sending && setConfirm(false)} labelledBy="ann-confirm-title" className="p-5 sm:p-6">
        <h3 id="ann-confirm-title" className="font-display text-lead font-semibold text-ink">Send announcement?</h3>
        <p className="mt-1 text-detail text-ink-soft">
          It goes to <span className="font-semibold text-ink">{audienceLabel}</span> and can&apos;t be taken back.
        </p>
        <AnnouncementCard className="mt-4" title={title.trim()} body={body.trim()} ctaLabel={withButton ? ctaLabel.trim() : null} time="now" unread />
        <div className="mt-5 flex gap-2.5">
          <button type="button" onClick={() => setConfirm(false)} disabled={sending} className="btn btn-block border border-line-strong bg-surface text-ink">Back</button>
          <button type="button" onClick={() => void send()} disabled={sending} className="btn btn-primary btn-block">{sending ? 'Sending…' : 'Send now'}</button>
        </div>
      </Modal>
    </div>
  );
}
