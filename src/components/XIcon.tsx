/**
 * X's logo: a tile of green glass (bright rim, soft top reflection) with a glossy white X standing in it,
 * the way a modern app icon is drawn. Pure CSS, scales from 24 to 200 px; `live` adds the online dot.
 * The X shape comes from the shared --x-mask (see the .x-orb rules in index.css).
 */
export function XIcon({ size = 40, live = false, className = '' }: { size?: number; live?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`x-icon relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size, ['--s' as string]: `${size}px` }}
    >
      <span className="x-icon__tile">
        <span className="x-icon__reflection" />
        <span className="x-icon__shade" />
        <span className="x-icon__x">
          <span className="x-icon__x-body" />
          <span className="x-icon__x-gloss" />
        </span>
      </span>
      {live && (
        <span className="absolute -bottom-px -right-px flex h-[26%] min-h-2 w-[26%] min-w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#009646]/55" />
          <span className="relative h-full w-full rounded-full border-2 border-white bg-[#009646]" />
        </span>
      )}
    </span>
  );
}
