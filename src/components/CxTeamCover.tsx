import type { ReactNode } from 'react';

/** The official accounts' cover: a night road with the bat, drawn (no photo to load or to be missing). */
export function CxTeamCover({ className = 'h-36', children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`relative overflow-hidden bg-[#050806] ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_120%,rgba(0,212,71,0.55),rgba(0,133,54,0.18)_45%,transparent_70%)]" />
      <svg aria-hidden viewBox="0 0 400 144" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-70">
        <defs>
          <linearGradient id="cxroad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0c1a12" stopOpacity="0" />
            <stop offset="1" stopColor="#00d447" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
          <line key={i} x1={200 + i * 12} y1="40" x2={200 + i * 120} y2="144" stroke="url(#cxroad)" strokeWidth="1.2" />
        ))}
        <line x1="0" y1="40" x2="400" y2="40" stroke="#00d447" strokeOpacity="0.25" />
      </svg>
      {children}
    </div>
  );
}
