import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { useLocale } from '../../lib/i18n';
import { useCarAvailableSoon } from '../../lib/data/tripMemories';

/** "Vorrei le chiavi": straight into the existing booking flow when the car is
 *  free in the next days; otherwise to the car's page, where its availability
 *  and similar cars already are. */
export function KeysCta({ carId, carSlug, className = '' }: { carId: string; carSlug: string; className?: string }) {
  const navigate = useNavigate();
  const { t } = useLocale();
  const available = useCarAvailableSoon(carId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(available === false ? `/cars/${carSlug}` : `/book/${carSlug}`);
      }}
      className={`pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-detail font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,0,0,0.55)] ${className}`}
    >
      <Icon name="key" size={16} className="text-accent-bright" />
      {t('I want the keys')}
      {available === false && <span className="text-caption font-medium text-white/60">· {t('Check availability')}</span>}
    </button>
  );
}
