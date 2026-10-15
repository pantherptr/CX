/** The SIGNAL crest used in empty states and quiet corners: the same flat S as everywhere (see `SignalS`). */
export function SignalLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  return <SignalS size={size} className={`text-ink ${className}`} />;
}

/** The SIGNAL "S", cut from the wordmark: flat vector, the letter follows the text colour and carries the
 *  wordmark's green slash. Used in the menu, top bar, home and search. */
const S_ASPECT = 323 / 186;
const S_WHITE = 'M321.2 3.5 L135.0 4.0 L131.8 5.0 L128.5 5.0 L126.0 6.0 L123.8 6.0 L110.8 10.0 L102.2 14.0 L92.2 20.2 L82.0 29.2 L75.0 38.5 L71.0 46.2 L70.0 50.5 L69.0 52.0 L69.0 54.8 L68.0 57.2 L68.0 67.5 L69.0 70.2 L69.0 72.8 L70.0 74.2 L71.0 78.2 L75.0 85.2 L83.2 93.8 L90.5 98.8 L98.2 102.8 L107.0 105.8 L119.0 108.8 L220.0 119.8 L227.5 123.0 L231.5 126.5 L233.0 129.0 L233.0 133.5 L230.8 137.0 L227.2 140.0 L219.0 143.0 L133.0 143.2 L76.0 185.5 L221.0 185.8 L225.8 184.8 L229.8 184.8 L232.5 183.8 L235.5 183.8 L237.5 182.8 L239.8 182.8 L241.5 181.8 L246.2 180.8 L256.0 176.8 L266.8 170.5 L276.8 161.5 L284.5 151.2 L289.8 139.8 L291.8 127.8 L291.8 123.0 L290.8 119.5 L290.8 117.0 L286.8 106.2 L281.5 98.8 L273.0 90.8 L261.2 84.0 L253.2 81.0 L242.0 78.0 L137.8 66.0 L132.0 64.0 L127.2 61.0 L124.8 57.2 L124.8 53.5 L126.0 51.0 L129.2 48.0 L133.2 45.8 L134.5 45.8 L136.0 44.8 L138.0 44.8 L139.8 43.8 L279.5 43.5 L283.5 40.5 L317.5 7.8Z';
const S_GREEN = 'M121.0 137.2 L117.8 136.8 L55.8 137.0 L14.8 172.0 L3.0 182.8 L2.5 183.8 L5.8 184.2 L57.2 184.5 L59.0 184.0 L75.0 171.8 L81.0 168.0 L105.5 149.8Z';

export function SignalS({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 2 323 186"
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
      style={{ height: size, width: size * S_ASPECT, maxWidth: 'none' }}
      fill="none"
    >
      <path fill="currentColor" fillRule="evenodd" d={S_WHITE} />
      <path className="fill-[#00d447] dark:fill-[#1be77a]" fillRule="evenodd" d={S_GREEN} />
    </svg>
  );
}

/** The big, steady SIGNAL "S" with a light that sweeps through its silhouette
 *  and a green glow that slowly breathes behind it. */
export function SignalSHero({ height = 112, className = '' }: { height?: number; className?: string }) {
  const width = height * S_ASPECT;
  return (
    <span className={`relative inline-block ${className}`} style={{ height, width }}>
      <span aria-hidden="true" className="s-breathe pointer-events-none absolute -inset-x-[18%] -inset-y-[30%] rounded-full bg-[radial-gradient(closest-side,rgba(0,212,71,0.45),transparent)]" />
      <svg viewBox="0 2 323 186" aria-hidden="true" className="absolute inset-0 h-full w-full select-none text-white" fill="none">
        <path fill="currentColor" fillRule="evenodd" d={S_WHITE} />
        <path fill="#00d447" fillRule="evenodd" d={S_GREEN} />
      </svg>
      <span
        aria-hidden="true"
        className="signal-sweep-mask pointer-events-none absolute inset-0"
        style={{ WebkitMaskImage: 'url(/brand/signal-s.webp)', maskImage: 'url(/brand/signal-s.webp)' }}
      >
        <span className="signal-sweep-bar absolute" />
      </span>
    </span>
  );
}
