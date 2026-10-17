import { setChromeOverride, useTheme } from '../lib/theme';
import { AskXIcon, AskXRow } from '../components/AskX';
import { InvestigationsMark } from '../components/InvestigationsMark';
import { INVESTIGATIONS, agentFor } from '../lib/investigations';
import { CxTeamCover } from '../components/CxTeamCover';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { PremiumPageLoader } from '../components/PremiumLoader';
import { Icon } from '../components/Icon';
import { Img } from '../components/motion';
import { EmptyState, Modal, VerifiedBadge, RoleLabel, type VerifiedRole } from '../components/primitives';
import { useAuth } from '../lib/auth';
import { haptics } from '../lib/native';
import { useChatPresence } from '../lib/data/chatPresence';
import {
  useConversations,
  useConversation,
  prefetchConversation,
  sendMessage,
  sendPhotoMessage,
  deleteMyMessage,
  deleteChat,
  setChatArchived,
  reportChatUser,
  chatMediaUrl,
  markConversationRead,
  findOrCreateConversation,
  closeSupportConversation,
  searchUsersForMessaging,
  type Conversation,
  type MessagingSearchResult,
} from '../lib/data/messages';
import { CONTACT_WARNING, hasContactInfo } from '../lib/contactGuard';
import { useApp } from '../lib/store';
import { MacbookMockup, LockIcon } from '../components/ui/great-ui-macbook-mockup';
import { ReadBat } from '../components/ReadBat';
import type { Message } from '../lib/data/messages';
import { uiLocale } from '../lib/i18n/uiLocale';

type SendAsRole = 'owner' | 'owner_assistant';

/** Tap the CX team's name: an official card, not a person's profile — cover, seal, the team's numbers. */
function CxTeamSheet({ active, onClose, onDelete }: { active: Conversation; onClose: () => void; onDelete?: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="CX team info">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 animate-[fade-in_.2s_ease-out_both] bg-black/45 backdrop-blur-[3px]" />
      <div className="animate-sheet-in relative overflow-hidden rounded-t-[32px] bg-white pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-[0_-24px_60px_-20px_rgba(22,22,26,0.5)]">
        <CxTeamCover className="h-36">
          <span className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/30" />
          <button onClick={onClose} aria-label="Close" className="pressable absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur active:scale-90">
            <Icon name="x" size={18} />
          </button>
        </CxTeamCover>
        <div className="-mt-12 flex flex-col items-center px-5 text-center">
          <span className="rounded-full bg-gradient-to-b from-[#f6e3a1] via-[#d9b24c] to-[#8a6a1c] p-[3px] shadow-[0_12px_30px_-10px_rgba(217,178,76,0.7)]">
            <Img
              src={active.other.avatar ?? '/brand/avatar-cx-chrome.png?v=3'}
              alt=""
              className="h-[92px] w-[92px] rounded-full bg-black object-cover ring-4 ring-white"
              fallback={<span className="grid h-[92px] w-[92px] place-items-center rounded-full bg-black text-white ring-4 ring-white"><Icon name="user" size={30} /></span>}
            />
          </span>
          <p className="mt-3 flex items-center gap-1.5 font-display text-[1.45rem] font-bold leading-tight tracking-tight text-ink">
            CX
            <VerifiedBadge role="cx" size={19} />
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#fbf3d7] px-3 py-1 text-caption font-bold uppercase tracking-[0.12em] text-[#7a5a0f]">
            Official CX team
          </p>
          <p className="mt-3 max-w-[18rem] text-detail leading-snug text-muted">
            The people behind CX Rent. We answer here, announce what is new, and keep trips, payments and verification safe.
          </p>

          <Link
            to="/signal"
            className="pressable mt-4 grid h-12 w-full place-items-center rounded-full bg-ink text-[15px] font-bold text-white transition-transform active:scale-[0.98]"
          >
            See the team on SIGNAL
          </Link>
          {onDelete && (
            <button onClick={() => { onClose(); onDelete(); }} className="pressable mt-2 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-caption font-semibold text-muted active:bg-panel">
              <Icon name="trash" size={14} /> Delete chat
            </button>
          )}
          <p className="mt-1 flex items-center gap-1.5 text-caption text-faint">
            <Icon name="lock" size={13} /> We never ask for passwords or card details in chat.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Tap the name in a phone chat: who you are talking to, at a glance, with the shortcuts that matter. */
function ChatProfileSheet({ active, myId, messages, onClose, onReport, onDelete }: { active: Conversation; myId?: string; messages: Message[] | null; onClose: () => void; onReport: () => void; onDelete?: () => void }) {
  const other = active.other;
  const isCx = other.role === 'cx';
  const sent = (messages ?? []).filter((m) => m.senderId === myId).length;
  const got = (messages ?? []).length - sent;
  const since = messages && messages.length > 0 ? new Date(messages[0].createdAt).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={`${other.name} info`}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 animate-[fade-in_.2s_ease-out_both] bg-black/35 backdrop-blur-[3px]" />
      <div className="animate-sheet-in relative overflow-hidden rounded-t-[32px] bg-white pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-[0_-24px_60px_-20px_rgba(22,22,26,0.5)]">
        <div className="relative h-24 bg-gradient-to-br from-[#0b1a10] via-[#0f3a1d] to-accent">
          <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-accent-bright/25 blur-2xl" />
          <span className="absolute left-1/2 top-2.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/40" />
          <button onClick={onClose} aria-label="Close" className="pressable absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur active:scale-90">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="-mt-11 flex flex-col items-center px-5 text-center">
          {other.avatar ? (
            <Img
              src={other.avatar}
              alt=""
              className="h-[88px] w-[88px] rounded-full object-cover shadow-[0_10px_28px_-8px_rgba(0,133,54,0.6)] ring-4 ring-white"
              fallback={<span className="grid h-[88px] w-[88px] place-items-center rounded-full bg-panel text-ink-soft ring-4 ring-white"><Icon name="user" size={30} /></span>}
            />
          ) : (
            <span className="grid h-[88px] w-[88px] place-items-center rounded-full bg-panel text-ink-soft ring-4 ring-white"><Icon name="user" size={30} /></span>
          )}
          <p className="mt-3 flex items-center gap-1.5 font-display text-[1.35rem] font-bold leading-tight tracking-tight text-accent">
            {other.name}
            <VerifiedBadge role={other.role} size={17} />
          </p>
          <p className="mt-0.5 text-detail font-semibold text-muted">{isCx ? 'CX support' : ROLE_SUBTITLE[other.role] ?? ''}</p>

          <div className="mt-4 grid w-full grid-cols-3 gap-2">
            {[
              { k: 'Sent', v: String(sent) },
              { k: 'Received', v: String(got) },
              { k: 'Since', v: since ?? '—' },
            ].map((x) => (
              <div key={x.k} className="rounded-2xl bg-chat px-2 py-2.5">
                <p className="truncate text-[15px] font-bold text-ink">{x.v}</p>
                <p className="text-label font-medium text-muted">{x.k}</p>
              </div>
            ))}
          </div>

          {active.car && (
            <Link
              to={`/cars/${active.car.slug}`}
              className="pressable mt-3 flex w-full items-center gap-3 rounded-2xl bg-chat p-2 pr-3.5 text-left transition-transform active:scale-[0.98]"
            >
              {active.car.image && <Img src={active.car.image} alt="" className="h-12 w-16 shrink-0 rounded-xl object-cover" />}
              <span className="min-w-0 flex-1">
                <span className="block text-label font-medium uppercase tracking-wider text-muted">The car</span>
                <span className="block truncate text-[15px] font-semibold text-accent">{active.car.make} {active.car.model}</span>
              </span>
              <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
            </Link>
          )}

          {!isCx && (
            <Link
              to={`/signal/profile/${other.id}`}
              className="pressable mt-3 grid h-12 w-full place-items-center rounded-full bg-gradient-to-b from-accent-bright to-accent text-[15px] font-bold text-white shadow-[0_10px_24px_-8px_rgba(0,133,54,0.65)] transition-transform active:scale-[0.98]"
            >
              View profile
            </Link>
          )}
          {!isCx && (
            <button onClick={() => { onClose(); onReport(); }} className="pressable mt-2 rounded-full px-4 py-2 text-caption font-semibold text-danger active:bg-danger/10">
              Report {other.name}
            </button>
          )}
          {onDelete && (
            <button onClick={() => { onClose(); onDelete(); }} className="pressable mt-1 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-caption font-semibold text-muted active:bg-panel">
              <Icon name="trash" size={14} /> Delete chat
            </button>
          )}
          <p className="mt-1 text-caption text-faint">Payments and contact details stay inside CX.</p>
        </div>
      </div>
    </div>
  );
}

function NewMessageModal({ myUserId, onClose, onStarted }: { myUserId: string; onClose: () => void; onStarted: (conversationId: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MessagingSearchResult[]>([]);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    // A slower earlier search must never overwrite the results of the one typed after it.
    let stale = false;
    const handle = window.setTimeout(() => {
      searchUsersForMessaging(query).then((r) => { if (!stale) setResults(r); }).catch(() => { if (!stale) setResults([]); });
    }, 250);
    return () => { stale = true; window.clearTimeout(handle); };
  }, [query]);

  const start = async (result: MessagingSearchResult) => {
    setStarting(result.id);
    try {
      const conversationId = await findOrCreateConversation(null, myUserId, result.id);
      onStarted(conversationId);
      onClose();
    } catch {
      // Stay in the modal and let the row be tapped again instead of failing silently.
      setStarting(null);
    }
  };

  // The sheet sits above the keyboard (its height goes into --kb) and the field is focused only once the
  // sheet has finished rising, so iOS has nothing to scroll into view and the page does not jump.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    let timer = 0;
    const apply = () => {
      timer = 0;
      const kb = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      root.style.setProperty('--kb', `${kb}px`);
    };
    const later = () => { if (timer) window.clearTimeout(timer); timer = window.setTimeout(apply, 90); };
    vv?.addEventListener('resize', later);
    vv?.addEventListener('scroll', later);
    const focusTimer = window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 320);
    return () => {
      window.clearTimeout(focusTimer);
      if (timer) window.clearTimeout(timer);
      vv?.removeEventListener('resize', later);
      vv?.removeEventListener('scroll', later);
      root.style.removeProperty('--kb');
    };
  }, []);

  return (
    <Modal open onClose={onClose} className="max-w-sm rounded-2xl p-5 transition-[margin] duration-200 ease-out max-sm:mb-[var(--kb,0px)]" labelledBy="new-message-title">
      <h2 id="new-message-title" className="font-display text-lg font-semibold text-ink">New message</h2>
      <p className="mt-1 text-detail text-muted">Message any host or client directly — you don't need to wait for them to reach out first.</p>
      <input
        ref={searchRef}
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

/** One-tap answers above the composer (hosts and clients say the same handful of things). */
const QUICK_REPLIES: Record<'host' | 'client', string[]> = {
  host: ['On my way — 10 minutes', 'Where shall we meet?', 'All good, thank you!', 'Please send me a photo'],
  client: ['Is it still available?', 'What time is pickup?', 'Thank you so much!', 'I am running a few minutes late'],
};

const ROLE_SUBTITLE: Record<string, string> = { host: 'Host', client: 'Client', owner: 'Owner', admin: 'Admin', owner_assistant: 'Assistant' };

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });
};

