import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../lib/store';
import { fetchAdsQueue, money, reviewAd, type QueuedAd } from '../../lib/data/ads';

const STATUS_LABEL: Record<QueuedAd['status'], string> = {
  pending_review: 'Waiting for approval', active: 'Live', ended: 'Ended', rejected: 'Rejected', canceled: 'Cancelled',
};

/** Sponsored Signal posts — Owner/Admin only. Every one is already paid: Approve makes it live
 *  for the days that were bought, Reject refunds the whole amount (with an optional reason the
 *  advertiser sees). Nothing here edits the post itself. */
export function AdsPanel() {
  const { session } = useAuth();
  const { toast } = useApp();
  const [items, setItems] = useState<QueuedAd[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { items: rows, error } = await fetchAdsQueue();
    setItems(rows);
    setLoadError(error);
  };
  useEffect(() => { void load(); }, []);

  const decide = async (ad: QueuedAd, action: 'approve' | 'reject') => {
    if (!session || busy) return;
    let reason: string | undefined;
    if (action === 'reject') {
      const r = window.prompt('Reject and refund — reason (optional, the advertiser sees it):', '');
      if (r === null) return;
      reason = r;
    }
    setBusy(ad.adId);
    const { error } = await reviewAd(ad.adId, action, session.access_token, reason);
    setBusy(null);
    if (error) { toast({ title: 'Could not complete', desc: error, icon: 'info' }); return; }
    toast({ title: action === 'approve' ? 'Approved — it is live' : 'Rejected and refunded', icon: 'check' });
    void load();
  };

  const waiting = (items ?? []).filter((a) => a.status === 'pending_review').length;

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-lead font-semibold text-ink">Sponsored posts</h2>
        <p className="mt-1 text-detail text-muted">People pay first, you approve afterwards. Reject anything misleading, unsafe or off-topic — the full amount goes back automatically.</p>
        {items && <p className="mt-2 text-caption font-semibold text-ink-soft">Waiting for approval: {waiting}</p>}
      </div>
      {loadError && <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">{loadError}</p>}
      {items === null ? (
        <p className="py-10 text-center text-detail text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-detail text-muted">No sponsorships yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((ad) => (
            <div key={ad.adId} className="flex gap-3 rounded-2xl border border-line bg-surface p-3.5">
              {ad.mediaUrl && <img src={ad.mediaUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />}
              <div className="min-w-0 flex-1">
                <p translate="no" className="text-detail font-semibold text-ink">{ad.advertiserName}{ad.advertiserUsername ? ` · @${ad.advertiserUsername}` : ''}</p>
                <p translate="no" className="mt-1 line-clamp-3 text-detail text-ink-soft">{ad.postText || '…'}</p>
                <p className="mt-1.5 text-caption text-muted">
                  {STATUS_LABEL[ad.status]} · {money(ad.dailyCents)} × {ad.days} = {money(ad.totalCents)}
                  {(ad.status === 'active' || ad.status === 'ended') && ` · ${ad.impressions} reached`}
                  {ad.endsAt && ad.status === 'active' && ` · until ${new Date(ad.endsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                </p>
                {ad.status === 'rejected' && ad.rejectReason && <p className="mt-0.5 text-caption text-muted">“{ad.rejectReason}”</p>}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Link to={`/signal/post/${ad.postId}`} target="_blank" className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3.5 text-caption font-semibold text-ink-soft">
                    <Icon name="arrowUpRight" size={13} /> Open post
                  </Link>
                  {ad.status === 'pending_review' && (
                    <>
                      <button type="button" disabled={busy === ad.adId} onClick={() => void decide(ad, 'approve')} className="inline-flex min-h-9 items-center rounded-full bg-ink px-4 text-caption font-semibold text-white disabled:opacity-50">Approve</button>
                      <button type="button" disabled={busy === ad.adId} onClick={() => void decide(ad, 'reject')} className="inline-flex min-h-9 items-center rounded-full border border-line px-4 text-caption font-semibold text-danger disabled:opacity-50">Reject &amp; refund</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
