import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../Icon';
import { useLocale } from '../../lib/i18n';

export interface PostMenuItem {
  icon: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
  fill?: boolean;
}

/** The "…" menu of a post. On a phone it rises from the bottom as a sheet (easy
 *  to reach with a thumb, with a grab handle and a clear Cancel); on a wider
 *  screen it is a small popover under the button. Entries are grouped —
 *  sharing, then your own actions, then moderation, then the destructive one
 *  last — and every entry has an icon tile. Rendered in a portal, so no card
 *  transform can displace it, and its taps never reach the card underneath. */
export function PostActionMenu({
  anchor, groups, onClose,
}: { anchor: HTMLElement | null; groups: PostMenuItem[][]; onClose: () => void }) {
  const { t } = useLocale();
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [isPhone, setIsPhone] = useState(() => window.innerWidth < 640);

  useLayoutEffect(() => {
    const place = () => {
      setIsPhone(window.innerWidth < 640);
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const body = (
    <div className="py-1.5">
      {groups.filter((g) => g.length > 0).map((group, gi) => (
        <div key={gi} className={gi > 0 ? 'mt-1.5 border-t border-line pt-1.5' : ''}>
          {group.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => { onClose(); item.onClick(); }}
              className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[15px] font-medium transition-colors active:bg-panel sm:text-detail ${
                item.danger ? 'text-danger hover:bg-danger/5' : 'text-ink hover:bg-panel'
              }`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-8 sm:w-8 ${item.danger ? 'bg-danger/10' : 'bg-panel'}`}>
                <Icon name={item.icon} size={17} fill={item.fill} />
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );

  return createPortal(
    <div data-no-open className="fixed inset-0 z-[400]" onClick={(e) => { e.stopPropagation(); onClose(); }} role="presentation">
      {isPhone ? (
        <>
          <div className="absolute inset-0 animate-fade-in bg-black/40" aria-hidden="true" />
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 animate-fade-up rounded-t-3xl bg-surface px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-pop"
          >
            <span className="mx-auto mb-1 block h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
            {body}
            <button type="button" onClick={onClose} className="mt-1 flex min-h-12 w-full items-center justify-center rounded-2xl bg-panel text-[15px] font-semibold text-ink active:bg-line">
              {t('Cancel')}
            </button>
          </div>
        </>
      ) : (
        pos && (
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{ top: pos.top, right: pos.right }}
            className="absolute w-64 origin-top-right animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
          >
            {body}
          </div>
        )
      )}
    </div>,
    document.body,
  );
}
