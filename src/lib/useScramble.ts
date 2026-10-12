/** Label helper for the Sign in / Create account / Concierge CTAs. It used to cycle each letter through
 *  random symbols on hover; that is gone — the label stays exactly as written. The API is kept so every
 *  call site keeps working: spread the returned handlers onto the button and render `display`. The hover
 *  feedback is the light sweep from the `.btn-glint` CSS class (index.css). */
export function useScramble(text: string) {
  return { display: text, onMouseEnter: undefined, onMouseLeave: undefined, onFocus: undefined, onBlur: undefined };
}
