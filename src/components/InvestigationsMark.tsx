import { CxWordmark } from './CxWordmark';

/** The current CX wordmark (C X with the green bat above) with INVESTIGATIONS under it. `tone="light"` is for dark backgrounds (white C, bright green). */
export function InvestigationsMark({ tone = 'dark', className = '' }: { tone?: 'dark' | 'light'; className?: string }) {
  const light = tone === 'light';
  return (
    <span
      data-theme={light ? 'dark' : undefined}
      className={`inline-flex flex-col items-center ${light ? 'text-white' : 'text-[#1c1b17]'} ${className}`}
      aria-label="CX Investigations"
    >
      <CxWordmark className="h-9 w-auto" />
      <span aria-hidden className="-mt-0.5 text-[8px] font-black uppercase leading-none tracking-[0.34em]">Investigations</span>
    </span>
  );
}
