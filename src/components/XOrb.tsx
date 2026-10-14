/**
 * X's living mark: the letter X as a soft, frosted shape filled with slow green light that keeps moving
 * (a fluid "AI is alive" orb, in the CX palette). `thinking` makes the light swirl faster. Pure CSS — see
 * the .x-orb rules in index.css; with "reduce motion" it simply stands still.
 */
export function XOrb({ size = 160, thinking = false, className = '' }: { size?: number; thinking?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`x-orb ${thinking ? 'x-orb--thinking' : ''} ${className}`}
      style={{ width: size, height: size, ['--s' as string]: `${size}px` }}
    >
      <span className="x-orb__glow" />
      <span className="x-orb__shape">
        <i className="x-orb__blob x-orb__blob--a" />
        <i className="x-orb__blob x-orb__blob--b" />
        <i className="x-orb__blob x-orb__blob--c" />
        <i className="x-orb__blob x-orb__blob--d" />
        <span className="x-orb__sheen" />
      </span>
    </span>
  );
}
