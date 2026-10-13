import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Img } from './motion';
import { useAuth } from '../lib/auth';
import { useCars } from '../lib/data/cars';
import { findOrCreateCxConversation, sendMessage, useConversation } from '../lib/data/messages';
import { supabase } from '../lib/supabase';
import { apiUrl } from '../lib/api';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { useLocale } from '../lib/i18n';

/**
 * Kai — the CX assistant. A plain chat: you write what you need (a car for a trip, a problem with a
 * booking, how verification works) and Kai answers, showing real cars when it recommends some. It can
 * hand you to a person from the team: the conversation moves to a real CX chat *in the same panel*, with
 * what you said to Kai already in it, and the team's replies appear right there.
 *
 * The answers come from /api/notify-message (type "assistant"): only the FAQ and the published cars are
 * ever shown to the model — never private bookings, messages or documents.
 */
export const ASSISTANT_NAME = 'Kai';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'note';
  text: string;
  cars?: string[];
  offerHuman?: boolean;
}

let nextId = 0;
const newId = () => `m${++nextId}`;

/** The assistant's face — the CX key mark on a white disc, with an "online" dot when `live`. */
export function ConciergeMark({ size = 30, live = false, className = '' }: { size?: number; live?: boolean; className?: string }) {
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(14,20,17,0.12)] ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="relative h-[78%] w-[78%]">
        <img data-invert-dark src="/brand/cx-bat-man.webp" alt="" width={120} height={57} draggable={false} className="h-full w-full select-none object-contain" />
        {live && (
          <span className="absolute -bottom-px -right-px flex h-[26%] min-h-2 w-[26%] min-w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#009646]/55" />
            <span className="relative h-full w-full rounded-full border-2 border-white bg-[#009646]" />
          </span>
        )}
      </span>
    </span>
  );
}

/** The trigger button — pass whatever styling the placement wants via `className`. */
export function ConciergeLauncher({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'onClick'>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className} {...rest}>
        {children}
      </button>
      {open && <AssistantChat onClose={() => setOpen(false)} />}
    </>
  );
}

/** The visible area (top + height) while the keyboard is up, so the chat ends right above it. */
function useVisibleBox() {
  const read = () => {
    const v = typeof window !== 'undefined' ? window.visualViewport : null;
    return { top: Math.round(v?.offsetTop ?? 0), height: Math.round(v?.height ?? window.innerHeight) };
  };
  const [box, setBox] = useState(read);
  useEffect(() => {
    const v = window.visualViewport;
    const upd = () => setBox(read());
    upd();
    v?.addEventListener('resize', upd);
    v?.addEventListener('scroll', upd);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      v?.removeEventListener('resize', upd);
      v?.removeEventListener('scroll', upd);
      document.body.style.overflow = prev;
    };
  }, []);
  return box;
}

