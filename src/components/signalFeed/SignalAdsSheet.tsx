import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../lib/store';
import { useLocale } from '../../lib/i18n';
import { fetchMyAds, money, reviewAd, type AdStatus, type MyAd } from '../../lib/data/ads';

const STATUS: Record<AdStatus, string> = {
  pending_review: 'Waiting for approval', active: 'Live', ended: 'Ended', rejected: 'Not approved — refunded', canceled: 'Cancelled — refunded',
};

/** "Your sponsorships": where each one stands, how many people saw it, and cancel while it waits for approval. */
export function SignalAdsSheet({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const { session } = useAuth();
  const { toast } = useApp();
  const [ads, setAds] = useState<MyAd[] | null>(null);
  const load = () => { void fetchMyAds().then(setAds); };
  useEffect(load, []);

  const cancel = async (ad: MyAd) => {
    if (!session || !window.confirm(t('Cancel this sponsorship? You get a full refund.'))) return;
    const { error } = await reviewAd(ad.adId, 'cancel', session.access_token);
    if (error) toast({ title: 'Could not cancel', desc: error, icon: 'info' });
    else load();
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-end justify-center bg-black/55 sm:items-center" role="dialog" aria-modal="true" onClick={onClose} data-no-open>
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop sm:max-w-lg sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-[20px] font-semibold text-ink">{t('Your sponsorships')}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-panel hover:text-ink"><Icon name="x" size={18} /></button>
        </div>
        <p className="mt-1.5 text-detail text-muted">{t('To sponsor a post, open its ⋯ menu and choose Sponsor.')}</p>
        <div className="mt-4 space-y-2.5">
          {ads === null ? (
            <p className="py-6 text-center text-detail text-muted">{t('Loading…')}</p>
          ) : ads.length === 0 ? (
            <p className="py-6 text-center text-detail text-muted">{t('No sponsorships yet.')}</p>
          ) : ads.map((ad) => (
            <div key={ad.adId} className="rounded-2xl border border-line bg-surface p-3.5">
              <p translate="no" className="line-clamp-2 text-detail text-ink">{ad.postText || '…'}</p>
              <p className="mt-2 text-caption font-semibold text-ink-soft">{t(STATUS[ad.status])}</p>
              <p className="mt-0.5 text-caption text-muted">
                {money(ad.dailyCents)} × {ad.days} {t('days')} = {money(ad.totalCents)}
                {(ad.status === 'active' || ad.status === 'ended') && ` · ${t('{n} people reached', { n: ad.impressions })}`}
              </p>
              {ad.status === 'rejected' && ad.rejectReason && <p className="mt-1 text-caption text-muted">“{ad.rejectReason}”</p>}
              {ad.status === 'pending_review' && (
                <button type="button" onClick={() => void cancel(ad)} className="mt-2 text-caption font-semibold text-danger">{t('Cancel and refund')}</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
