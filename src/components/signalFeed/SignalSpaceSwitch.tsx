import { Icon } from '../Icon';

/** The Official / Community switch at the top of the SIGNAL feed on a phone —
 *  a sticky, blurred segmented control that takes the place of the old
 *  category pills. (On a computer the same choice lives in the side rail.) */
export function SignalSpaceSwitch({
  space,
  onChange,
}: {
  space: 'official' | 'community';
  onChange: (space: 'official' | 'community') => void;
}) {
  const items = [
    { id: 'official' as const, label: 'Official', icon: 'shield' as const },
    { id: 'community' as const, label: 'Community', icon: 'users' as const },
  ];
  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-10 -mx-2.5 mb-2 bg-bg/85 px-2.5 py-2 backdrop-blur-xl sm:-mx-4 sm:px-4 lg:hidden">
      <div className="flex gap-1 rounded-full bg-panel p-1" role="tablist" aria-label="SIGNAL">
        {items.map((it) => {
          const on = space === it.id;
          return (
            <button
              key={it.id}
              role="tab"
              aria-selected={on}
              onClick={() => !on && onChange(it.id)}
              className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full text-detail font-semibold transition-[background-color,color,box-shadow] ${
                on ? 'bg-surface text-ink shadow-hair' : 'text-muted hover:text-ink'
              }`}
            >
              <Icon name={it.icon} size={15} />
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