// Bubble timestamps always show a clock time, never a date — the thread's
// own date-divider rows already carry the day, so repeating it per-bubble
// (as fmtTime does for the conversation list, where there's no divider)
// would just be visual noise on anything older than today.
const fmtBubbleTime = (iso: string) => new Date(iso).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' });

function ConversationRow({ c, active, onClick, myId, menuSpace = false }: { c: Conversation; active: boolean; onClick: () => void; myId?: string; menuSpace?: boolean }) {
  const unread = c.unreadCount > 0;
  const mine = !!c.lastMessage && c.lastMessage.senderId === myId;
  return (
    <button
      onClick={onClick}
      onPointerDown={() => prefetchConversation(c.id)}
      className={`group flex w-full items-center gap-3.5 rounded-[22px] px-3.5 py-3 text-left transition-[transform,background-color,box-shadow] duration-150 active:scale-[0.985] ${
        unread ? 'bg-white shadow-[0_8px_24px_-14px_rgba(22,22,26,0.35)] ring-1 ring-black/[0.04]' : active ? 'bg-panel' : 'active:bg-panel'
      }`}
    >
      <span className="relative shrink-0">
        {c.other.avatar ? (
          <Img
            src={c.other.avatar}
            alt=""
            className="h-14 w-14 rounded-full object-cover shadow-[0_3px_10px_-3px_rgba(22,22,26,0.35)]"
            fallback={<span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={20} /></span>}
          />
        ) : (
          <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={20} /></span>
        )}
        {c.car?.image && (
          <Img src={c.car.image} alt="" className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-2 border-bg object-cover shadow-sm" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <p className={`truncate text-[16px] leading-tight ${unread ? 'font-bold' : 'font-semibold'} text-ink`}>{c.other.name}</p>
            <VerifiedBadge role={c.other.role} size={13} />
          </span>
          {c.lastMessage && (
            <span className={`shrink-0 text-label ${unread ? 'font-semibold text-accent' : 'text-faint'} ${menuSpace ? 'mr-7' : ''}`}>{fmtTime(c.lastMessage.createdAt)}</span>
          )}
        </div>
        {c.car && <p className="mt-0.5 truncate text-caption font-semibold text-accent">{c.car.make} {c.car.model}</p>}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`truncate text-[14px] leading-snug ${unread ? 'font-medium text-ink' : 'text-muted'}`}>
            {c.lastMessage ? <>{mine && <span className="text-faint">You: </span>}{c.lastMessage.deleted ? 'Message deleted' : c.lastMessage.mediaPath && !c.lastMessage.body ? '📷 Photo' : c.lastMessage.body}</> : 'No messages yet'}
          </p>
          {unread && (
            <span className="grid h-[22px] min-w-[22px] shrink-0 place-items-center rounded-full bg-gradient-to-b from-accent-bright to-accent px-1.5 text-label font-bold text-white shadow-[0_4px_10px_-3px_rgba(0,133,54,0.6)]">
              {c.unreadCount > 9 ? '9+' : c.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/** A chat in the list with three ways to act on it: the dots (always there), a long press, and a swipe — left asks to
 *  delete (a short swipe uncovers "Delete", a long one asks straight away), right archives it (or restores it from the
 *  Archive). Deleting always asks first. Normal chats can be deleted; normal chats and closed cases can be archived. */
function DeletableRow({ c, active, onClick, myId, onDelete, onArchive, leaving = false }: { c: Conversation; active: boolean; onClick: () => void; myId?: string; onDelete: (id: string) => void; onArchive: (id: string, archived: boolean) => void; leaving?: boolean }) {
  const canDelete = true;
  const canArchive = true;
  const archived = !!c.archived;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState(false);
  const st = useRef<{ x: number; y: number; dir: 'h' | 'v' | null; base: number } | null>(null);
  const press = useRef<number | null>(null);
  const swallow = useRef(false);
  const REVEAL = 92;

  if (!canDelete && !canArchive) return <ConversationRow c={c} active={active} onClick={onClick} myId={myId} />;

  const minDx = canDelete ? -190 : 0;
  const maxDx = canArchive ? 190 : 0;
  const clearPress = () => { if (press.current) { window.clearTimeout(press.current); press.current = null; } };
  const hold = () => { swallow.current = true; window.setTimeout(() => { swallow.current = false; }, 350); };

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    st.current = { x: e.clientX, y: e.clientY, dir: null, base: dx };
    clearPress();
    press.current = window.setTimeout(() => {
      press.current = null;
      if (st.current && st.current.dir === null) { haptics.tick(); hold(); setMenu(true); }
    }, 520);
  };
  const move = (e: React.PointerEvent) => {
    const s = st.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (s.dir === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      s.dir = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
      clearPress();
      if (s.dir === 'h') { setDragging(true); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }
    }
    if (s.dir === 'h') setDx(Math.max(minDx, Math.min(maxDx, s.base + mx)));
  };
  const up = () => {
    clearPress();
    const s = st.current;
    st.current = null;
    if (!s || s.dir !== 'h') return;
    setDragging(false);
    hold();
    if (dx < -165) { setDx(0); onDelete(c.id); }
    else if (dx > 165) { setDx(0); haptics.tick(); onArchive(c.id, !archived); }
    else if (dx < -46) { haptics.tick(); setDx(-REVEAL); }
    else if (dx > 46) { haptics.tick(); setDx(REVEAL); }
    else setDx(0);
  };

  const anim = { transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 0.22s cubic-bezier(0.2,0.8,0.2,1)' };
  return (
    <div
      className="grid"
      style={{ gridTemplateRows: leaving ? '0fr' : '1fr', opacity: leaving ? 0 : 1, marginBottom: leaving ? -4 : 0, transition: 'grid-template-rows 0.3s cubic-bezier(0.3,0.7,0.2,1), opacity 0.22s ease, margin 0.3s ease' }}
    >
    <div className="min-h-0 overflow-hidden">
    <div className={`relative ${dx !== 0 ? 'overflow-hidden rounded-[22px]' : ''}`}>
      {canArchive && (
        <button
          type="button"
          tabIndex={dx > 0 ? 0 : -1}
          aria-label={archived ? 'Restore chat' : 'Archive chat'}
          onClick={() => { setDx(0); onArchive(c.id, !archived); }}
          className="absolute inset-y-0 left-0 flex w-[92px] flex-col items-center justify-center gap-1 rounded-l-[22px] bg-[#16794a] text-[12px] font-semibold text-white"
          style={{ visibility: dx > 0 ? 'visible' : 'hidden' }}
        >
          <Icon name="archive" size={18} /> {archived ? 'Restore' : 'Archive'}
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          tabIndex={dx < 0 ? 0 : -1}
          aria-label="Delete chat"
          onClick={() => { setDx(0); onDelete(c.id); }}
          className="absolute inset-y-0 right-0 flex w-[92px] flex-col items-center justify-center gap-1 rounded-r-[22px] bg-danger text-[12px] font-semibold text-white"
          style={{ visibility: dx < 0 ? 'visible' : 'hidden' }}
        >
          <Icon name="trash" size={18} /> Delete
        </button>
      )}
      <div
        data-no-edge-back
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          if (swallow.current) { e.preventDefault(); e.stopPropagation(); return; }
          if (dx !== 0) { e.preventDefault(); e.stopPropagation(); setDx(0); }
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="no-callout relative bg-bg"
        style={{ ...anim, touchAction: 'pan-y', WebkitTouchCallout: 'none' }}
      >
        <ConversationRow c={c} active={active} onClick={onClick} myId={myId} menuSpace />
      </div>
      <button
        type="button"
        aria-label="Chat options"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((v) => !v)}
        className="absolute right-2 top-2.5 z-10 grid h-8 w-8 place-items-center rounded-full text-faint transition-colors hover:bg-panel hover:text-ink active:bg-panel"
        style={anim}
      >
        <Icon name="moreHorizontal" size={18} />
      </button>
      {menu && (
        <>
          <div aria-hidden className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
          <div role="menu" className="absolute right-2 top-11 z-30 w-44 animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
            {canArchive && (
              <button
                role="menuitem"
                onClick={() => { setMenu(false); onArchive(c.id, !archived); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-body font-medium text-ink transition-colors hover:bg-panel active:bg-panel"
              >
                <Icon name="archive" size={16} /> {archived ? 'Restore' : 'Archive'}
              </button>
            )}
            {canDelete && (
              <button
                role="menuitem"
                onClick={() => { setMenu(false); onDelete(c.id); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-body font-medium text-danger transition-colors hover:bg-danger/10 active:bg-danger/10"
              >
                <Icon name="trash" size={16} /> Delete chat
              </button>
            )}
          </div>
        </>
      )}
    </div>
    </div>
    </div>
  );
}

/** Chats / Archive as one segmented control: the pill slides between the two. The Archive side carries a dot when
 *  something in it has unread messages. */
function ChatTabs({ tab, onTab, archivedCount, archiveDot, compact = false }: { tab: 'main' | 'archive'; onTab: (t: 'main' | 'archive') => void; archivedCount: number; archiveDot: boolean; compact?: boolean }) {
  const txt = compact ? 'py-1 text-[12px]' : 'py-2 text-[14px]';
  const side = (on: boolean) => `relative z-10 flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors duration-200 ${txt} ${on ? 'text-ink' : 'text-muted'}`;
  return (
    <div className={`animate-[fade-in_.3s_ease-out_both] ${compact ? 'px-2 pb-1.5' : 'px-3 pb-2 pt-1'}`}>
      <div role="tablist" className="relative grid grid-cols-2 rounded-full bg-panel p-1">
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_2px_8px_-2px_rgba(22,22,26,0.25)] transition-transform duration-300 ease-[cubic-bezier(0.3,0.9,0.3,1)]"
          style={{ transform: tab === 'archive' ? 'translateX(100%)' : 'translateX(0)' }}
        />
        <button role="tab" aria-selected={tab === 'main'} onClick={() => onTab('main')} className={side(tab === 'main')}>Chats</button>
        <button role="tab" aria-selected={tab === 'archive'} onClick={() => onTab('archive')} className={side(tab === 'archive')}>
          Archive{archivedCount > 0 && <span className="text-faint">· {archivedCount}</span>}
          {archiveDot && tab !== 'archive' && <span aria-label="New messages" className="h-2 w-2 animate-[scale-in_.3s_ease-out_both] rounded-full bg-accent-bright ring-2 ring-panel" />}
        </button>
      </div>
    </div>
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
  return d.toLocaleDateString(uiLocale(), {
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
  /** A photo being sent (body is its caption). */
  file?: File;
  previewUrl?: string;
}

/** A chat photo: fetched through a short-lived signed link, tap to view full screen. */
function ChatPhoto({ path, onOpen, className = '' }: { path: string; onOpen: (url: string) => void; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let off = false;
    setUrl(null);
    setFailed(false);
    chatMediaUrl(path).then((u) => { if (off) return; if (u) setUrl(u); else setFailed(true); });
    return () => { off = true; };
  }, [path]);
  if (failed) return <div className={`grid h-28 w-44 place-items-center rounded-2xl bg-black/[0.05] text-caption text-muted ${className}`}>Photo unavailable</div>;
  if (!url) return <div className={`h-40 w-52 animate-pulse rounded-2xl bg-black/[0.06] ${className}`} />;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(url); }} className={`block overflow-hidden rounded-2xl ${className}`}>
      <img src={url} alt="" loading="lazy" className="block max-h-72 w-full min-w-[9rem] max-w-[15rem] object-cover" />
    </button>
  );
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
  typing = false,
  onDelete,
  onReport,
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
  /** The other person is typing right now. */
  typing?: boolean;
  /** Delete one of your own messages / report someone else's. */
  onDelete?: (id: string) => void;
  onReport?: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const t = large
    ? { gap: 'space-y-[3px]', bubble: 'max-w-[80%] rounded-[20px] px-3.5 py-[9px] text-[15.5px] leading-[1.35]', time: 'text-[11px]', day: 'text-[11px] px-3 py-1', note: 'text-[12px] px-3.5 py-2', tick: 'h-3.5 w-3.5' }
    : { gap: 'space-y-[3px]', bubble: 'max-w-[78%] rounded-[18px] px-3.5 py-[8px] text-[14px] leading-[1.35]', time: 'text-[11px]', day: 'text-[11px] px-2.5 py-0.5', note: 'text-[11.5px] px-3 py-1', tick: 'h-3.5 w-3.5' };
  const roleOf = (m: Message): VerifiedRole => (m.senderId === myId ? (m.senderRole ?? myRole) : active.other.role);
  // Messages that arrive after the thread is on screen (a reply coming in) land with a small
  // animation; the history that was already there, and your own sent bubble (swapped in place from
  // the pending one), never animate, so nothing blinks.
  const hasCase = !!messages?.some((m) => m.isCase);
  useEffect(() => {
    if (!hasCase || document.getElementById('cx-hand-font')) return;
    const link = document.createElement('link');
    link.id = 'cx-hand-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap&subset=latin,latin-ext';
    document.head.appendChild(link);
  }, [hasCase]);
  const knownIds = useRef<Set<string> | null>(null);
  const threadKey = useRef(active.id);
  if (threadKey.current !== active.id) { threadKey.current = active.id; knownIds.current = null; }
  const freshIds = new Set<string>();
  if (messages) {
    if (knownIds.current === null) knownIds.current = new Set(messages.map((m) => m.id));
    else for (const m of messages) if (!knownIds.current.has(m.id)) { knownIds.current.add(m.id); if (m.senderId !== myId) freshIds.add(m.id); }
  }
  return (
    <div className={`flex min-h-full flex-col justify-end ${t.gap}`}>
      <div className={`mx-auto mb-2 flex w-fit max-w-[92%] items-center justify-center gap-1.5 rounded-full bg-white text-center text-muted shadow-hair ring-1 ring-line ${t.note}`}>
        <LockIcon className="h-3 w-3 shrink-0 text-accent" />
        <span>Payments and contact details stay inside CX — that's how you're protected.</span>
      </div>
      {messages === null ? (
        <div className="flex flex-col gap-2 py-6" aria-label="Loading messages">
          {[['w-40', 'items-start'], ['w-52', 'items-end'], ['w-32', 'items-start'], ['w-44', 'items-end']].map(([w, al], i) => (
            <div key={i} className={`flex ${al}`}><div className={`h-9 ${w} animate-pulse rounded-[18px] bg-black/[0.06] ${al === 'items-end' ? 'ml-auto' : ''}`} /></div>
          ))}
        </div>
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
          if (m.isCase && !m.deleted) {
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-3 flex justify-center">
                    <span className={`rounded-full bg-black/[0.05] font-semibold uppercase tracking-wider text-muted ${t.day}`}>{fmtDateSeparator(m.createdAt)}</span>
                  </div>
                )}
                {/* a sheet of paper pinned to the wall of the chat: wide, slightly crooked, with a real pushpin */}
                <div className="relative mx-auto mb-5 mt-7 w-full max-w-full -rotate-[0.8deg] px-1">
                  <div
                    className="relative rounded-[6px] px-5 pb-4 pt-9 text-left shadow-[0_18px_30px_-14px_rgba(0,0,0,0.55),0_2px_0_rgba(0,0,0,0.04)]"
                    style={{ background: 'linear-gradient(180deg,#fffef8,#fbf6e4)' }}
                  >
                    {/* the margin line of a notebook sheet */}
                    <span aria-hidden className="absolute bottom-0 left-9 top-0 w-px bg-[#e0524b]/35" />
                    {/* pushpin */}
                    <svg aria-hidden viewBox="0 0 40 52" className="absolute -top-5 left-1/2 h-12 w-10 -translate-x-1/2 drop-shadow-[0_6px_6px_rgba(0,0,0,0.45)]">
                      <defs>
                        <radialGradient id="cxpin" cx="35%" cy="30%" r="75%">
                          <stop offset="0" stopColor="#ff8a80" />
                          <stop offset="0.45" stopColor="#e11d2e" />
                          <stop offset="1" stopColor="#7a0710" />
                        </radialGradient>
                      </defs>
                      <path d="M19 30 L21 50 L23 30 Z" fill="#9aa0a6" />
                      <ellipse cx="20" cy="31" rx="9" ry="3" fill="#8a0b16" />
                      <rect x="12" y="20" width="16" height="12" rx="3" fill="#b3101d" />
                      <circle cx="20" cy="14" r="12" fill="url(#cxpin)" />
                      <ellipse cx="15.5" cy="9.5" rx="4" ry="2.6" fill="#fff" opacity="0.55" transform="rotate(-30 15.5 9.5)" />
                    </svg>
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-block -rotate-2 rounded-[4px] border-2 border-[#c1121f] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#c1121f]">
                        Case opened
                      </span>
                      <InvestigationsMark className="absolute right-4 top-3" />
                    </div>
                    {/* written in pen on ruled lines: the lines belong to the text block, so each line of writing sits on one */}
                    <p
                      className="mt-3 min-h-[84px] whitespace-pre-wrap pl-5 text-[25px] font-semibold leading-[28px] text-[#1b2a52] [overflow-wrap:anywhere]"
                      style={{
                        fontFamily: "'Caveat', 'Segoe Print', 'Bradley Hand', cursive",
                        backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(70,110,170,0.28) 27px, rgba(70,110,170,0.28) 28px)',
                        backgroundSize: '100% 28px',
                        transform: 'rotate(-0.4deg)',
                      }}
                    >
                      {m.body}
                    </p>
                    <p className="mt-3 pl-5 text-caption font-medium text-[#6b6a60]">
                      {new Date(m.createdAt).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' })} · {new Date(m.createdAt).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      {mine ? 'Reported by you. The team will answer in this chat.' : 'Reported by the customer.'}
                    </p>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 flex justify-center">
                  <span className={`rounded-full bg-black/[0.05] font-semibold uppercase tracking-wider text-muted ${t.day}`}>{fmtDateSeparator(m.createdAt)}</span>
                </div>
              )}
              <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${first && !showDay ? 'mt-2.5' : ''}`}>
                {first && (!mine || ownerIdentity) && <RoleLabel role={role} align={mine ? 'right' : 'left'} />}
                {m.deleted ? (
                  <div className={`${t.bubble} border border-dashed border-black/15 italic text-muted`}>Message deleted</div>
                ) : (
                  <div
                    onClick={() => setSelectedId((cur) => (cur === m.id ? null : m.id))}
                    className={`cursor-pointer whitespace-pre-wrap [overflow-wrap:anywhere] ${m.mediaPath ? 'max-w-[80%] rounded-[20px] p-1 text-[15px] leading-[1.35]' : t.bubble} ${
                      mine
                        ? `chat-out-bubble bg-gradient-to-b from-[#2a2a30] to-ink shadow-[0_2px_8px_-2px_rgba(22,22,26,0.45)] text-accent-bright ${last ? 'rounded-br-[6px]' : ''}`
                        : `shadow-[0_2px_10px_-3px_rgba(22,22,26,0.18)] chat-in-bubble ring-1 ring-black/[0.04] bg-white text-accent ${last ? 'rounded-bl-[6px]' : ''}`
                    } ${freshIds.has(m.id) ? 'chat-in-left' : ''}`}
                  >
                    {m.mediaPath && <ChatPhoto path={m.mediaPath} onOpen={setZoom} />}
                    {m.body && <div className={m.mediaPath ? 'px-2.5 pb-1.5 pt-1.5' : ''}>{m.body}</div>}
                  </div>
                )}
                {selectedId === m.id && !m.deleted && (
                  <div className="chat-in-left mt-1 flex items-center gap-1 rounded-full bg-white p-1 shadow-[0_6px_20px_-8px_rgba(22,22,26,0.4)] ring-1 ring-black/[0.05]">
                    {m.body && (
                      <button
                        className="rounded-full px-3 py-1.5 text-caption font-semibold text-ink active:bg-panel"
                        onClick={() => { void navigator.clipboard?.writeText(m.body); setSelectedId(null); }}
                      >Copy</button>
                    )}
                    {mine && onDelete && (
                      <button className="rounded-full px-3 py-1.5 text-caption font-semibold text-danger active:bg-danger/10" onClick={() => { setSelectedId(null); onDelete(m.id); }}>Delete</button>
                    )}
                    {!mine && onReport && (
                      <button className="rounded-full px-3 py-1.5 text-caption font-semibold text-danger active:bg-danger/10" onClick={() => { setSelectedId(null); onReport(m.id); }}>Report</button>
                    )}
                  </div>
                )}
                {last && (
                  <p className={`mt-1 flex items-center gap-1 px-1 text-faint ${t.time}`}>
                    {fmtBubbleTime(m.createdAt)}
                    {mine && <ReadBat read={Boolean(m.readAt)} className={`h-[14px] w-[27px] ${m.readAt ? '' : 'text-faint'}`} />}
                  </p>
                )}
              </div>
            </div>
          );
        })
      )}
      {typing && (
        <div className="chat-in-left flex items-start pt-1" aria-live="polite" aria-label="Typing">
          <div className="flex items-center gap-1 chat-in-bubble rounded-[18px] rounded-bl-[6px] bg-white px-3.5 py-3 shadow-[0_2px_10px_-3px_rgba(22,22,26,0.18)] ring-1 ring-black/[0.04]">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/70" style={{ animationDelay: `${i * 140}ms`, animationDuration: '0.9s' }} />
            ))}
          </div>
        </div>
      )}
      {pending.map((p) => (
        <div key={p.localId} className={`flex flex-col items-end pt-1 chat-in-right`}>
          <div className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${p.previewUrl ? 'max-w-[80%] rounded-[20px] p-1 text-[15px]' : t.bubble} rounded-br-[6px] transition-opacity ${p.status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-ink/75 text-accent-bright'}`}>
            {p.previewUrl && <img src={p.previewUrl} alt="" className="block max-h-72 w-full max-w-[15rem] rounded-2xl object-cover opacity-80" />}
            {p.body && <div className={p.previewUrl ? 'px-2.5 pb-1.5 pt-1.5' : ''}>{p.body}</div>}
          </div>
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
      {zoom && (
        <div className="fixed inset-0 z-[300] grid place-items-center bg-black/90 p-3" onClick={() => setZoom(null)} role="dialog" aria-label="Photo">
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
          <button aria-label="Close" className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top,0px))] grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur" onClick={() => setZoom(null)}>
            <Icon name="x" size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

/** The visible area while the on-screen keyboard is up — the phone chat is
 *  pinned to it so the composer never jumps or hides behind the keyboard. */
/**
 * Keeps --vv-top / --vv-h on <html> equal to the *settled* visual viewport. iOS fires a burst of
 * resize/scroll events while the keyboard animates and its own pan fights any layout we apply to
 * them — following every one of those is what made the chat vibrate. So we wait for the burst to
 * go quiet (and never touch the page scroll ourselves); the box then glides to its final size with
 * a CSS transition.
 */
function useVisualViewportVars(enabled: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    const root = document.documentElement;
    let timer = 0;
    const apply = () => {
      timer = 0;
      root.style.setProperty('--vv-top', `${Math.max(0, Math.round(vv.offsetTop))}px`);
      root.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
    };
    const later = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(apply, 90);
    };
    apply();
    vv.addEventListener('resize', later);
    vv.addEventListener('scroll', later);
    return () => {
      if (timer) window.clearTimeout(timer);
      vv.removeEventListener('resize', later);
      vv.removeEventListener('scroll', later);
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-h');
    };
  }, [enabled]);
}

export default function Messages() {
  const { session, profile } = useAuth();
  const { toast } = useApp();
  const [params, setParams] = useSearchParams();
  const { conversations: rawConversations, loading: conversationsLoading, refresh } = useConversations(session?.user.id);
  // A request to the team is a case: it is answered by CX Investigative, with one of its two investigators as the face.
  const conversations = useMemo(
    () => rawConversations?.map((c) => (c.kind === 'support' && c.other.role === 'cx' ? { ...c, other: { ...c.other, name: `${agentFor(c.id).name} · ${INVESTIGATIONS.name}`, avatar: agentFor(c.id).src } } : c)) ?? rawConversations,
    [rawConversations],
  );
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
  // A closed request, or a notice from CX: it can be read, not answered.
  const readOnly = !!active && (active.closedAt !== null || active.kind === 'notice');
  const canClose = !!active && !readOnly && active.kind !== 'notice' && (profile?.is_owner || profile?.is_admin) && active.other.role !== 'cx';
  // closing a case takes two taps (the second within 3 s), so it never happens by accident
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => {
    if (!confirmClose) return;
    const id = window.setTimeout(() => setConfirmClose(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmClose]);
  useEffect(() => { setConfirmClose(false); }, [activeId]);
  const canCloseCase = canClose && active?.kind === 'support' && !active.closedAt;
  const closeCaseButton = canCloseCase ? (
    <button
      type="button"
      onClick={() => { if (confirmClose) { setConfirmClose(false); void closeActive(); } else setConfirmClose(true); }}
      className={`pressable shrink-0 rounded-full px-3.5 py-2 text-caption font-bold transition-colors active:scale-95 ${
        confirmClose ? 'bg-[#16794a] text-white' : 'bg-[#16794a]/10 text-[#16794a]'
      }`}
    >
      {confirmClose ? 'Tap again to close' : 'Close case'}
    </button>
  ) : null;
  const closeActive = async () => {
    if (!active) return;
    const { error } = await closeSupportConversation(active.id);
    if (error) toast({ title: 'Could not close it', desc: error, icon: 'info' });
    else { toast({ title: 'Conversation closed', icon: 'check' }); refresh(); }
  };
  const readOnlyBar = readOnly && active ? (
    <div className="shrink-0 bg-chat px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
      <div className="rounded-2xl bg-white p-3.5 text-center shadow-[0_8px_28px_-12px_rgba(22,22,26,0.25)] ring-1 ring-black/[0.05]">
        {active.kind === 'support' && (
          <div className="mb-3 flex items-center justify-center gap-3">
            <img src={agentFor(active.id).src} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-black/10" />
            <span className="inline-block -rotate-3 rounded-[4px] border-2 border-[#16794a] px-2.5 py-1 text-[12px] font-black uppercase tracking-[0.18em] text-[#16794a]">
              Case closed
            </span>
          </div>
        )}
        <p className="text-detail font-medium text-ink">
          {active.kind === 'notice' ? 'This is a message from CX — you can’t reply here.' : 'This case is closed.'}
        </p>
        <p className="mt-0.5 text-caption text-muted">
          {active.kind === 'notice'
            ? 'Need to talk to someone? Ask X: it opens a case with the team.'
            : profile?.is_owner || profile?.is_admin
              ? 'Nobody can write in a closed case. If the customer has another problem, they open a new case from X.'
              : 'It can’t be reopened. If you have another problem, open a new case from X.'}
        </p>
        {active.kind === 'notice' && !profile?.is_owner && <AskXRow className="mt-3" />}
      </div>
    </div>
  ) : null;
  const presence = useChatPresence(activeId, session?.user.id, active?.other.id);
  const myRole: VerifiedRole = profile?.is_owner ? 'owner' : profile?.is_admin ? 'admin' : profile?.is_host ? 'host' : 'client';

  // Client-side filter over the already-loaded list — a per-user
  // conversation list is small enough that this stays instant, and
  // avoids standing up server-side text search for what's fundamentally
  // "find the thread I already have" rather than open-ended search.
  const [tab, setTab] = useState<'main' | 'archive'>('main');
  // rows that are on their way out (archived / deleted): they fold away at once, the list catches up behind them
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  useEffect(() => { setLeaving((s) => (s.size ? new Set() : s)); }, [conversations]);
  const markLeaving = (id: string, on: boolean) => setLeaving((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const archivedList = (conversations ?? []).filter((c) => c.archived);
  const archivedCount = archivedList.length;
  const archiveDot = archivedList.some((c) => c.unreadCount > 0);
  useEffect(() => { if (tab === 'archive' && archivedCount === 0) setTab('main'); }, [tab, archivedCount]);
  const visibleConversations = (conversations ?? []).filter((c) => {
    if (Boolean(c.archived) !== (tab === 'archive')) return false;
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
    // Phones start on the list — opening a thread nobody tapped would load it for nothing.
    if (!activeId && conversations && conversations.length > 0 && window.matchMedia('(min-width: 640px)').matches) {
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
  const [showJump, setShowJump] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => { setProfileOpen(false); }, [activeId, mobileChat]);
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

  // Safari tints its bottom bar / the strip behind the keyboard from the page background and the theme colour —
  // keep both on the chat's own tone so no band shows under the composer. Kept apart from the scroll lock above
  // and tied to the live theme: arriving from SIGNAL (dark) the theme flips to the site's a moment later, and a
  // colour picked once would stay black behind the light chat.
  const chatTheme = useTheme();
  useEffect(() => {
    if (!mobileChat || window.matchMedia('(min-width: 640px)').matches) return;
    const root = document.documentElement;
    const b = document.body.style;
    const prevRootBg = root.style.backgroundColor;
    const prevBodyBg = b.backgroundColor;
    const chatBg = chatTheme === 'dark' ? '#1a1c1a' : '#f4f5f2';
    root.style.backgroundColor = chatBg;
    b.backgroundColor = chatBg;
    setChromeOverride({ light: '#ffffff', dark: '#131513' });
    return () => {
      setChromeOverride(null);
      root.style.backgroundColor = prevRootBg;
      b.backgroundColor = prevBodyBg;
    };
  }, [mobileChat, chatTheme]);

  // The URL is the source of truth for "a chat is open": the browser/iOS back gesture removes ?c=
  // and has to close the chat too, and a link carrying ?c= opens it.
  const paramId = params.get('c');
  useEffect(() => {
    if (paramId) {
      setActiveId(paramId);
      setMobileChat(true);
    } else {
      setMobileChat(false);
    }
  }, [paramId]);

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

  const attemptSend = async (localId: string, conversationId: string, body: string, file?: File) => {
    setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: 'sending' } : p)));
    const role = profile?.is_owner ? sendAsRole : undefined;
    const { error, message } = file
      ? await sendPhotoMessage(conversationId, session!.user.id, file, body, role)
      : await sendMessage(conversationId, session!.user.id, body, role);
    if (error) {
      setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: 'failed' } : p)));
      if (file) toast({ title: 'Photo not sent', desc: error, icon: 'image' });
      return;
    }
    // Swap the placeholder for the real message in the SAME render: the saved row (from the insert's
    // own response) goes into the thread while the placeholder is removed — the bubble never blinks
    // out and back in. The realtime copy of it arrives later and is ignored (same id).
    if (message) append(message);
    setPending((prev) => {
      const gone = prev.find((p) => p.localId === localId);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
    refresh();
  };

  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast({ title: 'Photos only', desc: 'Choose an image.', icon: 'image' }); return; }
    setPhoto((prev) => { if (prev) URL.revokeObjectURL(prev.url); return { file, url: URL.createObjectURL(file) }; });
  };
  const clearPhoto = () => setPhoto((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; });

  const send = (override?: string) => {
    const body = (override ?? text).trim();
    if ((!body && !photo) || !activeId || !session || readOnly) return;
    // Talking to CX is open; between members, contact details and off-app
    // payments stay out (the database hides them too — migration 0070).
    if (body && !profile?.is_owner && active?.other.role !== 'cx' && hasContactInfo(body)) {
      toast({ title: 'Keep it inside CX', desc: CONTACT_WARNING, icon: 'shield' });
      return;
    }
    if (override === undefined) setText('');
    presence.notifyTyping(false);
    // Collapse the auto-grown composer back to one line with the text, and keep the keyboard up:
    // sending must not blur the field (that closes the keyboard and the whole layout jumps).
    if (composerRef.current) {
      composerRef.current.style.height = 'auto';
      composerRef.current.focus({ preventScroll: true });
    }
    haptics.tick();
    const localId = crypto.randomUUID();
    const file = photo?.file;
    const previewUrl = photo?.url;
    // The preview URL now belongs to the pending bubble (revoked once it is delivered / dismissed).
    if (photo) setPhoto(null);
    setPending((prev) => [...prev, { localId, conversationId: activeId, body, status: 'sending', file, previewUrl }]);
    void attemptSend(localId, activeId, body, file);
  };

  const retrySend = (p: PendingMessage) => {
    void attemptSend(p.localId, p.conversationId, p.body, p.file);
  };

  const dismissFailed = (localId: string) => {
    setPending((prev) => {
      const gone = prev.find((p) => p.localId === localId);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
  };

  const deleteMessage = async (id: string) => {
    if (!window.confirm('Delete this message for everyone?')) return;
    const { error } = await deleteMyMessage(id);
    if (error) toast({ title: 'Could not delete', desc: error, icon: 'trash' });
    else refresh();
  };

  const deleteConversation = async (convId: string | null = activeId) => {
    if (!convId) return;
    if (!window.confirm('Delete this chat? It disappears for you only; the other person keeps their copy.')) return;
    markLeaving(convId, true);
    const { error } = await deleteChat(convId);
    if (error) {
      markLeaving(convId, false);
      toast({ title: 'Could not delete the chat', desc: error, icon: 'trash' });
      return;
    }
    if (convId === activeId) {
      setActiveId(null);
      closeConvo();
    }
    refresh();
    toast({ title: 'Chat deleted', desc: 'It is gone from your list.', icon: 'trash' });
  };

  const archiveConversation = async (convId: string, archived: boolean, quiet = false) => {
    if (!quiet) markLeaving(convId, true);
    const { error } = await setChatArchived(convId, archived);
    if (error) {
      markLeaving(convId, false);
      toast({ title: archived ? 'Could not archive the chat' : 'Could not restore the chat', desc: error, icon: 'archive' });
      return;
    }
    haptics.tick();
    refresh();
    if (quiet) return;
    toast({
      title: archived ? 'Chat archived' : 'Chat restored',
      desc: archived ? 'You will find it in Archive.' : 'It is back in your chats.',
      icon: 'archive',
      action: { label: 'Undo', onClick: () => void archiveConversation(convId, !archived, true) },
    });
  };

  const reportMessage = async (id: string | null) => {
    if (!activeId) return;
    if (!window.confirm('Report this to CX? Our team will review the conversation.')) return;
    const { error } = await reportChatUser(activeId, id, id ? 'Reported message' : 'Reported user');
    if (error) toast({ title: 'Could not send report', desc: error, icon: 'shield' });
    else toast({ title: 'Report sent', desc: 'Thank you — CX will take a look.', icon: 'shield' });
  };

  return (
    <DashboardShell variant="customer" active="Messages" fullHeight>
      {/* Laptop-frame layout (tablet and up) — the Great UI MacBook mock-up fed with real data. */}
      <div className="hidden h-full items-center overflow-y-auto bg-chat-3 px-6 py-6 sm:flex">
        <MacbookMockup
          className="my-auto"
          headerTitle={active?.other.name ?? (conversationsLoading ? 'Loading…' : 'Messages')}
          headerSubtitle={active ? (presence.typing ? 'typing…' : presence.online ? 'Online' : active.car ? `${active.car.make} ${active.car.model}` : active.other.role === 'cx' ? 'CX support' : ROLE_SUBTITLE[active.other.role] ?? '') : ''}
          avatarUrl={active?.other.avatar}
          avatarFallback={active?.other.name?.[0]?.toUpperCase() ?? 'C'}
          userAvatarUrl={profile?.avatar_url}
          chats={visibleConversations.map((c) => ({
            id: c.id,
            name: c.other.name,
            initial: c.other.name?.[0]?.toUpperCase() ?? '?',
            avatarUrl: c.other.avatar,
            lastMsg: c.lastMessage ? (c.lastMessage.deleted ? 'Message deleted' : c.lastMessage.mediaPath && !c.lastMessage.body ? '📷 Photo' : c.lastMessage.body) : 'No messages yet',
            time: c.lastMessage ? fmtTime(c.lastMessage.createdAt) : '',
            unreadCount: c.unreadCount,
            isActive: c.id === activeId,
          }))}
          onSelectChat={openConvo}
          search={search}
          onSearch={setSearch}
          sidebarExtra={archivedCount > 0 || tab === 'archive' ? <ChatTabs compact tab={tab} onTab={setTab} archivedCount={archivedCount} archiveDot={archiveDot} /> : undefined}
          onChatMenu={(id) => {
            const c = (conversations ?? []).find((x) => x.id === id);
            if (!c) return [];
            const items: { label: string; danger?: boolean; onSelect: () => void }[] = [];
            items.push({ label: c.archived ? 'Restore' : 'Archive', onSelect: () => void archiveConversation(id, !c.archived) });
            items.push({ label: 'Delete chat', danger: true, onSelect: () => void deleteConversation(id) });
            return items;
          }}
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
            readOnlyBar ? readOnlyBar : active ? (
              <div className="z-10 shrink-0 bg-chat-2 p-2.5">
                {!profile?.is_owner && closeCaseButton && <div className="mb-1.5 flex justify-end">{closeCaseButton}</div>}
                {profile?.is_owner && (
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px]">
                    <span className="text-neutral-500">Sending as:</span>
                    <button onClick={() => setSendAsRole('owner')} className={`rounded-full px-2 py-0.5 font-medium ${sendAsRole === 'owner' ? 'bg-red-100 text-red-700' : 'text-neutral-500 hover:bg-black/5'}`}>Owner</button>
                    <button onClick={() => setSendAsRole('owner_assistant')} className={`rounded-full px-2 py-0.5 font-medium ${sendAsRole === 'owner_assistant' ? 'bg-amber-100 text-amber-800' : 'text-neutral-500 hover:bg-black/5'}`}>Owner Assistant</button>
                    {canClose && <button onClick={() => void closeActive()} className="ml-auto rounded-full px-2 py-0.5 font-medium text-neutral-500 hover:bg-black/5">Close conversation</button>}
                  </div>
                )}
                {photo && (
                  <div className="mb-1.5 flex items-center gap-2 rounded-xl bg-white p-1 pr-2 ring-1 ring-black/[0.05]">
                    <img src={photo.url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-neutral-700">Photo ready</span>
                    <button onClick={clearPhoto} aria-label="Remove photo" className="grid h-6 w-6 place-items-center rounded-full bg-black/[0.05]"><Icon name="x" size={12} /></button>
                  </div>
                )}
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                <div className="flex items-end gap-1.5 rounded-[22px] bg-white p-1 shadow-[0_6px_20px_-8px_rgba(22,22,26,0.3)] ring-1 ring-black/[0.05] transition-shadow focus-within:shadow-[0_8px_24px_-8px_rgba(0,133,54,0.35)] focus-within:ring-accent/40">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    aria-label="Attach a photo"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-accent transition-colors hover:bg-accent/10"
                  >
                    <Icon name="image" size={16} />
                  </button>
                  <textarea
                    rows={1}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                    presence.notifyTyping(e.target.value.trim().length > 0);
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
                    className="max-h-20 min-w-0 flex-1 resize-none bg-transparent px-3 py-[7px] text-[14px] leading-snug text-accent outline-none placeholder:text-neutral-400"
                  />
                  <button
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => send()}
                    disabled={!text.trim() && !photo}
                    aria-label="Send"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-accent-bright to-accent text-white shadow-[0_5px_12px_-4px_rgba(0,133,54,0.6)] transition-[transform,opacity] active:scale-90 disabled:bg-none disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none"
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
              typing={presence.typing}
              onDelete={deleteMessage}
              onReport={reportMessage}
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
        <div className="flex h-full flex-col bg-chat">
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
              <div className="flex shrink-0 items-center gap-2.5">
                <AskXIcon className="!h-11 !w-11 !rounded-full bg-white shadow-[0_6px_16px_-8px_rgba(22,22,26,0.4)] ring-1 ring-black/[0.06]" />
                {profile?.is_owner && (
                  <button
                    onClick={() => setNewMessageOpen(true)}
                    className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#2a2a30] to-ink text-white shadow-[0_6px_16px_-6px_rgba(22,22,26,0.6)] active:scale-90"
                    aria-label="New message"
                  >
                    <Icon name="plus" size={19} />
                  </button>
                )}
              </div>
            </div>
            {conversations && conversations.length > 0 && (
              <div className="relative mt-4">
                <Icon name="search" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations"
                  className="h-12 w-full rounded-full border-0 bg-white pl-11 pr-4 text-[16px] text-ink shadow-[0_6px_20px_-10px_rgba(22,22,26,0.3)] outline-none ring-1 ring-black/[0.05] placeholder:text-faint focus:ring-2 focus:ring-accent/40"
                />
              </div>
            )}
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
            {(archivedCount > 0 || tab === 'archive') && <ChatTabs tab={tab} onTab={setTab} archivedCount={archivedCount} archiveDot={archiveDot} />}
            {conversationsLoading ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center"><PremiumPageLoader size={70} /></div>
            ) : conversations && conversations.length > 0 ? (
              visibleConversations.length > 0 ? (
                <div key={tab} className={tab === 'archive' ? 'tab-in-from-right space-y-1' : 'tab-in-from-left space-y-1'}>
                  {visibleConversations.map((c) => (
                    <DeletableRow key={c.id} c={c} active={false} myId={session?.user.id} onClick={() => openConvo(c.id)} onDelete={(id) => void deleteConversation(id)} onArchive={(id, a) => void archiveConversation(id, a)} leaving={leaving.has(c.id)} />
                  ))}
                </div>
              ) : search.trim() ? (
                <p className="px-6 py-16 text-center text-detail text-muted">No conversations match “{search.trim()}”.</p>
              ) : tab === 'archive' ? (
                <div key="empty-archive" className="tab-in-from-right flex flex-col items-center px-8 py-14 text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="archive" size={22} /></span>
                  <p className="mt-4 font-display text-[1.15rem] font-semibold text-ink">Nothing archived</p>
                  <p className="mt-1 max-w-[16rem] text-detail text-muted">Chats you archive wait here, out of the way. A dot shows when something new arrives.</p>
                  <button onClick={() => setTab('main')} className="btn btn-secondary btn-sm mt-5">Back to chats</button>
                </div>
              ) : (
                <p className="px-6 py-16 text-center text-detail text-muted">No conversations.</p>
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
          <>
          {/* Opaque floor under the chat so the page behind never shows through the keyboard's accessory-bar gap. */}
          <div aria-hidden className="fixed inset-0 z-[199] bg-chat" />
          <div
            data-no-pull className="chat-slide-in fixed inset-x-0 z-[200] flex flex-col overflow-hidden bg-chat"
            style={{ top: 'var(--vv-top, 0px)', height: 'var(--vv-h, 100dvh)', transition: 'top .22s cubic-bezier(.2,.8,.2,1), height .22s cubic-bezier(.2,.8,.2,1)' }}
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
            <div className="relative z-10 shrink-0 border-b border-black/[0.06] bg-white/95 px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] backdrop-blur-xl">
              <div className="flex items-center gap-2.5">
                <button onClick={closeConvo} aria-label="Back to conversations" className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink transition-transform active:scale-90 active:bg-black/[0.06]">
                  <Icon name="chevronLeft" size={22} />
                </button>
                <button
                  type="button"
                  onClick={() => { haptics.tick(); setProfileOpen(true); }}
                  className="pressable flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-0.5 pr-2 text-left transition-transform active:scale-[0.98]"
                >
                  {active.other.avatar ? (
                    <Img
                      src={active.other.avatar}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-black/[0.08]"
                      fallback={<span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>}
                    />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5 text-[16px] font-semibold leading-tight tracking-tight text-ink">
                      <span className="truncate">{active.other.name}</span>
                      <VerifiedBadge role={active.other.role} size={14} />
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 truncate text-caption font-medium text-muted">
                      {presence.typing ? (
                        <span className="font-semibold text-accent">typing…</span>
                      ) : (
                        <>
                          {presence.online && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-bright" />}
                          {presence.online ? 'Online' : active.other.role === 'cx' ? 'CX support' : ROLE_SUBTITLE[active.other.role] ?? ''}
                        </>
                      )}
                    </span>
                  </span>
                </button>
                {closeCaseButton}
              </div>
              {active.car && (
                <Link
                  to={`/cars/${active.car.slug}`}
                  className="pressable mx-1 mt-2 flex items-center gap-2.5 rounded-xl bg-panel p-1 pr-3 transition-transform active:scale-[0.98]"
                >
                  {active.car.image && <Img src={active.car.image} alt="" className="h-9 w-12 shrink-0 rounded-xl object-cover" />}
                  <span className="min-w-0 flex-1 truncate text-detail font-semibold text-ink">{active.car.make} {active.car.model}</span>
                  <span className="shrink-0 text-caption font-semibold text-accent">View</span>
                  <Icon name="chevronRight" size={15} className="shrink-0 text-faint" />
                </Link>
              )}
            </div>

            <div className="relative min-h-0 flex-1">
            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
                atBottom.current = dist < 80;
                setShowJump(dist > 320);
              }}
              className="h-full overflow-y-auto overscroll-contain px-3.5 py-3"
            >
              <Thread
                ownerIdentity={!!profile?.is_owner}
                large
                typing={presence.typing}
                onDelete={deleteMessage}
                onReport={reportMessage}
                messages={messages}
                pending={pendingForActive}
                active={active}
                myId={session?.user.id}
                myRole={myRole}
                onRetry={retrySend}
                onDismiss={dismissFailed}
              />
            </div>
            <button
              type="button"
              aria-label="Jump to latest message"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                const el = scrollRef.current;
                if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
              }}
              className={`absolute bottom-3 right-3.5 grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-[0_6px_18px_-6px_rgba(22,22,26,0.45)] ring-1 ring-black/[0.05] transition-[opacity,transform] duration-200 active:scale-90 ${showJump ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
            >
              <Icon name="chevronDown" size={20} />
            </button>
            </div>

            {readOnlyBar ?? (
            <div className="shrink-0 border-t border-black/[0.06] bg-white px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-2">
              {profile?.is_owner && (
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="text-caption text-muted">Sending as</span>
                  <button onClick={() => setSendAsRole('owner')} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium ${sendAsRole === 'owner' ? 'bg-danger/10 text-danger' : 'text-faint'}`}>
                    <VerifiedBadge role="owner" size={13} /> Owner
                  </button>
                  <button onClick={() => setSendAsRole('owner_assistant')} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium ${sendAsRole === 'owner_assistant' ? 'bg-warn/15 text-warn-ink' : 'text-faint'}`}>
                    <VerifiedBadge role="owner_assistant" size={13} /> Assistant
                  </button>
                  {canClose && <button onClick={() => void closeActive()} className="ml-auto rounded-full px-2.5 py-1 text-caption font-medium text-muted">Close conversation</button>}
                </div>
              )}
              {photo && (
                <div className="chat-in-left mb-2 flex items-center gap-2 rounded-2xl bg-white p-1.5 pr-2.5 shadow-[0_6px_20px_-10px_rgba(22,22,26,0.3)] ring-1 ring-black/[0.05]">
                  <img src={photo.url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  <span className="min-w-0 flex-1 truncate text-detail font-semibold text-ink">Photo ready — add a caption or send</span>
                  <button onClick={clearPhoto} aria-label="Remove photo" className="pressable grid h-8 w-8 place-items-center rounded-full bg-black/[0.05] text-ink active:scale-90"><Icon name="x" size={16} /></button>
                </div>
              )}
              {!photo && !text.trim() && messages !== null && active?.other.role !== 'cx' && active?.kind !== 'support' && (
                <div className="-mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {QUICK_REPLIES[profile?.is_host ? 'host' : 'client'].map((q) => (
                    <button
                      key={q}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => send(q)}
                      className="pressable shrink-0 rounded-full bg-white px-3.5 py-2 text-caption font-semibold text-accent shadow-[0_4px_14px_-8px_rgba(22,22,26,0.35)] ring-1 ring-black/[0.05] active:scale-95"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              <div className="flex items-end gap-1 rounded-[24px] bg-panel p-1 transition-colors focus-within:bg-black/[0.06]">
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => photoInputRef.current?.click()}
                  aria-label="Attach a photo"
                  className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft transition-transform active:scale-90 active:bg-black/[0.06]"
                >
                  <Icon name="image" size={20} />
                </button>
                <textarea
                  ref={composerRef}
                  rows={1}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    presence.notifyTyping(e.target.value.trim().length > 0);
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
                  className="max-h-[120px] min-w-0 flex-1 resize-none bg-transparent px-2 py-[9px] text-[16px] leading-[22px] text-ink outline-none placeholder:text-faint"
                />
                <button
                  // Do not take focus from the field: the keyboard stays up and nothing resizes.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => send()}
                  disabled={!text.trim() && !photo}
                  className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-white transition-[opacity,transform,background] duration-200 active:scale-90 disabled:bg-transparent disabled:text-faint"
                  aria-label="Send"
                >
                  <Icon name="send" size={18} />
                </button>
              </div>
            </div>
            )}

            {profileOpen && active.other.role === 'cx' && (
              <CxTeamSheet active={active} onClose={() => setProfileOpen(false)} onDelete={() => void deleteConversation()} />
            )}
            {profileOpen && active.other.role !== 'cx' && (
              <ChatProfileSheet
                active={active}
                myId={session?.user.id}
                messages={messages}
                onReport={() => void reportMessage(null)}
                onDelete={() => void deleteConversation()}
                onClose={() => setProfileOpen(false)}
              />
            )}
          </div>
          </>
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
