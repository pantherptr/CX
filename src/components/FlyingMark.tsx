/** A brand mark that hovers in place — never still, never quite repeating.
 *  Three motions with unrelated periods are layered (a slow bob, a drifting
 *  sway-and-tilt, a small wing-beat squash), so the mark reads as airborne
 *  and a little unsteady while staying exactly where it was put. A soft
 *  ground shadow breathes opposite to the bob. Under reduced motion it is
 *  simply an image. */
export function FlyingMark({
  src,
  alt = '',
  width,
  height,
  className = '',
  shadow = false,
  flutter = 1,
}: {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
  /** Draw a soft shadow under the mark (for a figure standing in the air). */
  shadow?: boolean;
  /** 1 = a calm hover; 2 = a faster, more nervous flutter. */
  flutter?: 1 | 2;
}) {
  const f = flutter === 2 ? 'fly-fast' : '';
  return (
    <span className={`relative inline-block ${className}`} aria-hidden={alt ? undefined : true}>
      <span className={`fly-bob block h-full ${f}`}>
        <span className={`fly-sway block h-full ${f}`}>
          <img src={src} alt={alt} width={width} height={height} draggable={false} className={`fly-beat block h-full w-auto select-none ${f}`} />
        </span>
      </span>
      {shadow && <span className="fly-shadow pointer-events-none absolute -bottom-2 left-1/2 h-2.5 w-[46%] rounded-[50%] bg-ink/25 blur-[5px]" />}
    </span>
  );
}
