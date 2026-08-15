import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { CarLoader } from '../components/CarLoader';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';
import {
  useConversations,
  useConversation,
  sendMessage,
  markConversationRead,
  type Conversation,
} from '../lib/data/messages';

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
          <p className="truncate text-[14.5px] font-medium text-ink">{c.other.name}</p>
          {c.lastMessage && <span className="shrink-0 text-[11.5px] text-faint">{fmtTime(c.lastMessage.createdAt)}</span>}
        </div>
        {c.car && <p className="truncate text-[12px] text-accent">{c.car.make} {c.car.model}</p>}
        <p className="truncate text-[13px] text-muted">{c.lastMessage ? c.lastMessage.body : 'No messages yet'}</p>
      </div>
      {c.unreadCount > 0 && (
        <span className="grid h-5 w-5 shrink-0 place-items-center self-start rounded-full bg-accent text-[11px] font-semibold text-white">
          {c.unreadCount}
        </span>
      )}
    </button>
  );
}

export default function Messages() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const { conversations, loading: conversationsLoading, refresh } = useConversations(session?.user.id);
  const [activeId, setActiveId] = useState<string | null>(params.get('c'));
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileChat, setMobileChat] = useState(!!params.get('c'));
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages } = useConversation(activeId);
  const active = (conversations ?? []).find((c) => c.id === activeId) ?? null;

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
    const { error } = await sendMessage(activeId, session.user.id, body);
    setSending(false);
    if (!error) refresh();
  };

  return (
    <DashboardShell variant="customer" active="Messages" fullHeight>
      <div className="flex h-full">
        {/* Conversation list */}
        <div className={`flex w-full flex-col border-r border-line bg-surface md:w-[340px] md:shrink-0 ${mobileChat ? 'hidden md:flex' : 'flex'}`}>
          <div className="border-b border-line p-4">
            <h1 className="font-display text-xl font-semibold text-ink">Messages</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversationsLoading ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <CarLoader size={70} />
              </div>
            ) : conversations && conversations.length > 0 ? (
              conversations.map((c) => (
                <ConversationRow key={c.id} c={c} active={c.id === activeId} onClick={() => openConvo(c.id)} />
              ))
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted"><Icon name="message" size={20} /></span>
                <p className="mt-1 font-medium text-ink">No conversations yet</p>
                <p className="max-w-xs text-[13px] text-muted">Message a host from any car to start a conversation.</p>
                <Link to="/browse" className="btn btn-primary btn-sm mt-2">Browse cars</Link>
              </div>
            )}
          </div>
        </div>

        {/* Chat window */}
        <div className={`flex min-w-0 flex-1 flex-col bg-bg ${mobileChat ? 'flex' : 'hidden md:flex'}`}>
          {!active ? (
            <div className="hidden flex-1 flex-col items-center justify-center gap-2 text-center md:flex">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-panel text-muted"><Icon name="message" size={22} /></span>
              <p className="font-medium text-ink">{conversationsLoading ? 'Loading…' : 'Select a conversation'}</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur">
                <button onClick={() => setMobileChat(false)} className="grid h-9 w-9 place-items-center rounded-lg text-ink hover:bg-panel md:hidden"><Icon name="chevronLeft" size={20} /></button>
                {active.other.avatar ? (
                  <img src={active.other.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-050 text-accent">
                    <Icon name="user" size={16} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{active.other.name}</p>
                  {active.car && <p className="truncate text-[12.5px] text-muted">{active.car.make} {active.car.model}</p>}
                </div>
                {active.car && (
                  <Link to={`/cars/${active.car.slug}`} className="btn btn-secondary btn-sm shrink-0">
                    View car
                  </Link>
                )}
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto px-4 py-6 sm:px-8">
                {messages === null ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <CarLoader size={70} />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <p className="text-[13.5px] text-muted">Say hello — this is the start of your conversation.</p>
                  </div>
                ) : (
                  messages.map((m, i) => {
                    const mine = m.senderId === session?.user.id;
                    const showTail = i === messages.length - 1 || messages[i + 1].senderId !== m.senderId;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[78%] sm:max-w-[65%]">
                          <div
                            className={`rounded-2xl px-4 py-2.5 text-[14.5px] leading-snug ${
                              mine ? 'bg-ink text-white rounded-br-md' : 'bg-surface text-ink border border-line rounded-bl-md'
                            }`}
                          >
                            {m.body}
                          </div>
                          {showTail && (
                            <p className={`mt-1 flex items-center gap-1 text-[11px] text-faint ${mine ? 'justify-end' : ''}`}>
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

              {/* Composer */}
              <div className="border-t border-line bg-surface p-3 sm:px-6 sm:py-4">
                <div className="flex items-center gap-2 rounded-2xl border border-line-strong bg-bg px-2 py-1.5 focus-within:border-accent">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !sending && send()}
                    placeholder="Write a message…"
                    className="min-w-0 flex-1 bg-transparent px-2 text-[14.5px] text-ink outline-none placeholder:text-faint"
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
    </DashboardShell>
  );
}
