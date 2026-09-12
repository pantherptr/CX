import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { PremiumPageLoader } from '../components/PremiumLoader';
import { Icon } from '../components/Icon';
import { EmptyState, Modal, VerifiedBadge, RoleLabel, type VerifiedRole } from '../components/primitives';
import { useAuth } from '../lib/auth';
import {
  useConversations,
  useConversation,
  sendMessage,
  markConversationRead,
  findOrCreateConversation,
  searchUsersForMessaging,
  type Conversation,
  type MessagingSearchResult,
} from '../lib/data/messages';

type SendAsRole = 'owner' | 'owner_assistant';

function NewMessageModal({ myUserId, onClose, onStarted }: { myUserId: string; onClose: () => void; onStarted: (conversationId: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MessagingSearchResult[]>([]);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      searchUsersForMessaging(query).then(setResults);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const start = async (result: MessagingSearchResult) => {
    setStarting(result.id);
    try {
      const conversationId = await findOrCreateConversation(null, myUserId, result.id);
      onStarted(conversationId);
      onClose();
    } finally {
      setStarting(null);
    }
  };

  return (
    <Modal open onClose={onClose} className="max-w-sm rounded-2xl p-5" labelledBy="new-message-title">
      <h2 id="new-message-title" className="font-display text-lg font-semibold text-ink">New message</h2>
      <p className="mt-1 text-detail text-muted">Message any host or client directly — you don't need to wait for them to reach out first.</p>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name…"
        className="input mt-3"
      />
      <div className="mt-2 max-h-72 overflow-y-auto">
        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => start(r)}
            disabled={starting !== null}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-panel disabled:opacity-50"
          >
            {r.avatar ? (
              <img src={r.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-050 text-accent"><Icon name="user" size={14} /></span>
            )}
            <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">{r.name}</span>
            <VerifiedBadge role={r.role} />
          </button>
        ))}
        {query.trim().length >= 2 && results.length === 0 && (
          <p className="px-2 py-4 text-center text-detail text-muted">No one found.</p>
        )}
      </div>
    </Modal>
  );
}

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// Bubble timestamps always show a clock time, never a date — the thread's
// own date-divider rows already carry the day, so repeating it per-bubble
// (as fmtTime does for the conversation list, where there's no divider)
// would just be visual noise on anything older than today.
const fmtBubbleTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function ConversationRow({ c, active, onClick }: { c: Conversation; active: boolean; onClick: () => void }) {
  const unread = c.unreadCount > 0;
  return (
    <button
      onClick={onClick}
      className={`relative flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left transition-colors ${active ? 'bg-panel/60' : 'hover:bg-panel/30'}`}
    >
      {/* A colored rail on the active row reads as "this is the open thread"
          at a glance, the same language Slack/Linear use for a selected
          item in a list — the existing `bg-panel/60` tint alone was easy
          to miss at a quick scan. */}
      {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden="true" />}
      {c.other.avatar ? (
        <img src={c.other.avatar} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-line" />
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-050 text-accent ring-1 ring-line">
          <Icon name="user" size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <p className={`truncate text-body ${unread ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{c.other.name}</p>
            <VerifiedBadge role={c.other.role} size={13} />
          </span>
          {c.lastMessage && (
            <span className={`shrink-0 text-label ${unread ? 'font-medium text-accent' : 'text-faint'}`}>{fmtTime(c.lastMessage.createdAt)}</span>
          )}
        </div>
        {c.car && <p className="truncate text-caption text-accent">{c.car.make} {c.car.model}</p>}
        <p className={`truncate text-detail ${unread ? 'font-medium text-ink-soft' : 'text-muted'}`}>{c.lastMessage ? c.lastMessage.body : 'No messages yet'}</p>
      </div>
      {unread && (
        <span className="grid h-5 min-w-5 shrink-0 place-items-center self-start rounded-full bg-accent px-1 text-label font-semibold text-white">
          {c.unreadCount > 9 ? '9+' : c.unreadCount}
        </span>
      )}
    </button>
  );
}

const fmtDateSeparator = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
};

/** A message this device just tried to send, before the server confirms
 *  it — shown immediately (optimistic) so sending never feels laggy, and
 *  kept visible with a retry action if the request actually failed
 *  rather than silently dropping the text the user just typed. Cleared
 *  the moment `sendMessage` resolves successfully; the real row then
 *  arrives through the normal realtime subscription like any other
 *  message, so nothing here is ever treated as a persisted message. */
interface PendingMessage {
  localId: string;
  conversationId: string;
  body: string;
  status: 'sending' | 'failed';
}

export default function Messages() {
  const { session, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const { conversations, loading: conversationsLoading, refresh } = useConversations(session?.user.id);
  const [activeId, setActiveId] = useState<string | null>(params.get('c'));
  const [text, setText] = useState('');
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [mobileChat, setMobileChat] = useState(!!params.get('c'));
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [search, setSearch] = useState('');
  // The Owner's identity switcher — which badge their next message sends
  // under. Not persisted; defaults back to their real identity each visit.
  const [sendAsRole, setSendAsRole] = useState<SendAsRole>('owner');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages } = useConversation(activeId);
  const active = (conversations ?? []).find((c) => c.id === activeId) ?? null;
  const myRole: VerifiedRole = profile?.is_owner ? 'owner' : profile?.is_admin ? 'admin' : profile?.is_host ? 'host' : 'client';
  const sending = pending.some((p) => p.conversationId === activeId && p.status === 'sending');

  // Client-side filter over the already-loaded list — a per-user
  // conversation list is small enough that this stays instant, and
  // avoids standing up server-side text search for what's fundamentally
  // "find the thread I already have" rather than open-ended search.
  const visibleConversations = (conversations ?? []).filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.other.name.toLowerCase().includes(q) ||
      (c.car ? `${c.car.make} ${c.car.model}`.toLowerCase().includes(q) : false) ||
      (c.lastMessage?.body.toLowerCase().includes(q) ?? false)
    );
  });

  // Default to the first conversation once the list loads, if none was
  // requested via ?c=.
  useEffect(() => {
    if (!activeId && conversations && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  const pendingForActive = pending.filter((p) => p.conversationId === activeId);
  const totalUnread = (conversations ?? []).reduce((sum, c) => sum + c.unreadCount, 0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages?.length, pendingForActive.length]);

  // Re-runs on every new message in the open thread, not just when it's
  // first opened — a reply arriving while this conversation is already
  // the one on screen is just as "read" as one the user had to navigate
  // into, and without this it stayed marked unread (a real backend-state
  // gap, not a display glitch: the badge was accurately reflecting
  // `read_at is null` rows that genuinely never got the update). Calling
  // this repeatedly is harmless — it only ever touches already-read rows
  // a second time, a no-op update.
  useEffect(() => {
    if (activeId && session?.user.id && messages && messages.length > 0) {
      markConversationRead(activeId, session.user.id).then(refresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, session?.user.id, messages?.length]);

  const openConvo = (id: string) => {
    setActiveId(id);
    setMobileChat(true);
    setParams((p) => {
      p.set('c', id);
      return p;
    });
  };

  const attemptSend = async (localId: string, conversationId: string, body: string) => {
    setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: 'sending' } : p)));
    const { error } = await sendMessage(conversationId, session!.user.id, body, profile?.is_owner ? sendAsRole : undefined);
    if (error) {
      setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: 'failed' } : p)));
      return;
    }
    // The real row arrives via the open thread's own realtime subscription
    // (useConversation) — this pending placeholder's only job was to make
    // sending feel instant, so it's removed rather than reconciled.
    setPending((prev) => prev.filter((p) => p.localId !== localId));
    refresh();
  };

  const send = () => {
    const body = text.trim();
    if (!body || !activeId || !session) return;
    setText('');
    const localId = crypto.randomUUID();
    setPending((prev) => [...prev, { localId, conversationId: activeId, body, status: 'sending' }]);
    void attemptSend(localId, activeId, body);
  };

  const retrySend = (p: PendingMessage) => {
    void attemptSend(p.localId, p.conversationId, p.body);
  };

  const dismissFailed = (localId: string) => {
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  };

  return (
    <DashboardShell variant="customer" active="Messages" fullHeight>
      <div className="flex h-full">
        {/* Conversation list */}
        <div className={`flex w-full flex-col border-r border-line bg-surface md:w-[340px] md:shrink-0 ${mobileChat ? 'hidden md:flex' : 'flex'}`}>
          <div className="border-b border-line">
            {/* Desktop already has this one tap away via the sidebar's own
                "Overview" link — this is specifically the mobile fix: the
                bottom tab bar hides itself on /messages (a chat composer
                needs the full screen edge, see BottomNav's OWNS_BOTTOM_BAR),
                which otherwise leaves no way back to the dashboard at all. */}
            <Link
              to="/dashboard"
              className="flex items-center gap-1 px-3 pt-3 text-detail font-medium text-muted transition-colors hover:text-ink lg:hidden"
            >
              <Icon name="chevronLeft" size={16} />
              Dashboard
            </Link>
            <div className="flex items-center justify-between px-4 pb-4 pt-2 lg:pt-4">
              <div>
                <h1 className="font-display text-xl font-semibold text-ink">Messages</h1>
                <p className="mt-0.5 text-caption text-muted">
                  {totalUnread > 0
                    ? `${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`
                    : conversations && conversations.length > 0
                      ? `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`
                      : 'Talk with hosts and clients'}
                </p>
              </div>
              {profile?.is_owner && (
                <button
                  onClick={() => setNewMessageOpen(true)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink hover:bg-panel"
                  aria-label="New message"
                  title="Message anyone directly"
                >
                  <Icon name="plus" size={19} />
                </button>
              )}
            </div>
          </div>
          {conversations && conversations.length > 0 && (
            <div className="border-b border-line px-4 py-2.5">
              <div className="relative">
                <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations…"
                  className="input !h-9 !py-0 !pl-9 text-detail"
                />
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto overscroll-contain pb-safe">
            {conversationsLoading ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <PremiumPageLoader size={70} />
              </div>
            ) : conversations && conversations.length > 0 ? (
              visibleConversations.length > 0 ? (
                visibleConversations.map((c) => (
                  <ConversationRow key={c.id} c={c} active={c.id === activeId} onClick={() => openConvo(c.id)} />
                ))
              ) : (
                <p className="px-6 py-16 text-center text-detail text-muted">No conversations match “{search.trim()}”.</p>
              )
            ) : (
              <EmptyState
                size="sm"
                icon="message"
                title="No conversations yet"
                description="Message a host from any car to start a conversation."
                action={<Link to="/browse" className="btn btn-primary btn-sm">Browse cars</Link>}
                className="px-6 py-16"
              />
            )}
          </div>
        </div>

        {/* Chat window */}
        <div className={`flex min-w-0 flex-1 flex-col bg-bg ${mobileChat ? 'flex' : 'hidden md:flex'}`}>
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center">
              <EmptyState size="md" icon="message" title={conversationsLoading ? 'Loading…' : 'Select a conversation'} />
            </div>
          ) : (
            <>
              {/* Chat header — shrink-0 so it can never be squeezed by the
                  keyboard shrinking the space below it; it should always
                  keep its full height and let the message list absorb
                  the change instead. */}
              <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur">
                <button onClick={() => setMobileChat(false)} className="grid h-9 w-9 place-items-center rounded-lg text-ink hover:bg-panel md:hidden"><Icon name="chevronLeft" size={20} /></button>
                {active.other.avatar ? (
                  <img src={active.other.avatar} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-line" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-050 text-accent ring-1 ring-line">
                    <Icon name="user" size={16} />
                  </span>
                )}
                {/* Name on its own line, role + vehicle context on the next —
                    the identity spec calls for name/verification/role/context
                    all visible without clutter; a bare icon next to the name
                    left role ambiguous (Host and Client share the same green
                    mark), so the role now reads as an explicit word here. */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{active.other.name}</p>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                    <VerifiedBadge role={active.other.role} showLabel size={11} />
                    {active.car && <span className="truncate text-caption text-muted">{active.car.make} {active.car.model}</span>}
                  </div>
                </div>
                {active.car && (
                  <Link to={`/cars/${active.car.slug}`} className="btn btn-secondary btn-sm shrink-0">
                    View car
                  </Link>
                )}
              </div>

              {/* Messages — the one thing that actually scrolls. overscroll-contain
                  stops iOS's elastic bounce at the top/bottom of this list from
                  chaining into the page behind it. */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8">
                {messages === null ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <PremiumPageLoader size={70} />
                  </div>
                ) : messages.length === 0 && pendingForActive.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <p className="text-detail text-muted">Say hello — this is the start of your conversation.</p>
                  </div>
                ) : (
                  messages.map((m, i) => {
                    const mine = m.senderId === session?.user.id;
                    // The Owner's own messages carry sender_role per
                    // message (which identity they chose to send under);
                    // everyone else's — and the Owner's own messages sent
                    // before this feature existed — fall back to their
                    // real account role.
                    const badgeRole: VerifiedRole = mine ? (m.senderRole ?? myRole) : active.other.role;
                    const roleOf = (msg: typeof m) =>
                      msg.senderId === session?.user.id ? (msg.senderRole ?? myRole) : active.other.role;
                    const prev = messages[i - 1];
                    const next = messages[i + 1];
                    // A new "who's talking" label appears whenever the
                    // sender changes — or, uniquely for the Owner, when
                    // they switch identity mid-thread. Without that second
                    // check, three Owner messages sent as Owner then
                    // Assistant then Owner again would visually read as
                    // one uninterrupted run from a single identity.
                    const showHead = !prev || prev.senderId !== m.senderId || roleOf(prev) !== badgeRole;
                    const showTail = !next || next.senderId !== m.senderId || roleOf(next) !== badgeRole;
                    // A divider whenever the calendar day changes from the
                    // previous message (or before the very first one) — the
                    // per-bubble timestamp alone only shows a date once a
                    // message stops being "today", which left long-running
                    // threads with no visual anchor for where one day ended
                    // and the next began.
                    const showDateDivider = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                    return (
                      <div key={m.id}>
                        {showDateDivider && (
                          <div className="my-4 flex items-center justify-center first:mt-0">
                            <span className="rounded-full bg-panel px-3 py-1 text-label font-medium text-muted">
                              {fmtDateSeparator(m.createdAt)}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${showHead ? 'mt-3' : 'mt-1'}`}>
                          <div className="max-w-[78%] sm:max-w-[65%]">
                            {showHead && <RoleLabel role={badgeRole} align={mine ? 'right' : 'left'} />}
                            <div
                              className={`rounded-2xl px-4 py-2.5 text-body leading-snug shadow-[0_1px_2px_rgba(22,22,26,0.06)] ${
                                mine ? 'bg-ink text-white rounded-br-md' : 'bg-surface text-ink border border-line rounded-bl-md'
                              }`}
                            >
                              {m.body}
                            </div>
                            {showTail && (
                              <p className={`mt-1 flex items-center gap-1 text-label text-faint ${mine ? 'justify-end' : ''}`}>
                                {fmtBubbleTime(m.createdAt)}
                                {mine && <Icon name="check" size={13} className={m.readAt ? 'text-accent' : 'text-faint'} />}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {/* Optimistic sends for this thread — shown regardless of
                    whether `messages` has loaded yet, so a message typed
                    the instant a conversation opens never feels lost.
                    `failed` never fakes a delivered state: it stays a
                    distinct, dismissible bubble with its own retry. */}
                {pendingForActive.map((p) => (
                  <div key={p.localId} className="mt-3 flex justify-end">
                    <div className="max-w-[78%] sm:max-w-[65%]">
                      <div
                        className={`rounded-2xl rounded-br-md px-4 py-2.5 text-body leading-snug ${
                          p.status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-ink/70 text-white'
                        }`}
                      >
                        {p.body}
                      </div>
                      <p className="mt-1 flex items-center justify-end gap-2 text-label">
                        {p.status === 'sending' ? (
                          <span className="text-faint">Sending…</span>
                        ) : (
                          <>
                            <span className="text-danger">Not delivered</span>
                            <button onClick={() => retrySend(p)} className="font-semibold text-accent hover:underline">Retry</button>
                            <button onClick={() => dismissFailed(p.localId)} className="text-faint hover:text-ink">Discard</button>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Composer — shrink-0 keeps it pinned at its natural size
                  regardless of what the message list above does; the
                  bottom padding adds the safe-area inset on top of the
                  normal spacing (not instead of it) so it clears the
                  home indicator now that BottomNav no longer sits below
                  it on this route (see BottomNav.tsx's OWNS_BOTTOM_BAR). */}
              <div className="shrink-0 border-t border-line bg-surface pt-3 pr-3 pl-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pt-4 sm:pr-6 sm:pl-6 sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
                {profile?.is_owner && (
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="text-caption text-muted">Sending as:</span>
                    <button
                      onClick={() => setSendAsRole('owner')}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-caption font-medium transition-colors ${
                        sendAsRole === 'owner' ? 'bg-danger/10 text-danger' : 'text-faint hover:bg-panel'
                      }`}
                    >
                      <VerifiedBadge role="owner" size={13} /> Owner
                    </button>
                    <button
                      onClick={() => setSendAsRole('owner_assistant')}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-caption font-medium transition-colors ${
                        sendAsRole === 'owner_assistant' ? 'bg-[#f5a524]/15 text-[#a86400]' : 'text-faint hover:bg-panel'
                      }`}
                    >
                      <VerifiedBadge role="owner_assistant" size={13} /> Owner Assistant
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-2xl border border-line-strong bg-bg px-2 py-1.5 focus-within:border-accent">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !sending && send()}
                    placeholder="Write a message…"
                    className="min-w-0 flex-1 bg-transparent px-2 text-body text-ink outline-none placeholder:text-faint"
                  />
                  <button onClick={send} disabled={!text.trim() || sending} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white transition-opacity disabled:opacity-40" aria-label="Send">
                    <Icon name="send" size={17} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {newMessageOpen && session && (
        <NewMessageModal
          myUserId={session.user.id}
          onClose={() => setNewMessageOpen(false)}
          onStarted={(conversationId) => {
            refresh();
            openConvo(conversationId);
          }}
        />
      )}
    </DashboardShell>
  );
}
