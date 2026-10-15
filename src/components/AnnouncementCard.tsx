import { Icon } from './Icon';
import { useLocale } from '../lib/i18n';

/**
 * A message from the CX team in the inbox. It is a plain notice: tapping the card does nothing. When the team
 * attached a button, only that button opens something (a page of the app).
 */
export function AnnouncementCard({
  title,
  body,
  ctaLabel,
  time,
  unread = false,
  onCta,
  className = '',
}: {
  title: string;
  body: string;
  ctaLabel?: string | null;
  time?: string;
  unread?: boolean;
  onCta?: () => void;
  className?: string;
}) {
  const { t } = useLocale();
  return (
    <article className={`rounded-2xl border p-4 ${unread ? 'border-accent/30' : 'border-line'} bg-surface ${className}`}>
      <header className="flex items-center gap-3">
        <img src="/brand/avatar-cx-chrome.png?v=3" alt="" draggable={false} className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-detail font-semibold text-ink">
            {t('CX Team')}
            <Icon name="verified" size={14} className="text-accent" />
          </p>
          <p className="text-caption text-muted">{t('Announcement')}{time ? ` · ${time}` : ''}</p>
        </div>
        {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-bright" aria-label={t('New')} />}
      </header>
      <h3 className="mt-3 font-display text-body font-semibold leading-snug text-ink">{title}</h3>
      <p className="mt-1 whitespace-pre-line text-detail leading-relaxed text-ink-soft">{body}</p>
      {ctaLabel && (
        <button
          type="button"
          onClick={onCta}
          disabled={!onCta}
          className="mt-3.5 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-detail font-semibold text-white disabled:cursor-default"
        >
          {ctaLabel}
          <Icon name="arrowRight" size={15} />
        </button>
      )}
    </article>
  );
}
