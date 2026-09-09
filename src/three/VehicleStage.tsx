import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { eur } from '../lib/format';
import {
  RARITY_META,
  repairCar,
  customizeCar,
  sellCar,
  type Rarity,
  type CustomizationOption,
  type RepairCost,
} from '../lib/data/empire';
import { Showroom } from './Showroom';
import { CxCarModel } from './CxCarModel';

const CATEGORY_LABELS: Record<string, string> = {
  paint: 'Paint',
  wheels: 'Wheels',
  windows: 'Windows',
  brakes: 'Brakes',
  exhaust: 'Exhaust',
  body_kit: 'Body Kit',
  interior: 'Interior',
  lights: 'Lights',
  suspension: 'Suspension',
  engine: 'Engine',
};

/** Suspension/engine are real gameplay performance upgrades with no
 *  corresponding mesh on the base sculpt (they tune stats, not
 *  silhouette) — shown in the same list so the spend is still visible,
 *  just without implying a visual change that isn't real. */
const VISUAL_CATEGORIES = new Set(['paint', 'wheels', 'windows', 'brakes', 'exhaust', 'body_kit', 'interior', 'lights']);

export interface VehicleStageCar {
  id: string; // inventoryId (configure) or listingId (preview)
  name: string;
  brand: string;
  category: string;
  rarity: Rarity;
  silhouette: string;
  conditionEngine: number;
  conditionBody: number;
  conditionInterior: number;
  mileageKm: number;
  customization: Record<string, string>;
  purchasePrice: number;
  marketValue: number;
}

interface VehicleStageProps {
  mode: 'preview' | 'configure';
  car: VehicleStageCar;
  options: CustomizationOption[];
  repairCosts: RepairCost[];
  onClose: () => void;
  onBuy?: () => Promise<void> | void;
  buying?: boolean;
  cash?: number;
  onChanged?: () => void;
  onError?: (message: string) => void;
}

function estimateResale(car: VehicleStageCar) {
  const avgCondition = (car.conditionEngine + car.conditionBody + car.conditionInterior) / 300;
  const customizationValue = Object.entries(car.customization).length * 0.02;
  return Math.round(car.marketValue * avgCondition * (1 + customizationValue));
}

function customizationCostTotal(car: VehicleStageCar, options: CustomizationOption[]) {
  let total = 0;
  for (const [category, key] of Object.entries(car.customization)) {
    const opt = options.find((o) => o.category === category && o.key === key);
    if (opt) total += opt.cost;
  }
  return total;
}

