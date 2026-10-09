import type { CSSProperties } from 'react';
import respectOn from '../assets/respect/respect-on.png';
import respectOff from '../assets/respect/respect-off.png';

// width / height of each artwork
const RATIO_ON = 313 / 240;
const RATIO_OFF = 324 / 240;

/** The Respect hand as a static glyph. `on` is the green chrome artwork; off
 *  is the outline drawn as a mask in `currentColor`, so it takes exactly the
 *  same grey/ink as the neighbouring Save / Share icons. `height` in px. */
export function RespectGlyph({
  height,
  on = false,
  className = '',
  style,
}: {
  height: number;
  on?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  if (on) {
    return (
      <img
        src={respectOn}
        alt=""
        draggable={false}
        className={className}
        style={{ height, width: height * RATIO_ON, maxWidth: 'none', ...style }}
      />
    );
  }
  const mask = `url(${respectOff}) center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      className={`inline-block ${className}`}
      style={{ height, width: height * RATIO_OFF, backgroundColor: 'currentColor', WebkitMask: mask, mask, ...style }}
    />
  );
}
