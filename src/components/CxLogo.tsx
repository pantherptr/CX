import { useId } from 'react';

/**
 * The CX mark, drawn in code (so it stays sharp at any size and the C follows the theme): a heavy C, and an X
 * made of two strokes — the down stroke and a KEY, whose blade tapers into a shaft with a slot, teeth and a bow.
 * An even gap is cut around the key so the two strokes read as one X. The C is `currentColor`.
 *
 * Geometry is in the original artwork's pixel space (viewBox 80 55 1665 650, cropped tight so the mark fills its height).
 */
export function CxLogo({ className = '', title = 'CX' }: { className?: string; title?: string }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${n}-${uid}`;
  return (
    <svg viewBox="80 55 1665 650" role="img" aria-label={title} className={className} fill="none">
      <defs>
        <linearGradient id={id('down')} gradientUnits="userSpaceOnUse" x1="720" y1="200" x2="1500" y2="700">
          <stop offset="0" stopColor="#5dffa6" />
          <stop offset="0.55" stopColor="#14e873" />
          <stop offset="1" stopColor="#00bf49" />
        </linearGradient>
        <linearGradient id={id('key')} gradientUnits="userSpaceOnUse" x1="-60" y1="0" x2="1000" y2="0">
          <stop offset="0" stopColor="#0fd86a" />
          <stop offset="0.6" stopColor="#2cf08a" />
          <stop offset="1" stopColor="#7dffb8" />
        </linearGradient>
        <clipPath id={id('floor')}><rect x="0" y="0" width="2000" height="692" /></clipPath>
        <g id={id('shape')}>
          <rect x="-200" y="-56" width="1100" height="112" />
          <path d="M552 56H612V92H552Z M640 56H700V108H640Z M728 56H788V124H728Z" />
          <circle cx="905" cy="-8" r="120" />
        </g>
        <mask id={id('cut')} maskUnits="userSpaceOnUse" x="0" y="0" width="2000" height="900">
          <rect width="2000" height="900" fill="#fff" />
          <g transform="translate(815 640) rotate(-29.1)" fill="#000" stroke="#000" strokeWidth="44" strokeLinejoin="round">
            <use href={`#${id('shape')}`} />
          </g>
        </mask>
        <mask id={id('slot')} maskUnits="userSpaceOnUse" x="-400" y="-400" width="1800" height="800">
          <rect x="-400" y="-400" width="1800" height="800" fill="#fff" />
          <rect x="140" y="-13" width="520" height="26" rx="13" fill="#000" />
          <circle cx="905" cy="-8" r="58" fill="#000" />
        </mask>
      </defs>

      <g mask={`url(#${id('cut')})`}>
        <path
          fill="currentColor"
          d="M385 198H664Q690 198 705 214L815 330H362Q243 334 243 445Q243 556 362 558H815L705 676Q690 692 664 692H385Q95 692 95 445Q95 198 385 198Z"
        />
        <path fill={`url(#${id('down')})`} stroke={`url(#${id('down')})`} strokeWidth="22" strokeLinejoin="round" d="M737 209H942L1478 681H1274Z" />
      </g>
      <g clipPath={`url(#${id('floor')})`}>
        <g transform="translate(815 640) rotate(-29.1)">
          <g mask={`url(#${id('slot')})`} fill={`url(#${id('key')})`}>
            <use href={`#${id('shape')}`} />
          </g>
        </g>
      </g>
    </svg>
  );
}
