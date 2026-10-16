import { CxWordmark } from './CxWordmark';

/** The current CX wordmark (C X with the green bat above) with INVESTIGATIONS under it. `tone="light"` is for dark backgrounds (white C, bright green). */
export function InvestigationsMark({ tone = 'dark', size = 'md', className = '' }: { tone?: 'dark' | 'light'; size?: 'sm' | 'md'; className?: string }) {
  const light = tone === 'light';
  return (
    <span
      data-theme={light ? 'dark' : undefined}
      className={`inline-flex flex-col items-center ${light ? 'text-white' : 'text-[#1c1b17]'} ${className}`}
      aria-label="CX Investigations"
    >
      <CxWordmark className={size === 'sm' ? 'h-6 w-auto' : 'h-9 w-auto'} />
      <span aria-hidden className={`-mt-0.5 font-black uppercase leading-none ${size === 'sm' ? 'text-[6px] tracking-[0.3em]' : 'text-[8px] tracking-[0.34em]'}`}>Investigations</span>
    </span>
  );
}
