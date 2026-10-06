import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { useLocale } from '../lib/i18n';

/** Stands in for the host card for visitors who have not signed in yet:
 *  who the host is stays private until there is an account. */
export function HostLocked() {
  const { t } = useLocale();
  const { pathname } = useLocation();
  const state = { from: { pathname } };
  return (
    <div className="card relative overflow-hidden p-6">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-050 text-accent-700">
          <Icon name="lock" size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-ink">{t('Sign in to meet your host')}</h3>
          <p className="mt-1 text-body leading-relaxed text-muted text-pretty">
            {t('The host’s name, photo, bio and how fast they reply are shared with signed-in members. Your trip is always arranged through CX.')}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link to="/login" state={state} className="btn btn-accent-bright">
          {t('Sign in')} <Icon name="arrowRight" size={16} />
        </Link>
        <Link to="/signup" state={state} className="btn btn-secondary">
          {t('Create account')}
        </Link>
      </div>
    </div>
  );
}
