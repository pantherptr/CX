import { useState } from 'react';
import { Icon } from './Icon';

/** One question: a round marker that turns green when open, the question in green, a smooth reveal. */
export function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
      >
        <span className={`text-[1.0625rem] font-semibold leading-snug transition-colors duration-200 ${open ? 'text-accent-700' : 'text-ink'}`}>{q}</span>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-300 ${
            open ? 'bg-accent text-white shadow-[0_8px_18px_-8px_rgba(0,170,60,0.8)]' : 'bg-panel text-ink-soft group-hover:bg-panel-2'
          }`}
        >
          <Icon name="chevronDown" size={18} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <div
        className="grid overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="pb-5 pr-12 text-[1.0625rem] leading-relaxed text-muted text-pretty">{a}</p>
        </div>
      </div>
    </div>
  );
}
