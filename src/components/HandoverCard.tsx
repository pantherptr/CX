import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { useLocale } from '../lib/i18n';
import { isHandoverVerified } from '../lib/data/handovers';

/** On a trip: scan the other person's CX Pass at the handover to put the verified seal on it. */
export function HandoverCard({ bookingId }: { bookingId: string }) {
  const { t } = useLocale();
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => {
    let off = false;
    isHandoverVerified(bookingId).then((v) => { if (!off) setVerified(v); });
    return () => { off = true; };
  }, [bookingId]);
  if (verified === null) return null;

  if (verified) {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-050 text-accent-700"><Icon name="verified" size={20} /></span>
        <div className="min-w-0">
          <p className="text-detail font-semibold text-ink">{t('Handover verified')}</p>
          <p className="text-caption text-muted">{t('You both scanned your CX Pass.')}</p>
        </div>
      </div>
    );
  }
  return (
    <Link to={`/scan?booking=${bookingId}`} className="pressable mt-5 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-noir text-white"><Icon name="camera" size={19} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-detail font-semibold text-ink">{t('Scan the CX Pass at the handover')}</p>
        <p className="text-caption text-muted">{t('Confirm the handover in one tap — it adds a verified seal.')}</p>
      </div>
      <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
    </Link>
  );
}
