import { useEffect } from 'react';
import { Icon } from '../components/Icon';
import { eur } from '../lib/format';
import { RARITY_META, type Rarity } from '../lib/data/empire';
import { BUYER_TYPE_LABELS, type BuyerType } from '../lib/data/carMarket';
import { VehicleArtwork } from './VehicleArtwork';

export interface SoldMomentData {
  name: string;
  customName: string | null;
  rarity: Rarity;
  customization: Record<string, string>;
  buyerName: string;
  buyerType: BuyerType | null;
  salePrice: number;
  profit: number;
}

/**
 * The premium "your car has sold" moment — a dedicated full-screen
 * overlay rather than the corner toast (useApp().toast has no room for
 * vehicle art plus a stamp graphic). Auto-dismisses after ~3.5s, within
 * the 2-5s window asked for, plus a manual close. Driven by a queue in
 * Empire.tsx so multiple sales resolved in the same sync show one at a
 * time rather than stacking.
 */
export function SoldMoment({ data, onDone }: { data: SoldMomentData; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  const meta = RARITY_META[data.rarity];

  return (
    <div className="animate-page fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onDone}>
      <div className="relative w-full max-w-md px-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-caption font-bold uppercase tracking-[0.2em] text-accent-bright">Your Car Has Sold</p>

        <div className="relative mt-4 aspect-[4/3] overflow-visible">
          <VehicleArtwork config={{ name: data.name, rarity: data.rarity, customization: data.customization }} className="h-full w-full" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span
              className="rounded-md border-4 border-danger px-6 py-1.5 text-2xl font-black uppercase tracking-widest text-danger"
              style={{ transform: 'rotate(-10deg)', textShadow: '0 0 12px rgba(192,64,47,0.5)' }}
            >
              Sold
            </span>
          </div>
        </div>

        <div className="mt-5 text-center">
          <p className="text-caption uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</p>
          <h2 className="font-display text-xl font-semibold text-on-noir">
            {data.name}{data.customName ? ` — "${data.customName}"` : ''}
          </h2>
          <p className="mt-1 text-detail text-on-noir-muted">
            Buyer: {data.buyerName}{data.buyerType ? ` · ${BUYER_TYPE_LABELS[data.buyerType]}` : ''}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Sale Price</p>
            <p className="font-display text-2xl font-semibold text-on-noir tabular-nums">{eur(data.salePrice)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Profit</p>
            <p className={`font-display text-2xl font-semibold tabular-nums ${data.profit >= 0 ? 'text-accent-bright' : 'text-danger'}`}>
              {data.profit >= 0 ? '+' : ''}{eur(data.profit)}
            </p>
          </div>
        </div>

        <button onClick={onDone} className="mx-auto mt-6 flex items-center gap-1.5 text-detail text-on-noir-muted hover:text-on-noir">
          Dismiss <Icon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}