function AssistantChat({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { cars } = useCars();
  const box = useVisibleBox();
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => [
    {
      id: newId(),
      role: 'assistant',
      text: t("Hi, I'm {name}. I can help you find the right car, or sort out a problem. What do you need?", { name: ASSISTANT_NAME }),
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [handing, setHanding] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const live = useConversation(convId);
  const human = convId !== null;

  const carBySlug = useMemo(() => new Map((cars ?? []).map((c) => [c.slug, c])), [cars]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [msgs, live.messages, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ask = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || busy) return;
      const next: ChatMsg[] = [...msgs, { id: newId(), role: 'user', text: clean }];
      setMsgs(next);
      setInput('');
      setBusy(true);
      try {
        const history = next.filter((m) => m.role !== 'note').map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch(apiUrl('/api/notify-message'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ type: 'assistant', messages: history, signedIn: Boolean(session) }),
        });
        const j = (await res.json().catch(() => null)) as { reply?: string; cars?: string[]; human?: boolean; error?: string } | null;
        const reply = j?.reply || j?.error || t('I had trouble answering that. You can try again, or talk to a person from the team.');
        setMsgs((cur) => [...cur, { id: newId(), role: 'assistant', text: reply, cars: j?.cars, offerHuman: Boolean(j?.human) || !j?.reply }]);
      } catch {
        setMsgs((cur) => [...cur, { id: newId(), role: 'assistant', text: t('I had trouble answering that. You can try again, or talk to a person from the team.'), offerHuman: true }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs, session, t],
  );

  /** Move the conversation to a real CX chat, in this same panel, carrying what was said so far. */
  const handOff = useCallback(async () => {
    if (handing || human) return;
    if (!userId) {
      setMsgs((cur) => [...cur, { id: newId(), role: 'note', text: t('Sign in to talk to a person from the team — it takes a few seconds.') }]);
      return;
    }
    setHanding(true);
    const id = await findOrCreateCxConversation(null, userId);
    if (!id) {
      setHanding(false);
      setMsgs((cur) => [...cur, { id: newId(), role: 'note', text: t('The team is not reachable right now. Please try again in a moment.') }]);
      return;
    }
    const transcript = msgs
      .filter((m) => m.role !== 'note')
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'Me' : ASSISTANT_NAME}: ${m.text}`)
      .join('\n');
    await sendMessage(id, userId, `[Chat with ${ASSISTANT_NAME} → CX team]\n${transcript}`);
    setConvId(id);
    setHanding(false);
  }, [handing, human, msgs, t, userId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (human && userId && convId) {
      setInput('');
      const { message } = await sendMessage(convId, userId, text);
      if (message) live.append(message);
      return;
    }
    void ask(text);
  };

  const chips = msgs.length === 1 && !human
    ? [t('Find me a car for a weekend'), t('I have a problem with my booking'), t('How does verification work?')]
    : [];

  return createPortal(
    <div className="fixed inset-x-0 z-[310] flex items-end justify-center sm:items-center" style={{ top: box.top, height: box.height }}>
      <button type="button" aria-label={t('Close')} onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ASSISTANT_NAME}
        className="relative flex h-full w-full max-w-md animate-sheet-in flex-col overflow-hidden bg-bg shadow-pop sm:h-[min(42rem,92%)] sm:rounded-3xl max-sm:rounded-t-[1.75rem]"
      >
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
          <ConciergeMark size={40} live />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-body font-semibold text-ink">{human ? t('CX team') : ASSISTANT_NAME}</p>
            <p className="truncate text-caption text-muted">
              {human ? t('A team member will join this chat') : t('CX assistant · usually answers in seconds')}
            </p>
          </div>
          {!human && (
            <button
              type="button"
              onClick={() => void handOff()}
              disabled={handing}
              className="shrink-0 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-detail font-semibold text-ink disabled:opacity-60"
            >
              {handing ? t('Connecting…') : t('Talk to a person')}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-panel">
            <Icon name="x" size={19} />
          </button>
        </header>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
          {!human &&
            msgs.map((m) => (
              <div key={m.id}>
                {m.role === 'note' ? (
                  <p className="mx-auto max-w-[88%] rounded-2xl bg-panel px-3.5 py-2 text-center text-detail text-ink-soft">
                    {m.text}{' '}
                    {!userId && <Link to="/login" onClick={onClose} className="font-semibold text-accent-700 underline">{t('Sign in')}</Link>}
                  </p>
                ) : m.role === 'user' ? (
                  <div className="flex justify-end">
                    <p className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-ink px-3.5 py-2.5 text-body text-white">{m.text}</p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <ConciergeMark size={30} />
                    <div className="min-w-0 max-w-[84%] space-y-2">
                      <p className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-line bg-surface px-3.5 py-2.5 text-body text-ink">{m.text}</p>
                      {m.cars && m.cars.length > 0 && (
                        <div className="space-y-2">
                          {m.cars.map((slug) => {
                            const c = carBySlug.get(slug);
                            if (!c) return null;
                            return (
                              <Link
                                key={slug}
                                to={`/cars/${slug}`}
                                onClick={onClose}
                                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2 pr-3 transition-colors hover:bg-panel/50"
                              >
                                <Img src={unsplash(c.images[0], 240)} alt="" className="h-14 w-20 shrink-0 rounded-xl bg-panel object-cover" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-detail font-semibold text-ink">{c.make} {c.model}</span>
                                  <span className="block truncate text-caption text-muted">{c.city} · {eur(c.pricePerDay)}/{t('day')}</span>
                                </span>
                                <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
                              </Link>
                            );
                          })}
                        </div>
                      )}
                      {m.offerHuman && (
                        <button type="button" onClick={() => void handOff()} disabled={handing} className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-detail font-semibold text-ink disabled:opacity-60">
                          {handing ? t('Connecting…') : t('Talk to a person')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

          {human &&
            (live.loading ? (
              <p className="text-center text-detail text-muted">{t('Connecting…')}</p>
            ) : (
              (live.messages ?? []).map((m) => {
                const mine = m.senderId === userId;
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <p className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-body ${mine ? 'rounded-tr-md bg-ink text-white' : 'rounded-tl-md border border-line bg-surface text-ink'}`}>
                      {m.deleted ? t('Message deleted') : m.body}
                    </p>
                  </div>
                );
              })
            ))}

          {busy && !human && (
            <div className="flex items-center gap-2.5">
              <ConciergeMark size={30} />
              <span className="flex gap-1 rounded-2xl rounded-tl-md border border-line bg-surface px-3.5 py-3" aria-label={t('typing')}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${i * 140}ms` }} />
                ))}
              </span>
            </div>
          )}

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {chips.map((c) => (
                <button key={c} type="button" onClick={() => void ask(c)} className="rounded-full border border-line-strong bg-surface px-3.5 py-2 text-detail font-semibold text-ink">
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={submit} className="flex items-end gap-2 border-t border-line bg-surface px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={human ? t('Write to the team…') : t('Ask {name} anything…', { name: ASSISTANT_NAME })}
            maxLength={800}
            enterKeyHint="send"
            className="min-w-0 flex-1 rounded-full border border-line bg-bg px-4 py-2.5 text-[16px] text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || (busy && !human)}
            aria-label={t('Send')}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-40"
          >
            <Icon name="arrowRight" size={19} />
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
