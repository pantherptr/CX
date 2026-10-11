import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

/**
 * "Typing…" and "Online" for the open conversation, on a realtime channel of its own
 * (Broadcast + Presence — nothing is written to the database). A typing event is sent at most
 * once every 2.5 s while you type, and the other side drops the indicator after 4 s of silence.
 */
export function useChatPresence(conversationId: string | null, myId: string | undefined, otherId: string | undefined) {
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(false);
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    setTyping(false);
    setOnline(false);
    if (!conversationId || !myId || !otherId) return;
    let clear = 0;
    const channel = supabase.channel(`chat:${conversationId}`, { config: { presence: { key: myId }, broadcast: { self: false } } });
    chanRef.current = channel;
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.userId !== otherId) return;
        setTyping(Boolean(payload.typing));
        window.clearTimeout(clear);
        if (payload.typing) clear = window.setTimeout(() => setTyping(false), 4000);
      })
      .on('presence', { event: 'sync' }, () => {
        setOnline(Object.prototype.hasOwnProperty.call(channel.presenceState(), otherId));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ at: Date.now() });
      });
    return () => {
      window.clearTimeout(clear);
      chanRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, myId, otherId]);

  /** Call on every keystroke; sends are throttled. Pass false when the field empties / a message is sent. */
  const notifyTyping = useCallback((isTyping = true) => {
    const channel = chanRef.current;
    if (!channel || !myId) return;
    const now = Date.now();
    if (isTyping && now - lastSent.current < 2500) return;
    lastSent.current = isTyping ? now : 0;
    void channel.send({ type: 'broadcast', event: 'typing', payload: { userId: myId, typing: isTyping } });
  }, [myId]);

  return { typing, online, notifyTyping };
}
