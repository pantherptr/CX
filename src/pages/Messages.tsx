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

function ConversationRow({ c, active, onClick }: { c: Conversation; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left transition-colors ${active ? 'bg-panel/60' : 'hover:bg-panel/30'}`}
    >
      {c.other.avatar ? (
        <img src={c.other.avatar} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
          <Icon name="user" size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-body font-medium text-ink">{c.other.name}</p>
            <VerifiedBadge role={c.other.role} size={13} />
          </span>
          {c.lastMessage && <span className="shrink-0 text-label text-faint">{fmtTime(c.lastMessage.createdAt)}</span>}
        </div>
        {c.car && <p className="truncate text-caption text-accent">{c.car.make} {c.car.model}</p>}
        <p className="truncate text-detail text-muted">{c.lastMessage ? c.lastMessage.body : 'No messages yet'}</p>
      </div>
      {c.unreadCount > 0 && (
        <span className="grid h-5 w-5 shrink-0 place-items-center self-start rounded-full bg-accent text-label font-semibold text-white">
          {c.unreadCount}
        </span>
      )}
    </button>
  );
}

export default function Messages() {
  const { session, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const { conversations, loading: conversationsLoading, refresh } = useConversations(session?.user.id);
  const [activeId, setActiveId] = useState<string | null>(params.get('c'));
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileChat, setMobileChat] = useState(!!params.get('c'));
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  // The Owner's identity switcher — which badge their next message sends
  // under. Not persisted; defaults back to their real identity each visit.
  const [sendAsRole, setSendAsRole] = useState<SendAsRole>('owner');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages } = useConversation(activeId);
  const active = (conversations ?? []).find((c) => c.id === activeId) ?? null;
  const myRole: VerifiedRole = profile?.is_owner ? 'owner' : profile?.is_admin ? 'admin' : profile?.is_host ? 'host' : 'client';

  // Default to the first conversation once the list loads, if none was
  // requested via ?c=.
  useEffect(() => {
    if (!activeId && conversations && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages?.length]);

  useEffect(() => {
    if (activeId && session?.user.id) {
      markConversationRead(activeId, session.user.id).then(refresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, session?.user.id]);

  const openConvo = (id: string) => {
    setActiveId(id);
    setMobileChat(true);
    setParams((p) => {
      p.set('c', id);
      return p;
    });
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !activeId || !session) return;
    setText('');
    setSending(true);
    const { error } = await sendMessage(activeId, session.user.id, body, profile?.is_owner ? sendAsRole : undefined);
    setSending(false);
    if (!error) refresh();
  };

  return (
    <DashboardShell variant="customer" active="Messages" fullHeight>
      <div className="flex h-full">
        {/* Conversation list */}
        <div className={`flex w-full flex-col border-r border-line bg-surface md:w-[340px] md:shrink-0 ${mobileChat ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center justify-between border-b border-line p-4">
            <h1 className="font-display text-xl font-semibold text-ink">Messages</h1>
            {profile?.is_owner && (
              <button
                onClick={() => setNewMessageOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-lg text-ink hover:bg-panel"
                aria-label="New message"
                title="Message anyone directly"
              >
                <Icon name="plus" size={19} />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain pb-safe">
            {conversationsLoading ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <PremiumPageLoader size={70} />
              </div>
            ) : conversations && conversations.length > 0 ? (
              conversations.map((c) => (
                <ConversationRow key={c.id} c={c} active={c.id === activeId} onClick={() => openConvo(c.id)} />
              ))
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
                  <img src={active.other.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-050 text-accent">
                    <Icon name="user" size={16} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium text-ink">
                    {active.other.name}
                    <VerifiedBadge role={active.other.role} size={13} />
                  </p>
                  {active.car && <p className="truncate text-caption text-muted">{active.car.make} {active.car.model}</p>}
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
                ) : messages.length === 0 ? (
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
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} ${showHead ? 'mt-3' : 'mt-1'}`}>
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
                              {fmtTime(m.createdAt)}
                              {mine && <Icon name="check" size={13} className={m.readAt ? 'text-accent' : 'text-faint'} />}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
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
