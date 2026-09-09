import { Component, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Showroom } from './Showroom';
import { CxCarModel } from './CxCarModel';
import { useInView } from './useInView';
import type { VehicleConfig } from './vehicleVisuals';

class ViewportErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted">
          <Icon name="car" size={22} />
          <span className="text-caption">3D preview unavailable</span>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Compact, auto-rotating showroom used for every vehicle card in the
 *  Market and Collection grids. Mounts its Canvas/GLTF only once the
 * card is actually scrolled into view (see useInView) — with 8+ cards
 *  per grid, rendering all of them up front would mean 8+ live WebGL
 *  contexts and GLTF loads for vehicles the player hasn't scrolled to
 *  yet. */
export function VehicleViewport({ config, className }: { config: VehicleConfig; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div ref={ref} className={className}>
      {inView ? (
        <ViewportErrorBoundary>
          <Showroom rarity={config.rarity} quality="compact" autoRotate interactive={false}>
            <CxCarModel config={config} />
          </Showroom>
        </ViewportErrorBoundary>
      ) : (
        <div className="h-full w-full animate-pulse bg-panel-2" />
      )}
    </div>
  );
}
