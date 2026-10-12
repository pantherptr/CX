import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShareProfileSheet, type PassData } from './CxPass';
import { useAuth } from '../lib/auth';
import { useLocale } from '../lib/i18n';
import { supabase } from '../lib/supabase';

/** A new member's first time on the dashboard: their CX Pass drops in once, with a welcome. Seen once,
 *  recorded on the profile (migration 0116) so it never comes back on another device either. */
export function WelcomePass() {
  const { profile, session, refreshProfile } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  // `=== null`, not falsy: a missing column (migration not run yet) must never trigger the welcome.
  const due = Boolean(session && profile && profile.welcome_pass_seen_at === null && !done);

  useEffect(() => {
    if (!due) return;
    const timer = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, [due]);

  if (!due || !profile || !session) return null;

  const finish = async (go?: string) => {
    setOpen(false);
    setDone(true);
    await supabase.rpc('mark_welcome_pass_seen');
    void refreshProfile();
    if (go) navigate(go);
  };

  const pass: PassData = {
    name: profile.full_name || session.user.email?.split('@')[0] || 'CX',
    username: profile.username,
    avatarUrl: profile.avatar_url,
    tier: profile.is_owner ? 'team' : profile.is_host ? 'host' : profile.is_verified_client ? 'verified' : 'member',
    trips: 0,
    respects: 0,
    since: String(new Date(profile.created_at).getFullYear()),
    url: `${window.location.origin}/signal/profile/${profile.id}`,
  };

  return (
    <ShareProfileSheet
      open={open}
      onClose={() => void finish()}
      pass={pass}
      heading={t('Welcome to CX')}
      start={{ label: t('Explore cars'), onClick: () => void finish('/browse') }}
    />
  );
}
