import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { SignalS } from '../components/SignalLogo';
import { NotificationsList } from '../components/NotificationsList';
import { PushPrompt } from '../components/PushPrompt';
import { NotificationStory, hasStory } from '../components/NotificationStory';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';
import { useMyNotifications, notificationPath, type SignalNotification } from '../lib/data/notifications';
import { useAppNotifications, KIND_STYLE, type AppNotification } from '../lib/data/appNotifications';
import { useApp } from '../lib/store';
import { useLocale } from '../lib/i18n';
import { uiLocale } from '../lib/i18n/uiLocale';

const TONE: Record<'green' | 'ink' | 'amber' | 'red', string> = {
  green: 'bg-accent/10 text-accent',
  ink: 'bg-ink text-white',
  amber: 'bg-warn/15 text-warn-ink',
  red: 'bg-danger/10 text-danger',
};

const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });
};

/** Same kind of update on the same day → one row (newest first), with "and N more like this". */
function groupByKind(list: AppNotification[]): AppNotification[][] {
  const out: AppNotification[][] = [];
  const byKind = new Map<string, AppNotification[]>();
  for (const n of list) {
    const g = byKind.get(n.kind);
    if (g) g.push(n);
    else {
      const fresh = [n];
      byKind.set(n.kind, fresh);
      out.push(fresh);
    }
  }
  return out;
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const bucketOf = (iso: string) => {
  const days = Math.round((dayStart(new Date()) - dayStart(new Date(iso))) / 86400000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'This week' : 'Earlier';
};

function UpdatesList({ items, onOpen, onMark, fresh }: { items: AppNotification[] | null; onOpen: (n: AppNotification) => void; onMark: (id: string) => void; fresh: Set<string> }) {
  const { t } = useLocale();
  const grouped = useMemo(() => {
    const out: Record<string, AppNotification[]> = {};
    for (const n of items ?? []) (out[bucketOf(n.createdAt)] ??= []).push(n);
    return out;
  }, [items]);

  if (items === null) return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[72px] rounded-2xl" />)}</div>;
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="bell" size={26} /></span>
        <p className="mt-4 font-display text-lead font-semibold text-ink">You are all caught up</p>
        <p className="mt-1 max-w-xs text-detail text-muted">Bookings, payments, payouts and verification updates will appear here.</p>
      </div>
    );
  }
  // Only the first few unread updates act out their story (money rolling in, the car on its route).
  let storiesLeft = 3;
  return (
    <div className="space-y-5">
      {['Today', 'Yesterday', 'This week', 'Earlier'].filter((b) => grouped[b]?.length).map((b) => (
        <section key={b}>
          <h2 className="mb-2 px-1 text-caption font-semibold uppercase tracking-wide text-muted">{b}</h2>
          <ul className="space-y-2">
            {groupByKind(grouped[b]).map((grp) => {
              const n = grp[0];
              const more = grp.length - 1;
              const st = KIND_STYLE[n.kind] ?? { icon: 'bell' as const, tone: 'ink' as const };
              const showStory = storiesLeft > 0 && (!n.readAt || fresh.has(n.id)) && hasStory(n.kind);
              if (showStory) storiesLeft -= 1;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => { grp.forEach((g) => onMark(g.id)); onOpen(n); }}
                    className={`flex w-full items-start gap-3.5 rounded-2xl border p-3.5 text-left transition-transform active:scale-[0.99] ${
                      n.readAt && !fresh.has(n.id) ? 'border-line bg-surface' : 'border-accent/25 bg-surface'
                    }`}
                  >
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${TONE[st.tone]}`}><Icon name={st.icon} size={20} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`text-body leading-snug text-ink ${n.readAt && !fresh.has(n.id) ? 'font-medium' : 'font-semibold'}`}>{n.title}</span>
                        <span className="shrink-0 pt-0.5 text-caption text-faint">{ago(n.createdAt)}</span>
                      </span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-detail text-muted">{n.body}</span>}
                      {showStory && <NotificationStory kind={n.kind} title={n.title} body={n.body} />}
                      {more > 0 && <span className="mt-1 block text-caption font-semibold text-faint">{t('and {n} more like this', { n: more })}</span>}
                    </span>
                    {(!n.readAt || fresh.has(n.id)) && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-bright" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** One place for everything that happens to you: platform updates (bookings, payments, payouts,
 *  verification, listings) and SIGNAL activity. */
export default function Notifications() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useApp();
  const { t } = useLocale();
  const signal = useMyNotifications(session?.user.id);
  const app = useAppNotifications(session?.user.id);
  const [tab, setTab] = useState<'updates' | 'signal'>('updates');

  const signalUnread = signal.notifications?.filter((n) => !n.readAt).length ?? 0;
  const appUnread = app.items?.filter((n) => !n.readAt).length ?? 0;
  const total = signalUnread + appUnread;

  const openSignal = (n: SignalNotification) => {
    signal.markRead(n.id);
    if (!n.available) {
      toast({ title: t('This content is no longer available'), icon: 'info' });
      return;
    }
    const path = notificationPath(n, '/signal', session?.user.id);
    if (path) navigate(path);
  };
  const openApp = (n: AppNotification) => {
    app.markRead(n.id);
    if (n.url) navigate(n.url);
  };

  const markAll = () => {
    if (tab === 'updates') app.markAllRead(); else signal.markAllRead();
  };
  const unreadHere = tab === 'updates' ? appUnread : signalUnread;

  // What was new when you opened the page stays highlighted for this visit, but looking at the list is
  // what marks it as read: after a short moment on a tab, everything in it is read, and the badge follows.
  const fresh = useRef(new Set<string>());
  for (const n of app.items ?? []) if (!n.readAt) fresh.current.add(n.id);
  useEffect(() => {
    if (unreadHere === 0) return;
    const timer = window.setTimeout(() => {
      if (tab === 'updates') app.markAllRead(); else signal.markAllRead();
    }, 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, unreadHere]);

  return (
    <DashboardShell variant="customer" active="Notifications">
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <header className="flex items-end justify-between gap-4 px-1 pb-4 pt-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-[2rem] font-bold leading-none tracking-tight text-ink sm:text-4xl">Notifications</h1>
              {total > 0 && (
                <span className="grid h-7 min-w-7 place-items-center rounded-full bg-accent-bright px-2 text-detail font-bold leading-none text-white shadow-[0_6px_16px_-4px_rgba(0,212,71,0.6)]">
                  {total}
                </span>
              )}
            </div>
            <p className="mt-2 text-detail text-muted">Your trips, payments and account — and what happens on SIGNAL.</p>
          </div>
          <SignalS size={26} className="shrink-0" />
        </header>

        <PushPrompt userId={session?.user.id} />

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex rounded-full bg-panel p-1 text-detail font-semibold">
            {([['updates', 'Updates', appUnread], ['signal', 'SIGNAL', signalUnread]] as const).map(([id, label, n]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 transition-colors ${tab === id ? 'bg-white text-ink shadow-hair' : 'text-muted'}`}
              >
                {label}
                {n > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent-bright px-1.5 text-caption font-bold text-white">{n}</span>}
              </button>
            ))}
          </div>
          {unreadHere > 0 && (
            <button onClick={markAll} className="text-detail font-semibold text-accent active:opacity-60">Mark all read</button>
          )}
        </div>

        {tab === 'updates' ? (
          <UpdatesList items={app.items} onOpen={openApp} onMark={app.markRead} fresh={fresh.current} />
        ) : (
          <NotificationsList
            notifications={signal.notifications}
            loadMore={signal.loadMore}
            loadingMore={signal.loadingMore}
            hasMore={signal.hasMore}
            onOpen={openSignal}
            onMarkRead={signal.markRead}
            onMarkAllRead={signal.markAllRead}
          />
        )}
      </div>
    </DashboardShell>
  );
}
