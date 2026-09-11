/** Fixed ambient backdrop for the Empire game shell — a couple of soft
 *  radial gradients whose color temperature shifts with the active tab,
 *  so switching sections feels like moving through different parts of
 *  a world rather than swapping a page's content. Pure CSS (no canvas/
 *  WebGL, no new dependency), cross-fades via a plain `transition` on
 *  `background`, and never animates beyond that fade when the visitor
 *  has `prefers-reduced-motion` set. */

const NEUTRAL =
  'radial-gradient(80% 60% at 15% 0%, rgba(0,212,71,0.10), transparent 65%),' +
  'linear-gradient(180deg, #0a0d0b 0%, #0d120e 55%, #080b09 100%)';

const BACKDROP_BY_TAB: Record<string, string> = {
  // City — the brand's own bright green, urban/downtown glow top-left.
  city:
    'radial-gradient(70% 55% at 18% 8%, rgba(0,212,71,0.20), transparent 65%),' +
    'radial-gradient(50% 40% at 85% 90%, rgba(0,212,71,0.06), transparent 60%),' +
    'linear-gradient(180deg, #0a0d0b 0%, #0d120e 55%, #080b09 100%)',
  // Market / Garage — a warm amber showroom-floor wash.
  market:
    'radial-gradient(65% 50% at 82% 5%, rgba(255,176,64,0.14), transparent 62%),' +
    'radial-gradient(55% 45% at 10% 95%, rgba(0,212,71,0.05), transparent 60%),' +
    'linear-gradient(180deg, #0a0d0b 0%, #12100c 55%, #0a0806 100%)',
  collection:
    'radial-gradient(65% 50% at 82% 5%, rgba(255,176,64,0.14), transparent 62%),' +
    'radial-gradient(55% 45% at 10% 95%, rgba(0,212,71,0.05), transparent 60%),' +
    'linear-gradient(180deg, #0a0d0b 0%, #12100c 55%, #0a0806 100%)',
  // Flipping — a cooler blue-violet trading-floor energy.
  sales:
    'radial-gradient(65% 50% at 15% 0%, rgba(120,110,255,0.14), transparent 62%),' +
    'radial-gradient(55% 45% at 90% 100%, rgba(0,212,71,0.05), transparent 60%),' +
    'linear-gradient(180deg, #0a0d0b 0%, #0d0e14 55%, #08080c 100%)',
  // Finance / Rank / Leaderboard — a quieter graphite, low-key.
  business:
    'radial-gradient(60% 45% at 50% 0%, rgba(180,184,190,0.08), transparent 62%),' +
    'linear-gradient(180deg, #0a0d0b 0%, #0e0f10 55%, #080909 100%)',
  score:
    'radial-gradient(60% 45% at 50% 0%, rgba(180,184,190,0.08), transparent 62%),' +
    'linear-gradient(180deg, #0a0d0b 0%, #0e0f10 55%, #080909 100%)',
  leaderboard:
    'radial-gradient(60% 45% at 50% 0%, rgba(180,184,190,0.08), transparent 62%),' +
    'linear-gradient(180deg, #0a0d0b 0%, #0e0f10 55%, #080909 100%)',
};

export function EmpireWorldBackdrop({ activeTab }: { activeTab: string | null }) {
  const background = (activeTab && BACKDROP_BY_TAB[activeTab]) || NEUTRAL;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 transition-[background] duration-[900ms] ease-out"
      style={{ background }}
    >
      <div className="absolute inset-0 opacity-[0.04] [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:3px_3px]" />
    </div>
  );
}
