/** The investigator on a case inside a chat: the CX bat in a dark round tag, not a portrait. The name next to it says
 *  who is on the case. */
const BODY = '535,483 568,376 626,465 685,376 718,483 794,628 625,850 457,628';
const LEFT = '374,383 535,483 457,628 355,703 278,626 148,688';
const RIGHT = '880,383 718,483 794,628 894,703 972,626 1100,688';

export function InvestigatorBadge({ size = 40, className = '' }: { caseId?: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center rounded-full bg-[#0b0f0c] ${className}`}
      style={{ width: size, height: size, boxShadow: `0 0 0 ${Math.max(1.5, size / 30)}px rgba(0,212,71,0.55)` }}
    >
      <svg viewBox="130 360 988 510" style={{ width: size * 0.62, height: 'auto' }} fill="none">
        {[LEFT, RIGHT, BODY].map((pts) => (
          <polygon key={pts} points={pts} fill="#12d85a" stroke="#5af59a" strokeWidth="18" strokeLinejoin="round" />
        ))}
        <polyline points="626,465 625,850" stroke="#7dfab0" strokeWidth="8" opacity="0.8" />
      </svg>
    </span>
  );
}
