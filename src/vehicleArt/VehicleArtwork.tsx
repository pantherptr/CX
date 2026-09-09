import { useRef, useState, type CSSProperties } from 'react';
import type { Rarity } from '../lib/data/empire';
import {
  artworkFor,
  paintFilterFor,
  bodyKitActive,
  RARITY_GLOW,
  rarityGlowRadial,
  rarityBackdrop,
  SPARKLE_RARITIES,
  type ViewKey,
} from './vehicleArt';

export interface VehicleArtConfig {
  name: string;
  rarity: Rarity;
  customization: Record<string, string>;
}

const SPARKLE_POSITIONS = [
  { top: '18%', left: '22%', delay: '0s' },
  { top: '30%', left: '78%', delay: '0.6s' },
  { top: '62%', left: '10%', delay: '1.1s' },
  { top: '55%', left: '88%', delay: '1.6s' },
];

interface VehicleArtworkProps {
  config: VehicleArtConfig;
  /** Card-scale renders skip the pointer-tracked tilt (too fiddly at
   *  small sizes); the full experience view gets the full treatment. */
  interactive?: boolean;
  className?: string;
  /** Which pre-rendered angle to show — defaults to the 3/4 front hero
   *  every vehicle has. Falls back to it automatically if the
   *  requested view doesn't exist for this car yet. */
  view?: ViewKey;
}

/**
 * Renders one vehicle as premium game-style artwork — a transparent
 * cutout floating over a rarity-tinted backdrop, with a soft contact
 * shadow, a pointer-tracked tilt (when `interactive`), and — for the
 * top two rarities — a sparkle overlay. Every surface that shows a
 * vehicle (Market, Collection, Showroom, the full-screen experience)
 * renders through this one component so a customized car looks
 * identical everywhere, and the whole fleet shares one visual system.
 */
export function VehicleArtwork({ config, interactive = false, className, view = 'front3q' }: VehicleArtworkProps) {
  const art = artworkFor(config.name);
  const useWide = view === 'front3q' && bodyKitActive(config.customization) && art.wide;
  const src = useWide ? art.wide! : (art.views[view] ?? art.views.front3q!);
  const filter = paintFilterFor(config.customization);
  const glow = RARITY_GLOW[config.rarity];
  const sparkle = SPARKLE_RARITIES.has(config.rarity);

  const frameRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -6, y: px * 8 });
  };
  const handleLeave = () => interactive && setTilt({ x: 0, y: 0 });

  // The interior view is a full cabin photo, not an isolated cutout —
  // it fills the frame edge-to-edge rather than floating with a ground
  // shadow the way every exterior view does.
  const isInterior = view === 'interior';

  const imgStyle: CSSProperties = {
    filter,
    transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${interactive ? 1.08 : 1.04})`,
  };

  return (
    <div
      ref={frameRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`vehicle-art-frame ${isInterior ? 'vehicle-art-frame--interior' : ''} ${className ?? ''}`}
      style={{ background: rarityBackdrop(config.rarity), boxShadow: glow }}
    >
      <div className="vehicle-art-glow" style={{ background: rarityGlowRadial(config.rarity) }} />
      {!isInterior && <div className="vehicle-art-shadow" />}
      <img
        src={src}
        alt={isInterior ? `${config.name} interior` : config.name}
        loading="lazy"
        className={`vehicle-art-image ${isInterior ? 'vehicle-art-image--interior' : ''}`}
        style={imgStyle}
      />
      {sparkle && (
        <div className="vehicle-art-sparkles">
          {SPARKLE_POSITIONS.map((p, i) => (
            <span key={i} className="vehicle-art-sparkle" style={{ top: p.top, left: p.left, animationDelay: p.delay }} />
          ))}
        </div>
      )}
    </div>
  );
}
