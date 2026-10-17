/**
 * The read receipt under your own messages: the CX bat, empty (an outline) while the message has only been sent,
 * and it fills green the moment the other person reads it. Same silhouette as the logo bat (body + two wings).
 */
const BODY = '535,483 568,376 626,465 685,376 718,483 794,628 625,850 457,628';
const LEFT = '374,383 535,483 457,628 355,703 278,626 148,688';
const RIGHT = '880,383 718,483 794,628 894,703 972,626 1100,688';

export function ReadBat({ read, className = '' }: { read: boolean; className?: string }) {
  return (
    <svg
      viewBox="130 360 988 510"
      role="img"
      aria-label={read ? 'Read' : 'Sent'}
      className={`rbat-read ${read ? 'rbat-read--on' : ''} ${className}`}
      fill="none"
    >
      {[LEFT, RIGHT, BODY].map((pts) => (
        <polygon key={pts} points={pts} strokeWidth="46" strokeLinejoin="round" className="rbat-read-shape" />
      ))}
    </svg>
  );
}
