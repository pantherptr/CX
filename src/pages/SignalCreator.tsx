import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { SignalSHero } from '../components/SignalLogo';
import { CxMark } from '../components/CxBadge';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';
import { useApp } from '../lib/store';
import { useLocale } from '../lib/i18n';
import { getMyLimits, hasRequestedCreator, requestCreator, type SignalLimits } from '../lib/data/signalPlan';

/** Free-plan figures used before the migration has answered (same defaults as signal_plan_config). */
const FALLBACK = { perMonth: 20, maxSeconds: 180 };

type Cell = { text?: string; yes?: boolean };

/** What the Creator plan is and how to get it. Payments are not switched on yet, so asking sends a request to
 *  the team, who grant the plan by hand. */
export default function SignalCreator() {
  const { session, profile } = useAuth();
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
  const perMonth = limits?.perMonth ?? FALLBACK.perMonth;
  const minutes = Math.max(1, Math.round((limits?.maxSeconds ?? FALLBACK.maxSeconds) / 60));
  const used = limits?.videosThisMonth ?? 0;
  const status = isCreator ? 'creator' : asked ? 'asked' : 'free';

  const ask = async () => {
    setBusy(true);
    const r = await requestCreator();
    setBusy(false);
    if (r.error) { toast({ title: t('Could not send your request'), desc: r.error, icon: 'info' }); return; }
    setAsked(true);
    toast({ title: t('Request sent'), desc: t('The team will get back to you.'), icon: 'checkCircle' });
  };

  const rows: { label: string; free: Cell; creator: Cell }[] = [
    { label: t('Photos'), free: { text: t('Unlimited') }, creator: { text: t('Unlimited') } },
    { label: t('Videos per month'), free: { text: String(perMonth) }, creator: { text: t('Unlimited') } },
    { label: t('Video length'), free: { text: t('Up to {m} min', { m: minutes }) }, creator: { text: t('Any length') } },
    { label: t('Post statistics'), free: { yes: true }, creator: { yes: true } },
    { label: t('Creator badge'), free: { yes: false }, creator: { yes: true } },
  ];

  const cell = (c: Cell, strong: boolean) =>
    c.text !== undefined ? (
      <span className={strong ? 'font-semibold text-ink' : 'text-muted'}>{c.text}</span>
    ) : c.yes ? (
      <Icon name="check" size={17} strokeWidth={2.4} className={strong ? 'text-accent' : 'text-muted'} />
    ) : (
      <span className="text-faint" aria-label={t('No')}>—</span>
    );

  const name = profile?.full_name?.trim() || t('Your name');
  const handle = profile?.username ? `@${profile.username}` : null;
  const initial = name.charAt(0).toUpperCase();

  const steps = [
    { title: t('Ask for Creator'), body: t('One tap below. No card, nothing to pay.') },
    { title: t('The team looks at your profile'), body: t('Creator is switched on by hand while payments are closed.') },
    { title: t('Your badge appears'), body: t('The silver S shows next to your name and the video limits are gone.') },
  ];

  return (
    <DashboardShell variant="customer" active="Notifications">
      <div className="mx-auto max-w-xl px-4 pb-32 pt-4 sm:p-6 sm:pb-32 lg:p-8">
        <button type="button" onClick={() => navigate(-1)} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-detail font-semibold text-muted">
          <Icon name="chevronLeft" size={16} /> {t('Back')}
        </button>

        {/* Hero: always on the dark SIGNAL surface, whatever the theme */}
        <section className="relative overflow-hidden rounded-[28px] bg-[#070908] px-6 pb-7 pt-8 text-center text-white ring-1 ring-white/[0.08]">
          <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-56 w-[85%] rounded-full bg-[radial-gradient(closest-side,rgba(0,212,71,0.28),transparent)]" />
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(255,255,255,0.03))]" />
          <div className="relative">
            <SignalSHero height={64} className="mx-auto" />
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">SIGNAL Creator</p>
            <h1 className="mt-2 font-display text-[2rem] font-semibold leading-[1.05] tracking-[-0.025em] text-balance sm:text-[2.35rem]">
              {t('Publish without limits.')}
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-white/70 text-pretty">
              {t('For people who publish a lot on SIGNAL. Photos are always free and unlimited; Creator removes the limits on video.')}
            </p>
            <span
              className={`mt-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-semibold ${
                status === 'creator' ? 'bg-accent-bright/15 text-accent-bright' : 'bg-white/[0.08] text-white/80'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${status === 'creator' ? 'bg-accent-bright' : status === 'asked' ? 'bg-amber-400' : 'bg-white/50'}`} />
              {status === 'creator' ? t('Creator active') : status === 'asked' ? t('Request sent') : t('You are on the free plan')}
            </span>
          </div>
        </section>

        {/* How the badge looks on the person's own name */}
        <section className="mt-4 rounded-[22px] border border-line bg-surface p-4">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-faint">{t('How you will appear')}</p>
          <div className="mt-3 flex items-center gap-3">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel font-semibold text-ink-soft">{initial}</span>
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-body font-semibold text-ink">
                <span className="truncate">{name}</span>
                <CxMark tier="creator" size={17} />
              </p>
              {handle && <p className="truncate text-caption text-muted">{handle}</p>}
            </div>
          </div>
        </section>

        {/* Free vs Creator */}
        <section className="mt-4 overflow-hidden rounded-[22px] border border-line bg-surface">
          <div className="grid grid-cols-[1fr_5.5rem_5.5rem] items-end gap-2 border-b border-line px-4 pb-3 pt-4 text-caption font-semibold sm:grid-cols-[1fr_7rem_7rem]">
            <span className="text-faint">{t('What you get')}</span>
            <span className="text-center text-muted">{t('Free')}</span>
            <span className="text-center text-ink">Creator</span>
          </div>
          <ul>
            {rows.map((r, i) => (
              <li
                key={r.label}
                className={`grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-2 px-4 py-3.5 text-detail sm:grid-cols-[1fr_7rem_7rem] ${i > 0 ? 'border-t border-line/70' : ''}`}
              >
                <span className="text-ink-soft">{r.label}</span>
                <span className="flex justify-center text-center">{cell(r.free, false)}</span>
                <span className="flex justify-center rounded-lg text-center">{cell(r.creator, true)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* This month's usage, only once the limits are switched on */}
        {limits && !isCreator && limits.enforce && (
          <section className="mt-4 rounded-[22px] border border-line bg-panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-detail font-semibold text-ink">{t('Your free plan this month')}</p>
              <p className="text-caption tabular-nums text-muted">{used} / {perMonth}</p>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent-bright transition-[width] duration-500" style={{ width: `${Math.min(100, (used / Math.max(1, perMonth)) * 100)}%` }} />
            </div>
            <p className="mt-2 text-caption text-muted">
              {t('{n} of {max} videos used · up to {m} minutes each', { n: used, max: perMonth, m: minutes })}
            </p>
          </section>
        )}

        {/* How to get it */}
        {!isCreator && (
          <section className="mt-6">
            <h2 className="px-1 font-display text-[1.25rem] font-semibold tracking-[-0.015em] text-ink">{t('How to get it')}</h2>
            <ol className="mt-3 space-y-0">
              {steps.map((s, i) => {
                const done = asked && i === 0;
                return (
                  <li key={s.title} className="relative flex gap-3.5 pb-5 last:pb-0">
                    {i < steps.length - 1 && <span aria-hidden className="absolute left-[15px] top-9 bottom-1 w-px bg-line" />}
                    <span
                      className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-caption font-bold ${
                        done ? 'bg-accent-bright text-black' : 'bg-panel text-ink-soft ring-1 ring-line'
                      }`}
                    >
                      {done ? <Icon name="check" size={15} strokeWidth={2.6} /> : i + 1}
                    </span>
                    <span className="min-w-0 pt-1">
                      <span className="block text-body font-semibold text-ink">{s.title}</span>
                      <span className="mt-0.5 block text-detail text-muted">{s.body}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* Action */}
        <div className="mt-7">
          {isCreator ? (
            <div className="flex items-center gap-3 rounded-[22px] border border-accent/30 bg-surface p-4">
              <CxMark tier="creator" size={20} />
              <p className="text-detail font-semibold text-ink">{t('You have Creator access. No limits on your videos.')}</p>
            </div>
          ) : asked ? (
            <div className="flex items-center gap-3 rounded-[22px] border border-line bg-surface p-4">
              <Icon name="checkCircle" size={20} className="shrink-0 text-accent" />
              <p className="text-detail font-semibold text-ink">{t('Request sent. The team will get back to you.')}</p>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => void ask()} disabled={busy || !session} className="btn btn-accent-bright btn-lg btn-block disabled:opacity-60">
                {busy ? t('Sending…') : t('Ask for Creator')}
              </button>
              <p className="mt-2.5 text-center text-caption text-faint">{t('Payments are not open yet: the team grants Creator by hand for now.')}</p>
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
