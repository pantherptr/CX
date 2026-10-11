import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { PremiumPageLoader } from '../components/PremiumLoader';
import { Icon } from '../components/Icon';
import { Img } from '../components/motion';
import { EmptyState, Modal, VerifiedBadge, RoleLabel, type VerifiedRole } from '../components/primitives';
import { useAuth } from '../lib/auth';
import { haptics } from '../lib/native';
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
import { CONTACT_WARNING, hasContactInfo } from '../lib/contactGuard';
import { useApp } from '../lib/store';
import { MacbookMockup, LockIcon, DoubleCheckIcon } from '../components/ui/great-ui-macbook-mockup';
import type { Message } from '../lib/data/messages';

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
              <Img
                src={r.avatar}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
                fallback={<span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-050 text-accent"><Icon name="user" size={14} /></span>}
              />
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

const ROLE_SUBTITLE: Record<string, string> = { host: 'Host', client: 'Client', owner: 'Owner', admin: 'Admin', owner_assistant: 'Assistant' };

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
      className={`flex w-full items-center gap-3.5 px-5 py-3 text-left transition-colors active:bg-panel ${active ? 'bg-panel' : ''}`}
    >
      {c.other.avatar ? (
        <Img
          src={c.other.avatar}
          alt=""
          className="h-[52px] w-[52px] shrink-0 rounded-full object-cover"
          fallback={<span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>}
        />
      ) : (
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>
      )}
      <div className="min-w-0 flex-1 border-b border-line pb-3 -mb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <p className={`truncate text-[15px] ${unread ? 'font-semibold' : 'font-medium'} text-ink`}>{c.other.name}</p>
            <VerifiedBadge role={c.other.role} size={13} />
          </span>
          {c.lastMessage && (
            <span className={`shrink-0 text-label ${unread ? 'font-semibold text-accent' : 'text-faint'}`}>{fmtTime(c.lastMessage.createdAt)}</span>
          )}
        </div>
        {c.car && <p className="truncate text-caption font-medium text-accent">{c.car.make} {c.car.model}</p>}
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-detail ${unread ? 'font-medium text-ink-soft' : 'text-muted'}`}>{c.lastMessage ? c.lastMessage.body : 'No messages yet'}</p>
          {unread && (
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-label font-bold text-white">
              {c.unreadCount > 9 ? '9+' : c.unreadCount}
            </span>
          )}
        </div>
      </div>
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

/** The message stream — one renderer for both layouts. `large` is the phone
 *  chat (15px type, ink/white bubbles); the default is the compact one inside
 *  the laptop frame. Same real thread either way. */
function Thread({
  messages,
  pending,
  active,
  myId,
  myRole,
  onRetry,
  onDismiss,
  large = false,
  ownerIdentity = false,
}: {
  messages: Message[] | null;
  pending: PendingMessage[];
  active: Conversation;
  myId: string | undefined;
  myRole: VerifiedRole;
  onRetry: (p: PendingMessage) => void;
  onDismiss: (id: string) => void;
  large?: boolean;
  /** Only the Owner picks an identity per message, so only their own bubbles carry a role label. */
  ownerIdentity?: boolean;
}) {
  const t = large
    ? { gap: 'space-y-1', bubble: 'max-w-[82%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug', time: 'text-[11px]', day: 'text-[11px] px-3 py-1', note: 'text-[12px] px-3.5 py-2', tick: 'h-3.5 w-3.5' }
    : { gap: 'space-y-1.5', bubble: 'max-w-[75%] rounded-xl px-3.5 py-2 text-[14px] leading-snug', time: 'text-[11px]', day: 'text-[11px] px-2.5 py-0.5', note: 'text-[11.5px] px-3 py-1', tick: 'h-3.5 w-3.5' };
  const roleOf = (m: Message): VerifiedRole => (m.senderId === myId ? (m.senderRole ?? myRole) : active.other.role);
  return (
    <div className={`flex min-h-full flex-col justify-end ${t.gap}`}>
      <div className={`mx-auto mb-2 flex w-fit max-w-[92%] items-center justify-center gap-1.5 rounded-full bg-white text-center text-muted shadow-hair ring-1 ring-line ${t.note}`}>
        <LockIcon className="h-3 w-3 shrink-0 text-accent" />
        <span>Payments and contact details stay inside CX — that's how you're protected.</span>
      </div>
      {messages === null ? (
        <p className="py-8 text-center text-detail text-muted">Loading…</p>
      ) : messages.length === 0 && pending.length === 0 ? (
        <p className="py-8 text-center text-detail text-muted">Say hello — this is the start of your conversation.</p>
      ) : (
        messages.map((m, i) => {
          const mine = m.senderId === myId;
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const role = roleOf(m);
          const first = !prev || prev.senderId !== m.senderId || roleOf(prev) !== role;
          const last = !next || next.senderId !== m.senderId || roleOf(next) !== role;
          const showDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 flex justify-center">
                  <span className={`rounded-full bg-black/[0.05] font-semibold uppercase tracking-wider text-muted ${t.day}`}>{fmtDateSeparator(m.createdAt)}</span>
                </div>
              )}
              <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${first && !showDay ? 'mt-2.5' : ''}`}>
                {first && (!mine || ownerIdentity) && <RoleLabel role={role} align={mine ? 'right' : 'left'} />}
                <div
                  className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${t.bubble} ${
                    mine
                      ? `bg-ink text-white ${last ? 'rounded-br-md' : ''}`
                      : `bg-white text-ink shadow-hair ring-1 ring-line ${last ? 'rounded-bl-md' : ''}`
                  }`}
                >
                  {m.body}
                </div>
                {last && (
                  <p className={`mt-1 flex items-center gap-1 px-1 text-faint ${t.time}`}>
                    {fmtBubbleTime(m.createdAt)}
                    {mine && <DoubleCheckIcon className={`${t.tick} ${m.readAt ? 'text-accent-bright' : 'text-faint'}`} />}
                  </p>
                )}
              </div>
            </div>
          );
        })
      )}
      {pending.map((p) => (
        <div key={p.localId} className="flex flex-col items-end pt-1">
          <div className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${t.bubble} ${p.status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-ink/70 text-white'}`}>{p.body}</div>
          <p className={`mt-1 flex items-center gap-2 px-1 ${t.time}`}>
            {p.status === 'sending' ? (
              <span className="text-faint">Sending…</span>
            ) : (
              <>
                <span className="text-danger">Not delivered</span>
                <button onClick={() => onRetry(p)} className="font-semibold text-accent hover:underline">Retry</button>
                <button onClick={() => onDismiss(p.localId)} className="text-faint hover:text-ink">Discard</button>
              </>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

/** The visible area while the on-screen keyboard is up — the phone chat is
 *  pinned to it so the composer never jumps or hides behind the keyboard. */
/**
 * Keeps --vv-top / --vv-h on <html> equal to the visual viewport, written straight to the DOM
 * (no React render, no rAF) so the chat box moves in the same frame iOS moves the keyboard.
 * While the chat is open the layout viewport is also pinned back to 0 — iOS scrolls it to bring
 * the focused composer into view, which is what used to push the header out of sight.
 */
function useVisualViewportVars(enabled: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
      root.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    window.addEventListener('scroll', apply, { passive: true });
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      window.removeEventListener('scroll', apply);
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-h');
    };
  }, [enabled]);
}

