import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { motion, AnimatePresence } from './motionKit';

/** iOS-style grouped list: a titled card whose rows are separated by hairlines. */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      {title && <h2 className="mb-2.5 px-1 font-display text-lg font-semibold text-ink">{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-surface">{children}</div>
    </section>
  );
}

export function Row({ icon, title, sub, value, onClick, open, children }: { icon: IconName; title: ReactNode; sub?: ReactNode; value?: string; onClick?: () => void; open?: boolean; children?: ReactNode }) {
  const inner = (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-panel text-ink"><Icon name={icon} size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium text-ink">{title}</span>
        {sub && <span className="mt-0.5 block text-detail leading-snug text-muted">{sub}</span>}
      </span>
      {value && <span className="shrink-0 text-body text-muted">{value}</span>}
      {onClick && <Icon name="chevronRight" size={16} className={`shrink-0 text-faint transition-transform duration-300 ${open ? 'rotate-90' : ''}`} />}
    </div>
  );
  return (
    <div>
      {onClick ? <button type="button" onClick={onClick} className="block w-full text-left transition-colors active:bg-panel">{inner}</button> : inner}
      <AnimatePresence initial={false}>
        {open && children && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

