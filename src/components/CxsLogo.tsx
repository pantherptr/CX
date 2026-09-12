/** The `cxs.png` "S" mark — SIGNAL's navigation identity, used only in
 *  the two navigation contexts that share it: the bottom-nav SIGNAL tab
 *  (BottomNav.tsx) and the SIGNAL side Quick Control (SignalQuickControl.tsx).
 *  Distinct from `SignalLogo` (the older icon crop, still used for
 *  Signal's sign-in gate and empty-feed state) and `SignalBarLogo` (the
 *  header wordmark) — a different asset for a different job, not a
 *  variant of either.
 *
 *  The source file has real transparent padding around the mark, and
 *  that padding isn't symmetric (107px left vs 191px right, of a 1536px
 *  canvas) — rendering the full canvas via plain `object-contain` would
 *  make the mark itself sit visibly off-center in its own box. Rather
 *  than edit the PNG (never touched — see the file itself), `BBOX` below
 *  is the mark's real visible bounds, and both the `<img>` and its glint
 *  mask are scaled/positioned to crop to exactly that box — a CSS-only
 *  crop, the same non-destructive technique a sprite sheet uses.
 *
 *  Carries its own "live" effect (`.cxs-glint-a/b` in index.css) — two
 *  independent, non-aligning long-quiet/brief-pass cycles, not the
 *  bottom nav's old continuous `.signal-sweep-bar` loop and not a copy
 *  of the header wordmark's own glint (different asset, tuned fresh). */
const FULL_W = 1536;
const FULL_H = 1024;
const BBOX = { left: 107, top: 20, width: 1238, height: 987 };

export function CxsLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  const scale = size / BBOX.height;
  const imgW = FULL_W * scale;
  const imgH = FULL_H * scale;
  const imgLeft = -BBOX.left * scale;
  const imgTop = -BBOX.top * scale;
  const width = BBOX.width * scale;
  const maskSize = `${imgW}px ${imgH}px`;
  const maskPosition = `${imgLeft}px ${imgTop}px`;

  return (
    <span className={`relative inline-block shrink-0 overflow-hidden ${className}`} style={{ height: size, width }}>
      <img
        src="/cxs.png"
        alt=""
        className="absolute"
        style={{ left: imgLeft, top: imgTop, width: imgW, height: imgH, maxWidth: 'none' }}
      />
      <span
        aria-hidden="true"
        className="cxs-glint-mask pointer-events-none absolute inset-0"
        style={{
          WebkitMaskImage: 'url(/cxs.png)',
          maskImage: 'url(/cxs.png)',
          WebkitMaskSize: maskSize,
          maskSize,
          WebkitMaskPosition: maskPosition,
          maskPosition,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      >
        <span className="cxs-glint cxs-glint-a absolute inset-0" />
        <span className="cxs-glint cxs-glint-b absolute inset-0" />
      </span>
    </span>
  );
}