export default function Messages() {
  const { session, profile } = useAuth();
  const { toast } = useApp();
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
  useVisualViewportVars(mobileChat && !!activeId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mockScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const { messages, append } = useConversation(activeId);
  const active = (conversations ?? []).find((c) => c.id === activeId) ?? null;
  const myRole: VerifiedRole = profile?.is_owner ? 'owner' : profile?.is_admin ? 'admin' : profile?.is_host ? 'host' : 'client';

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

  // Opening a conversation lands on the latest message at once. After that the thread only follows
  // new messages when you are already at the bottom (or the message is yours), and it does so
  // without an animation: a smooth scroll fighting the keyboard and the layout was the "scatto".
  const lastScroll = useRef<{ id: string | null; len: number; chat: boolean }>({ id: null, len: 0, chat: false });
  useEffect(() => {
    const len = (messages?.length ?? 0) + pendingForActive.length;
    const prev = lastScroll.current;
    const sameThread = prev.id === activeId && prev.chat === mobileChat && prev.len > 0;
    lastScroll.current = { id: activeId, len, chat: mobileChat };
    const scroll = (el: HTMLDivElement | null) => {
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
      if (sameThread && !nearBottom && !pendingForActive.length) return;
      el.scrollTop = el.scrollHeight;
    };
    scroll(scrollRef.current);
    scroll(mockScrollRef.current);
  }, [messages?.length, pendingForActive.length, activeId, mobileChat]);

  // When the keyboard opens or closes the chat box changes height; if you were at the bottom of the
  // thread you stay at the bottom (otherwise the last messages slide behind the composer).
  const atBottom = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (atBottom.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mobileChat, activeId]);

  // iOS-style edge swipe: drag from the left edge to the right to go back.
  const edgeSwipe = useRef<{ x: number; y: number } | null>(null);

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

  // While a phone chat is open the page behind is frozen in place (position: fixed at its current
  // scroll offset). With nothing to scroll, iOS cannot "scroll the field into view" when you tap the
  // composer — that scroll, plus our box following it, was the jump you saw the moment you touched it.
  useEffect(() => {
    if (!mobileChat || window.matchMedia('(min-width: 640px)').matches) return;
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow };
    b.position = 'fixed';
    b.top = `-${y}px`;
    b.width = '100%';
    b.overflow = 'hidden';
    return () => {
      b.position = prev.position;
      b.top = prev.top;
      b.width = prev.width;
      b.overflow = prev.overflow;
      window.scrollTo(0, y);
    };
  }, [mobileChat]);

  const closeConvo = () => {
    setMobileChat(false);
    setParams((p) => {
      p.delete('c');
      return p;
    });
  };

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
    const { error, message } = await sendMessage(conversationId, session!.user.id, body, profile?.is_owner ? sendAsRole : undefined);
    if (error) {
      setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: 'failed' } : p)));
      return;
    }
    // Swap the placeholder for the real message in the SAME render: the saved row (from the insert's
    // own response) goes into the thread while the placeholder is removed — the bubble never blinks
    // out and back in. The realtime copy of it arrives later and is ignored (same id).
    if (message) append(message);
    setPending((prev) => prev.filter((p) => p.localId !== localId));
    refresh();
  };

  const send = () => {
    const body = text.trim();
    if (!body || !activeId || !session) return;
    // Talking to CX is open; between members, contact details and off-app
    // payments stay out (the database hides them too — migration 0070).
    if (!profile?.is_owner && active?.other.role !== 'cx' && hasContactInfo(body)) {
      toast({ title: 'Keep it inside CX', desc: CONTACT_WARNING, icon: 'shield' });
      return;
    }
    setText('');
    // Collapse the auto-grown composer back to one line with the text, and keep the keyboard up:
    // sending must not blur the field (that closes the keyboard and the whole layout jumps).
    if (composerRef.current) {
      composerRef.current.style.height = 'auto';
      composerRef.current.focus({ preventScroll: true });
    }
    haptics.tick();
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
      {/* Laptop-frame layout (tablet and up) — the Great UI MacBook mock-up fed with real data. */}
      <div className="hidden h-full items-center overflow-y-auto bg-[#e9edef] px-6 py-6 sm:flex">
        <MacbookMockup
          className="my-auto"
          headerTitle={active?.other.name ?? (conversationsLoading ? 'Loading…' : 'Messages')}
          headerSubtitle={active ? (active.car ? `${active.car.make} ${active.car.model}` : active.other.role === 'cx' ? 'CX support' : ROLE_SUBTITLE[active.other.role] ?? '') : ''}
          avatarUrl={active?.other.avatar}
          avatarFallback={active?.other.name?.[0]?.toUpperCase() ?? 'C'}
          userAvatarUrl={profile?.avatar_url}
          chats={visibleConversations.map((c) => ({
            id: c.id,
            name: c.other.name,
            initial: c.other.name?.[0]?.toUpperCase() ?? '?',
            avatarUrl: c.other.avatar,
            lastMsg: c.lastMessage ? c.lastMessage.body : 'No messages yet',
            time: c.lastMessage ? fmtTime(c.lastMessage.createdAt) : '',
            unreadCount: c.unreadCount,
            isActive: c.id === activeId,
          }))}
          onSelectChat={openConvo}
          search={search}
          onSearch={setSearch}
          onNewChat={profile?.is_owner ? () => setNewMessageOpen(true) : undefined}
          scrollRef={mockScrollRef}
          headerAction={
            active?.car ? (
              <Link to={`/cars/${active.car.slug}`} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-700 hover:text-emerald-700">
                View car
              </Link>
            ) : null
          }
          composer={
            active ? (
              <div className="z-10 shrink-0 bg-[#f0f2f5] p-2.5">
                {profile?.is_owner && (
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px]">
                    <span className="text-neutral-500">Sending as:</span>
                    <button onClick={() => setSendAsRole('owner')} className={`rounded-full px-2 py-0.5 font-medium ${sendAsRole === 'owner' ? 'bg-red-100 text-red-700' : 'text-neutral-500 hover:bg-black/5'}`}>Owner</button>
                    <button onClick={() => setSendAsRole('owner_assistant')} className={`rounded-full px-2 py-0.5 font-medium ${sendAsRole === 'owner_assistant' ? 'bg-amber-100 text-amber-800' : 'text-neutral-500 hover:bg-black/5'}`}>Owner Assistant</button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    rows={1}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      send();
                    }}
                    placeholder="Write a message…"
                    className="max-h-20 min-w-0 flex-1 resize-none rounded-lg bg-white px-3 py-2 text-[14px] leading-snug text-neutral-900 outline-none placeholder:text-neutral-400"
                  />
                  <button
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={send}
                    disabled={!text.trim()}
                    aria-label="Send"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-bright disabled:opacity-40"
                  >
                    <Icon name="send" size={15} />
                  </button>
                </div>
              </div>
            ) : undefined
          }
        >
          {active && (
            <Thread
                ownerIdentity={!!profile?.is_owner}
              messages={messages}
              pending={pendingForActive}
              active={active}
              myId={session?.user.id}
              myRole={myRole}
              onRetry={retrySend}
              onDismiss={dismissFailed}
            />
          )}
        </MacbookMockup>
      </div>

      {/* Phone layout — a clean list, then a full-screen chat that follows the
          visual viewport (keyboard-safe) with 16px inputs so iOS never zooms. */}
      <div className="h-full sm:hidden">
        <div className="flex h-full flex-col bg-surface">
          <div className="shrink-0 px-5 pb-3 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-ink">Messages</h1>
                <p className="mt-0.5 text-detail text-muted">
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
                  className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white"
                  aria-label="New message"
                >
                  <Icon name="plus" size={19} />
                </button>
              )}
            </div>
            {conversations && conversations.length > 0 && (
              <div className="relative mt-4">
                <Icon name="search" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations"
                  className="h-11 w-full rounded-full border-0 bg-panel pl-11 pr-4 text-[16px] text-ink outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/30"
                />
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
            {conversationsLoading ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center"><PremiumPageLoader size={70} /></div>
            ) : conversations && conversations.length > 0 ? (
              visibleConversations.length > 0 ? (
                visibleConversations.map((c) => (
                  <ConversationRow key={c.id} c={c} active={false} onClick={() => openConvo(c.id)} />
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

        {mobileChat && active && (
          <div
            data-no-pull className="fixed inset-x-0 z-[200] flex flex-col overflow-hidden bg-[#f4f5f2]"
            style={{ top: 'var(--vv-top, 0px)', height: 'var(--vv-h, 100dvh)' }}
            onTouchStart={(e) => {
              const t = e.touches[0];
              edgeSwipe.current = t.clientX < 28 ? { x: t.clientX, y: t.clientY } : null;
            }}
            onTouchEnd={(e) => {
              const start = edgeSwipe.current;
              edgeSwipe.current = null;
              if (!start) return;
              const t = e.changedTouches[0];
              if (t.clientX - start.x > 70 && Math.abs(t.clientY - start.y) < 60) {
                haptics.tick();
                closeConvo();
              }
            }}
          >
            <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-surface/95 px-2 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top,0px))] backdrop-blur">
              <button onClick={closeConvo} aria-label="Back to conversations" className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink active:bg-panel">
                <Icon name="chevronLeft" size={22} />
              </button>
              {active.other.avatar ? (
                <Img
                  src={active.other.avatar}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                  fallback={<span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={16} /></span>}
                />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={16} /></span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 truncate text-[15px] font-semibold leading-tight text-ink">
                  <span className="truncate">{active.other.name}</span>
                  <VerifiedBadge role={active.other.role} size={13} />
                </p>
                <p className="truncate text-caption text-muted">
                  {active.car ? `${active.car.make} ${active.car.model}` : active.other.role === 'cx' ? 'CX support' : ROLE_SUBTITLE[active.other.role] ?? ''}
                </p>
              </div>
              {active.car && (
                <Link to={`/cars/${active.car.slug}`} className="pressable shrink-0 rounded-full bg-ink px-3.5 py-2 text-detail font-semibold text-white">
                  View car
                </Link>
              )}
            </div>

            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-3"
            >
              <Thread
                ownerIdentity={!!profile?.is_owner}
                large
                messages={messages}
                pending={pendingForActive}
                active={active}
                myId={session?.user.id}
                myRole={myRole}
                onRetry={retrySend}
                onDismiss={dismissFailed}
              />
            </div>

            <div className="shrink-0 border-t border-line bg-surface px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] pt-2.5">
              {profile?.is_owner && (
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="text-caption text-muted">Sending as</span>
                  <button onClick={() => setSendAsRole('owner')} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium ${sendAsRole === 'owner' ? 'bg-danger/10 text-danger' : 'text-faint'}`}>
                    <VerifiedBadge role="owner" size={13} /> Owner
                  </button>
                  <button onClick={() => setSendAsRole('owner_assistant')} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium ${sendAsRole === 'owner_assistant' ? 'bg-[#f5a524]/15 text-[#a86400]' : 'text-faint'}`}>
                    <VerifiedBadge role="owner_assistant" size={13} /> Assistant
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={composerRef}
                  rows={1}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    send();
                  }}
                  placeholder="Write a message…"
                  enterKeyHint="send"
                  className="max-h-[120px] min-w-0 flex-1 resize-none rounded-[22px] bg-panel px-4 py-[11px] text-[16px] leading-[22px] text-ink outline-none placeholder:text-faint"
                />
                <button
                  // Do not take focus from the field: the keyboard stays up and nothing resizes.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={send}
                  disabled={!text.trim()}
                  className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-white transition-[opacity,transform] duration-200 active:scale-90 disabled:bg-panel disabled:text-faint"
                  aria-label="Send"
                >
                  <Icon name="send" size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
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
