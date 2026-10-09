import { useRef, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { useLocale } from '../../lib/i18n';
import { VISIBILITY_OPTIONS, type Visibility } from '../../lib/data/privacy';
import { PostActionMenu } from './PostActionMenu';

const ICON: Record<Visibility, IconName> = { public: 'globe', followers: 'users', circle: 'sparkles', private: 'lock' };

/** "Who can see this" — one quiet pill that opens the same menu the post "…"
 *  uses. Public / Followers / CX Circle / Only me. */
export function VisibilityPicker({
  value, onChange, disabled,
}: { value: Visibility; onChange: (v: Visibility) => void; disabled?: boolean }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const current = VISIBILITY_OPTIONS.find((o) => o.value === value) ?? VISIBILITY_OPTIONS[1];
  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="menu"
        aria-label={t('Who can see this')}
        className="pressable inline-flex min-h-9 items-center gap-1.5 rounded-full bg-panel px-3 text-caption font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
      >
        <Icon name={ICON[value]} size={13} />
        {t(current.label)}
        <Icon name="chevronDown" size={12} className="text-faint" />
      </button>
      {open && (
        <PostActionMenu
          anchor={btn.current}
          onClose={() => setOpen(false)}
          groups={[VISIBILITY_OPTIONS.map((o) => ({
            icon: o.value === value ? ('check' as IconName) : ICON[o.value],
            label: `${t(o.label)} — ${t(o.hint)}`,
            onClick: () => onChange(o.value),
          }))]}
        />
      )}
    </>
  );
}
