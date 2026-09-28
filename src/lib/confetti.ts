/** A brief, tasteful burst for the rare "something genuinely happened"
 *  moment — first publishing a SIGNAL post, not routine actions like a
 *  Like or a Follow (those already have their own small "pop" instead,
 *  see index.css's like-pop/respect-pop/save-pop). `canvas-confetti`
 *  loads on first fire only, never in the eager bundle. Ported from
 *  Magic UI's `confetti` (magicui.design), trimmed to the one call this
 *  app needs rather than the full ref/context API. */
export async function fireConfetti(origin?: { x: number; y: number }) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const { default: confetti } = await import('canvas-confetti');
  const colors = ['#00d447', '#00b93d', '#0a0d0b', '#ffffff'];
  void confetti({
    particleCount: 70,
    spread: 65,
    startVelocity: 38,
    origin: origin ?? { x: 0.5, y: 0.3 },
    colors,
    scalar: 0.9,
    zIndex: 200,
  });
}
