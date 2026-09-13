import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { useApp } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import {
  useConversations, sendMessage, findOrCreateConversation, searchUsersForMessaging,
  type MessagingSearchResult,
} from '../../lib/data/messages';
import { incrementEmpirePostShare, type EmpirePost } from '../../lib/data/empireFeed';

/** "Share Post -> select conversation -> send" through CX Rent's existing
 *  Messages system — no second messaging system, this calls the exact
 *  same `sendMessage`/`findOrCreateConversation`/`searchUsersForMessaging`
 *  Messages.tsx's own NewMessageModal already uses. Two rows of people to
 *  pick from: the caller's existing conversations (send is one tap, the
 *  thread already exists), or — once they type 2+ characters — a name
 *  search across all users (send finds-or-creates the thread first, same
 *  as starting a fresh DM from Messages itself). Copy Link stays as the
 *  simple universal fallback the brief also asks for. */
export function SignalSharePostSheet({ post, onClose }: { post: EmpirePost; onClose: () => void }) {
  const { toast } = useApp();
  const { session } = useAuth();
  const { conversations } = useConversations(session?.user.id);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MessagingSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const url = `${window.location.origin}/signal/post/${post.id}`;
  const messageBody = `Check out this SIGNAL post: ${url}`;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const handle = window.setTimeout(() => {
      searchUsersForMessaging(q).then((rows) => {
        setSearchResults(rows.filter((r) => r.id !== session?.user.id));
        setSearching(false);
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query, session?.user.id]);

  const finishSend = (error: string | null) => {
    setSendingId(null);
    if (error) {
      toast({ title: 'Could not send', desc: error, icon: 'info' });
      return;
    }
    void incrementEmpirePostShare(post.id);
    toast({ title: 'Post sent', icon: 'check' });
    onClose();
  };

  const sendToConversation = async (rowId: string, conversationId: string) => {
    if (!session || sendingId) return;
    setSendingId(rowId);
    const { error } = await sendMessage(conversationId, session.user.id, messageBody);
    finishSend(error);
  };

  const sendToNewContact = async (userId: string) => {
    if (!session || sendingId) return;
    setSendingId(userId);
    try {
      const conversationId = await findOrCreateConversation(null, session.user.id, userId);
      const { error } = await sendMessage(conversationId, session.user.id, messageBody);
      finishSend(error);
    } catch {
      setSendingId(null);
      toast({ title: 'Could not start a conversation', icon: 'info' });
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    toast({ title: 'Link copied to clipboard', icon: 'check' });
    void incrementEmpirePostShare(post.id);
  };

  const showingSearch = query.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 animate-fade-in sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[75vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface sm:max-w-sm sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <span className="font-display font-semibold text-ink">Share Post</span>
          <button onClick={onClose} aria-label="Close" className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
            <Icon name="x" size={19} />
          </button>
        </div>

        <div className="p-4 pb-2">
          <button onClick={copyLink} className="pressable flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left text-detail font-semibold text-ink hover:bg-panel">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel"><Icon name="paperclip" size={16} /></span>
            Copy Link
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people to send to…"
            className="input mt-3 !py-2.5"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {showingSearch ? (
            searching ? (
              <p className="px-3 py-6 text-center text-detail text-muted">Searching…</p>
            ) : !searchResults || searchResults.length === 0 ? (
              <p className="px-3 py-6 text-center text-detail text-muted">No one found.</p>
            ) : (
              searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => sendToNewContact(u.id)}
                  disabled={sendingId === u.id}
                  className="pressable flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-panel disabled:opacity-50"
                >
                  {u.avatar ? (
                    <img src={u.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-detail font-semibold text-ink">{u.name}</span>
                  {sendingId === u.id ? <span className="skeleton h-4 w-4 rounded-full" /> : <span className="text-caption font-semibold text-accent-700">Send</span>}
                </button>
              ))
            )
          ) : !conversations ? (
            <p className="px-3 py-6 text-center text-detail text-muted">Loading…</p>
          ) : conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-detail text-muted">Search for someone above to send this to.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => sendToConversation(c.id, c.id)}
                disabled={sendingId === c.id}
                className="pressable flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-panel disabled:opacity-50"
              >
                {c.other.avatar ? (
                  <img src={c.other.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>
                )}
                <span className="min-w-0 flex-1 truncate text-detail font-semibold text-ink">{c.other.name}</span>
                {sendingId === c.id ? <span className="skeleton h-4 w-4 rounded-full" /> : <span className="text-caption font-semibold text-accent-700">Send</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
