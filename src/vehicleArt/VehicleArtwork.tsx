import { useRef, useState, type CSSProperties } from 'react';
import type { Rarity } from '../lib/data/empire';
import { artworkFor, paintFilterFor, bodyKitActive, RARITY_GLOW, rarityGlowRadial, SPARKLE_RARITIES } from './vehicleArt';

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
   *  small sizes) and use a lighter shadow; the full experience view
   *  gets the full treatment. */
  interactive?: boolean;
  className?: string;
}

/**
 * Renders one vehicle as a depth-layered photograph rather than a flat
 * `<img>` — a soft rarity-tinted glow behind it, an ambient contact
 * shadow, and (when `interactive`) a subtle pointer-tracked tilt so it
 * reads as sitting IN the card, not printed on it. Every surface that
 * shows a vehicle (Market, Collection, Showroom, the full-screen
 * configurator) renders through this one component so a customized car
 * looks identical everywhere.
 */
export function VehicleArtwork({ config, interactive = false, className }: VehicleArtworkProps) {
  const art = artworkFor(config.name);
  const wide = bodyKitActive(config.customization) && art.wide ? art.wide : null;
  const src = wide ?? art.base;
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

  const imgStyle: CSSProperties = {
    filter,
    transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${interactive ? 1.02 : 1})`,
  };

  return (
    <div
      ref={frameRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`vehicle-art-frame ${className ?? ''}`}
      style={{ boxShadow: glow }}
    >
      <div className="vehicle-art-glow" style={{ background: rarityGlowRadial(config.rarity) }} />
      <img
        src={src}
        alt={config.name}
        loading="lazy"
        className="vehicle-art-image"
        style={imgStyle}
      />
      <div className="vehicle-art-shadow" />
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
