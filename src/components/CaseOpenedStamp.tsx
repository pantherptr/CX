import { useEffect, useState } from 'react';
import { INVESTIGATORS, agentFor } from '../lib/investigations';
import { useLocale } from '../lib/i18n';

/**
 * "Case opened", kept simple: the investigator is picked on screen (faces flick past, slow down, land on the one
 * assigned to this case), then a transparent rubber stamp — "CASE OPENED / CX INVESTIGATIONS" — sits next to their
 * portrait. No box, no background: it sits on the chat like ink on paper.
 */
export function CaseOpenedStamp({ seed, onPicked, className = '' }: { seed: string; onPicked?: (name: string) => void; className?: string }) {
  const { t } = useLocale();
  const agent = agentFor(seed);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [phase, setPhase] = useState<'pick' | 'done'>(reduced ? 'done' : 'pick');
  const [shown, setShown] = useState(reduced ? agent.index : (agent.index + 5) % INVESTIGATORS.length);

  useEffect(() => {
    if (phase !== 'pick') return;
    const delays = [...Array(12).fill(70), 95, 125, 165, 220, 300, 420, 580];
    const timers: number[] = [];
    let at = 0;
    let last = shown;
    delays.forEach((d, i) => {
      at += d;
      const final = i === delays.length - 1;
      timers.push(window.setTimeout(() => {
        let next = final ? agent.index : Math.floor(Math.random() * INVESTIGATORS.length);
        if (!final && next === last) next = (next + 1) % INVESTIGATORS.length;
        last = next;
        setShown(next);
      }, at));
    });
    timers.push(window.setTimeout(() => { setPhase('done'); onPicked?.(agent.name); }, at + 900));
    return () => timers.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const face = INVESTIGATORS[shown];

  if (phase === 'pick') {
    return (
      <div className={`flex items-center gap-3 ${className}`} role="status" aria-label={t('Assigning an investigator')}>
        <span className="relative grid h-[68px] w-[68px] shrink-0 place-items-center">
          <span aria-hidden className="cx-pick-ring absolute inset-0 rounded-full" />
          <img src={face.src} alt="" className="h-[58px] w-[58px] rounded-full bg-black object-cover object-top" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">{t('Assigning an investigator')}</p>
          <p key={face.name} className="cx-pick-name mt-0.5 text-[20px] font-black uppercase leading-none tracking-[0.12em] text-ink">{face.name}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <img src={agent.src} alt={agent.name} className="h-[60px] w-[60px] shrink-0 rounded-full bg-black object-cover object-top ring-2 ring-[#0c7a38]/60 dark:ring-[#1be77a]/60" />
      <div
        className="cx-stamp-in -rotate-[4deg] rounded-[6px] border-[3px] border-double border-[#0c7a38]/85 px-3 py-1.5 text-[#0c7a38] opacity-90 dark:border-[#1be77a]/80 dark:text-[#1be77a]"
        style={{ WebkitMaskImage: 'radial-gradient(circle at 20% 30%, #000 60%, rgba(0,0,0,0.82) 100%)', maskImage: 'radial-gradient(circle at 20% 30%, #000 60%, rgba(0,0,0,0.82) 100%)' }}
      >
        <p className="text-[19px] font-black uppercase leading-none tracking-[0.16em]">{t('Case opened')}</p>
        <p className="mt-1 text-[8.5px] font-bold uppercase leading-none tracking-[0.34em]">CX Investigative</p>
      </div>
    </div>
  );
}
