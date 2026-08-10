import { useEffect, useRef, useState } from 'react';
import { DashboardShell } from '../components/DashboardShell';
import { Icon } from '../components/Icon';
import { conversations as seed } from '../data/content';
import type { ChatMessage, Conversation } from '../data/types';

const replies = [
  'Sounds great — see you then! 🚗',
  'No problem at all, happy to help.',
  'Absolutely, that works for me.',
  'Perfect. I’ll have everything ready for you.',
];

export default function Messages() {
  const [convos, setConvos] = useState<Conversation[]>(() => seed.map((c) => ({ ...c, messages: [...c.messages] })));
  const [activeId, setActiveId] = useState(convos[0].id);
  const [text, setText] = useState('');
  const [mobileChat, setMobileChat] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = convos.find((c) => c.id === activeId)!;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [active.messages.length, activeId]);

  const send = () => {
    if (!text.trim()) return;
    const msg: ChatMessage = { id: `m${Date.now()}`, from: 'me', body: text.trim(), time: 'Now', read: false };
    setConvos((cs) => cs.map((c) => (c.id === activeId ? { ...c, messages: [...c.messages, msg], lastTime: 'Now' } : c)));
    setText('');
    setTimeout(() => {
      const reply: ChatMessage = { id: `r${Date.now()}`, from: 'them', body: replies[Math.floor(Math.random() * replies.length)], time: 'Now' };
      setConvos((cs) => cs.map((c) => (c.id === activeId ? { ...c, messages: [...c.messages, reply] } : c)));
    }, 1400);
  };

  const openConvo = (id: string) => { setActiveId(id); setMobileChat(true); setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c))); };

  return (
    <DashboardShell variant="customer" active="Messages" fullHeight>
      <div className="flex h-full">
        {/* Conversation list */}
        <div className={`flex w-full flex-col border-r border-line bg-surface md:w-[340px] md:shrink-0 ${mobileChat ? 'hidden md:flex' : 'flex'}`}>
          <div className="border-b border-line p-4">
            <h1 className="font-display text-xl font-semibold text-ink">Messages</h1>
            <div className="relative mt-3">
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input placeholder="Search conversations" className="input !py-2.5 !pl-9 bg-bg" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convos.map((c) => (
              <button
                key={c.id}
                onClick={() => openConvo(c.id)}
                className={`flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left transition-colors ${c.id === activeId ? 'bg-panel/60' : 'hover:bg-panel/30'}`}
              >
                <div className="relative">
                  <img src={c.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
                  {c.online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent ring-2 ring-surface" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-[14.5px] font-medium text-ink">{c.name}</p>
                    <span className="shrink-0 text-[11.5px] text-faint">{c.lastTime}</span>
                  </div>
                  <p className="truncate text-[12px] text-accent">{c.carLabel}</p>
                  <p className="truncate text-[13px] text-muted">{c.messages[c.messages.length - 1].body}</p>
                </div>
                {c.unread > 0 && <span className="grid h-5 w-5 shrink-0 place-items-center self-start rounded-full bg-accent text-[11px] font-semibold text-white">{c.unread}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Chat window */}
        <div className={`flex min-w-0 flex-1 flex-col bg-bg ${mobileChat ? 'flex' : 'hidden md:flex'}`}>
          {/* Chat header */}
          <div className="flex items-center gap-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur">
            <button onClick={() => setMobileChat(false)} className="grid h-9 w-9 place-items-center rounded-lg text-ink hover:bg-panel md:hidden"><Icon name="chevronLeft" size={20} /></button>
            <div className="relative">
              <img src={active.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
              {active.online && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{active.name}</p>
              <p className="text-[12.5px] text-muted">{active.online ? 'Active now' : 'Offline'} · {active.carLabel}</p>
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-panel"><Icon name="phone" size={18} /></button>
            <button className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-panel"><Icon name="info" size={18} /></button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto px-4 py-6 sm:px-8">
            <p className="mb-4 text-center text-[12px] text-faint">Today</p>
            {active.messages.map((m, i) => {
              const mine = m.from === 'me';
              const showTail = i === active.messages.length - 1 || active.messages[i + 1].from !== m.from;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] sm:max-w-[65%]`}>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-[14.5px] leading-snug ${
                        mine ? 'bg-ink text-white rounded-br-md' : 'bg-surface text-ink border border-line rounded-bl-md'
                      }`}
                    >
                      {m.body}
                    </div>
                    {showTail && (
                      <p className={`mt-1 flex items-center gap-1 text-[11px] text-faint ${mine ? 'justify-end' : ''}`}>
                        {m.time}
                        {mine && <Icon name="check" size={13} className="text-accent" />}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Composer */}
          <div className="border-t border-line bg-surface p-3 sm:px-6 sm:py-4">
            <div className="flex items-center gap-2 rounded-2xl border border-line-strong bg-bg px-2 py-1.5 focus-within:border-accent">
              <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel" aria-label="Attach"><Icon name="paperclip" size={18} /></button>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Write a message…"
                className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-faint"
              />
              <button onClick={send} disabled={!text.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white transition-opacity disabled:opacity-40" aria-label="Send">
                <Icon name="send" size={17} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