export function VehicleStage({ mode, car, options, repairCosts, onClose, onBuy, buying, cash, onChanged, onError }: VehicleStageProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('paint');
  const [localError, setLocalError] = useState<string | null>(null);
  const meta = RARITY_META[car.rarity];

  const reportError = (message: string) => {
    setLocalError(message);
    onError?.(message);
    setTimeout(() => setLocalError(null), 3500);
  };

  const avgCondition = Math.round((car.conditionEngine + car.conditionBody + car.conditionInterior) / 3);
  const resale = useMemo(() => estimateResale(car), [car]);
  const customizationSpend = useMemo(() => customizationCostTotal(car, options), [car, options]);
  const totalInvestment = car.purchasePrice + (mode === 'configure' ? customizationSpend : 0);
  const potentialProfit = resale - totalInvestment;

  const categories = Array.from(new Set(options.map((o) => o.category)));

  const doRepair = async (component: 'engine' | 'body' | 'interior') => {
    setBusy(component);
    const { error } = await repairCar(car.id, component);
    setBusy(null);
    if (error) reportError(error);
    else onChanged?.();
  };

  const doCustomize = async (optionId: string) => {
    setBusy(optionId);
    const { error } = await customizeCar(car.id, optionId);
    setBusy(null);
    if (error) reportError(error);
    else onChanged?.();
  };

  const doSell = async () => {
    if (!confirm(`Sell the ${car.name} for an estimated ${eur(resale)}?`)) return;
    setBusy('sell');
    const { error } = await sellCar(car.id);
    setBusy(null);
    if (error) reportError(error);
    else {
      onChanged?.();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-noir">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
        <div>
          <p className="text-caption uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</p>
          <h2 className="font-display text-lead font-semibold text-on-noir sm:text-2xl">{car.brand} {car.name}</h2>
        </div>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-on-noir hover:bg-white/10">
          <Icon name="x" size={18} />
        </button>
      </div>

      {localError && (
        <div className="border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-detail font-medium text-danger sm:px-6">
          {localError}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[220px_1fr_300px]">
        {/* LEFT — customization categories (configure mode only) */}
        {mode === 'configure' ? (
          <div className="order-2 overflow-y-auto border-white/10 p-3 lg:order-1 lg:border-r lg:p-4">
            <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-on-noir-muted">Customize</p>
            <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 rounded-xl px-3 py-2.5 text-left text-detail font-semibold transition-colors ${
                    activeCategory === cat ? 'bg-white/15 text-on-noir' : 'text-on-noir-muted hover:bg-white/5'
                  }`}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                  {!VISUAL_CATEGORIES.has(cat) && <span className="ml-1.5 text-[10px] text-on-noir-muted/60">(stat)</span>}
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-1.5">
              {options
                .filter((o) => o.category === activeCategory)
                .map((o) => {
                  const active = car.customization[activeCategory] === o.key;
                  return (
                    <button
                      key={o.id}
                      disabled={active || busy !== null}
                      onClick={() => doCustomize(o.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-detail transition-colors disabled:opacity-60 ${
                        active ? 'border-accent-bright/50 bg-accent-bright/10 text-on-noir' : 'border-white/10 text-on-noir-muted hover:border-white/25'
                      }`}
                    >
                      <span>{active ? '✓ ' : ''}{o.label}</span>
                      <span className="tabular-nums">{eur(o.cost)}</span>
                    </button>
                  );
                })}
            </div>

            <p className="mt-6 px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-on-noir-muted">Restore Condition</p>
            <div className="space-y-1.5">
              {repairCosts.map((r) => {
                const value = r.component === 'engine' ? car.conditionEngine : r.component === 'body' ? car.conditionBody : car.conditionInterior;
                const full = value >= 100;
                return (
                  <button
                    key={r.component}
                    disabled={full || busy !== null}
                    onClick={() => doRepair(r.component)}
                    className="flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2.5 text-left text-detail text-on-noir-muted transition-colors hover:border-white/25 disabled:opacity-40"
                  >
                    <span>{r.label} ({value}%)</span>
                    <span className="tabular-nums">{full ? 'OK' : eur(r.cost)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="order-2 hidden lg:order-1 lg:block" />
        )}

        {/* CENTER — the actual 3D vehicle */}
        <div className="order-1 min-h-[45vh] lg:order-2">
          <Showroom rarity={car.rarity} quality="full" autoRotate={false} interactive>
            <CxCarModel
              config={{
                silhouette: car.silhouette,
                rarity: car.rarity,
                conditionAvg: avgCondition,
                customization: car.customization,
              }}
            />
          </Showroom>
        </div>

        {/* RIGHT — vehicle info + financial impact */}
        <div className="order-3 overflow-y-auto border-white/10 p-4 lg:border-l lg:p-5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Condition</p>
              <p className="mt-1 font-display text-lead font-semibold text-on-noir">{avgCondition}%</p>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Mileage</p>
              <p className="mt-1 font-display text-lead font-semibold text-on-noir">{car.mileageKm.toLocaleString('en-GB')} km</p>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">{mode === 'preview' ? 'Price' : 'Purchase Price'}</p>
              <p className="mt-1 font-display text-lead font-semibold text-on-noir">{eur(car.purchasePrice)}</p>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Market Value</p>
              <p className="mt-1 font-display text-lead font-semibold text-on-noir">{eur(car.marketValue)}</p>
            </div>
            {mode === 'configure' && (
              <div className="rounded-xl border border-white/10 p-3">
                <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Customization Cost</p>
                <p className="mt-1 font-display text-lead font-semibold text-on-noir">{eur(customizationSpend)}</p>
              </div>
            )}
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Est. Resale Value</p>
              <p className="mt-1 font-display text-lead font-semibold text-on-noir">{eur(resale)}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Potential Profit</p>
            <p className={`mt-1 font-display text-2xl font-semibold ${potentialProfit >= 0 ? 'text-accent-bright' : 'text-danger'}`}>
              {potentialProfit >= 0 ? '+' : ''}{eur(potentialProfit)}
            </p>
          </div>

          {mode === 'preview' ? (
            <button
              disabled={buying || (cash !== undefined && cash < car.purchasePrice)}
              onClick={onBuy}
              className="btn btn-accent-bright btn-lg btn-block mt-6 disabled:opacity-40"
            >
              {buying ? 'Buying…' : cash !== undefined && cash < car.purchasePrice ? 'Not enough cash' : 'Buy This Vehicle'}
            </button>
          ) : (
            <button
              disabled={busy !== null}
              onClick={doSell}
              className="btn btn-lg btn-block mt-6 border border-white/20 text-on-noir hover:bg-white/10 disabled:opacity-40"
            >
              {busy === 'sell' ? 'Selling…' : 'Sell Vehicle'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
