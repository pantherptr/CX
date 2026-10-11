import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useApp } from '../lib/store';
import { KIND_STYLE } from '../lib/data/appNotifications';
import { syncWebPush } from '../lib/webPush';
import { useLocale } from '../lib/i18n';

/** Mounted once: shows a toast the moment something new lands in your inbox while the site is open,
 *  and re-attaches this browser's push subscription to whoever is signed in. */
export function NotificationToaster() {
  const { session } = useAuth();
  const { toast } = useApp();
  const { lang } = useLocale();
  const uid = session?.user.id;

  // Tell the server which language this person chose, so what it writes for them (push, inbox, CX chat
  // messages) comes in that language.
  useEffect(() => {
    if (!uid) return;
    void supabase.rpc('save_my_language', { p_lang: lang });
  }, [uid, lang]);

  useEffect(() => {
    if (!uid) return;
    void syncWebPush();
    const channel = supabase
      .channel(`toast:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${uid}` }, (p) => {
        const r = p.new as { kind: string; title: string; body: string };
        toast({ title: r.title, desc: r.body || undefined, icon: KIND_STYLE[r.kind]?.icon ?? 'bell' });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [uid, toast]);

  return null;
}
