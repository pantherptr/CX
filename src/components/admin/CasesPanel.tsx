import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { supabase } from '../../lib/supabase';
import { CASE_PREFIX } from '../../lib/data/messages';
import { INVESTIGATIONS } from '../../lib/investigations';
import { uiLocale } from '../../lib/i18n/uiLocale';

interface CaseRow {
  id: string;
  closed: boolean;
  createdAt: string;
  who: string;
  problem: string;
}

const fmt = (iso: string) => new Date(iso).toLocaleString(uiLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Cases: every request opened from X, as the written problem, open ones first. Opens the chat to answer or close it. */
export function CasesPanel() {
  const [rows, setRows] = useState<CaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error: err } = await supabase
        .from('conversations')
        .select('id, closed_at, created_at, participants:conversation_participants(profile:profiles(full_name, is_owner, is_admin)), messages(body, created_at)')
        .eq('kind', 'support')
        .order('created_at', { ascending: false })
        .limit(60);
      if (!live) return;
      if (err) { setError(err.message); setRows([]); return; }
      const list: CaseRow[] = (data ?? []).map((c) => {
        const msgs = ((c.messages ?? []) as { body: string; created_at: string }[]).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
        const first = msgs.find((m) => m.body.startsWith(CASE_PREFIX)) ?? msgs[0];
        const people = ((c.participants ?? []) as unknown as { profile: { full_name: string | null; is_owner: boolean; is_admin: boolean } | null }[])
          .map((p) => p.profile)
          .filter((p): p is { full_name: string | null; is_owner: boolean; is_admin: boolean } => !!p && !p.is_owner && !p.is_admin);
        return {
          id: c.id as string,
          closed: Boolean(c.closed_at),
          createdAt: c.created_at as string,
          who: people[0]?.full_name ?? 'Customer',
          problem: (first?.body ?? '').replace(CASE_PREFIX, '').trim() || 'No description',
        };
      });
      list.sort((a, b) => Number(a.closed) - Number(b.closed) || b.createdAt.localeCompare(a.createdAt));
      setRows(list);
    })().catch((e) => { if (live) { setError(String(e?.message ?? e)); setRows([]); } });
    return () => { live = false; };
  }, []);

  const open = (rows ?? []).filter((r) => !r.closed).length;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl bg-[#050806]">
        <img src={INVESTIGATIONS.agents} alt="" className="h-40 w-full object-cover object-top opacity-90 sm:h-52" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050806] via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
          <div>
            <p className="font-display text-xl font-bold text-white">Cases</p>
            <p className="text-detail text-white/70">Problems reported from X, answered by CX Investigations.</p>
          </div>
          <span className="rounded-full bg-accent-bright px-3 py-1 text-caption font-bold text-black">{open} open</span>
        </div>
      </div>

      {rows === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="font-display text-lead font-semibold text-ink">No cases yet</p>
          <p className="mt-1 text-detail text-muted">{error ? `Could not read cases: ${error}` : 'When someone describes a problem to X, it appears here.'}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to={`/messages?c=${r.id}`}
                className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-transform active:scale-[0.99]"
              >
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${r.closed ? 'bg-panel text-faint' : 'bg-danger/10 text-danger'}`}>
                  <Icon name="pin" size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-body font-semibold text-ink">{r.who}</span>
                    <span className="shrink-0 text-caption text-faint">{fmt(r.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-detail text-muted">{r.problem}</span>
                  <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-label font-bold uppercase tracking-wider ${r.closed ? 'bg-panel text-muted' : 'bg-danger/10 text-danger'}`}>
                    {r.closed ? 'Closed' : 'Open'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
