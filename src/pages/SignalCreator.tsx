import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { SignalS } from '../components/SignalLogo';
import { CxMark } from '../components/CxBadge';
import { Icon, type IconName } from '../components/Icon';
import { useAuth } from '../lib/auth';
import { useApp } from '../lib/store';
import { useLocale } from '../lib/i18n';
import { getMyLimits, hasRequestedCreator, requestCreator, type SignalLimits } from '../lib/data/signalPlan';

const PERKS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'play', title: 'Videos without limits', body: 'Any length, as many as you like — no monthly cap.' },
  { icon: 'verified', title: 'The Creator badge', body: 'A quiet silver mark with the S, next to your name on SIGNAL.' },
  { icon: 'chart', title: 'Know what works', body: 'Statistics on every post: who saw it and what they did.' },
];

/** What the Creator plan is and how to get it. Payments are not switched on yet, so asking sends a request to
 *  the team, who grant the plan by hand. */
export default function SignalCreator() {
  const { session } = useAuth();
  const { toast } = useApp();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [limits, setLimits] = useState<SignalLimits | null | undefined>(undefined);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getMyLimits(true).then(setLimits);
    if (session) void hasRequestedCreator(session.user.id).then(setAsked);
  }, [session]);

  const isCreator = limits?.isCreator === true;

  const ask = async () => {
    setBusy(true);
    const r = await requestCreator();
    setBusy(false);
    if (r.error) { toast({ title: t('Could not send your request'), desc: r.error, icon: 'info' }); return; }
    setAsked(true);
    toast({ title: t('Request sent'), desc: t('The team will get back to you.'), icon: 'checkCircle' });
  };

  return (
    <DashboardShell variant="customer" active="Notifications">
      <div className="mx-auto max-w-xl p-4 sm:p-6 lg:p-8">
        <button type="button" onClick={() => navigate(-1)} className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-detail font-semibold text-muted">
          <Icon name="chevronLeft" size={16} /> {t('Back')}
        </button>

        <div className="flex items-center gap-3">
          <SignalS size={30} />
          <h1 className="font-display text-[2rem] font-bold leading-none tracking-tight text-ink">Creator</h1>
        </div>
        <p className="mt-3 text-body text-ink-soft">{t('For people who publish a lot on SIGNAL. Photos are always free and unlimited; Creator removes the limits on video.')}</p>

        <ul className="mt-6 space-y-2.5">
          {PERKS.map((p) => (
            <li key={p.title} className="flex items-start gap-3.5 rounded-2xl border border-line bg-surface p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-panel text-ink-soft"><Icon name={p.icon} size={19} /></span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-ink">{t(p.title)}</span>
                <span className="mt-0.5 block text-detail text-muted">{t(p.body)}</span>
              </span>
            </li>
          ))}
        </ul>

        {limits && !isCreator && limits.enforce && (
          <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
            <p className="text-detail font-semibold text-ink">{t('Your free plan this month')}</p>
            <p className="mt-1 text-detail text-muted">
              {t('{n} of {max} videos used · up to {m} minutes each', { n: limits.videosThisMonth, max: limits.perMonth, m: Math.round(limits.maxSeconds / 60) })}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent-bright" style={{ width: `${Math.min(100, (limits.videosThisMonth / Math.max(1, limits.perMonth)) * 100)}%` }} />
            </div>
          </div>
        )}

        <div className="mt-6">
          {isCreator ? (
            <div className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-surface p-4">
              <CxMark tier="creator" size={18} />
              <p className="text-detail font-semibold text-ink">{t('You have Creator access. No limits on your videos.')}</p>
            </div>
          ) : asked ? (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
              <Icon name="checkCircle" size={20} className="text-accent" />
              <p className="text-detail font-semibold text-ink">{t('Request sent. The team will get back to you.')}</p>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => void ask()} disabled={busy || !session} className="btn btn-primary btn-lg btn-block disabled:opacity-60">
                {busy ? t('Sending…') : t('Ask for Creator')}
              </button>
              <p className="mt-2 text-center text-caption text-faint">{t('Payments are not open yet: the team grants Creator by hand for now.')}</p>
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
