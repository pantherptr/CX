import { useEffect, useRef, useState } from 'react';

const CHARS = '!@#$%^&*()[]{}<>/?:;+=~';
const CYCLES_PER_LETTER = 2;
const SHUFFLE_MS = 45;

/** Scramble-into-place hover effect for Sign in / Create account / Concierge
 *  CTAs — each letter cycles through a few random characters before
 *  settling back into place, left to right. Spread the returned handlers
 *  onto the button/link itself and render `display` in place of the
 *  static label; pair with the `.btn-glint` CSS class (index.css) for the
 *  matching light sweep. Respects prefers-reduced-motion by simply never
 *  starting the scramble — the label just stays put. */
export function useScramble(text: string) {
  const [display, setDisplay] = useState(text);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setDisplay(text);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [text]);

  const stop = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setDisplay(text);
  };

  const start = () => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    stop();
    let pos = 0;
    timerRef.current = window.setInterval(() => {
      setDisplay(
        text
          .split('')
          .map((ch, i) => (ch === ' ' || pos / CYCLES_PER_LETTER > i ? ch : CHARS[Math.floor(Math.random() * CHARS.length)]))
          .join(''),
      );
      pos++;
      if (pos >= text.length * CYCLES_PER_LETTER) stop();
    }, SHUFFLE_MS);
  };

  return { display, onMouseEnter: start, onMouseLeave: stop, onFocus: start, onBlur: stop };
}
