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
import { VehicleArtwork } from './VehicleArtwork';
import { rarityGlowRadial, availableViews, paintSwatch, optionSwatch, VIEW_LABELS, type ViewKey } from './vehicleArt';

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

/** Groups the existing customization categories into the three
 *  sections a real configurator organizes around — no new categories
 *  invented, just a friendlier grouping of what's already there. */
const SECTIONS: { title: string; categories: string[] }[] = [
  { title: 'Exterior', categories: ['paint', 'wheels', 'brakes', 'body_kit', 'exhaust', 'lights', 'windows'] },
  { title: 'Interior', categories: ['interior'] },
  { title: 'Performance', categories: ['engine', 'suspension'] },
];

/** Which categories actually repaint the artwork right now (see
 *  vehicleArt.ts's header comment for why the rest don't yet) — shown
 *  in the panel either way since every option is real and priced, just
 *  labelled honestly. */
const PIXEL_ACCURATE_CATEGORIES = new Set(['paint', 'body_kit']);

export interface VehicleExperienceCar {
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

interface VehicleExperienceProps {
  mode: 'preview' | 'configure';
  car: VehicleExperienceCar;
  options: CustomizationOption[];
  repairCosts: RepairCost[];
  onClose: () => void;
  onBuy?: () => Promise<void> | void;
  buying?: boolean;
  cash?: number;
  onChanged?: () => void;
  onError?: (message: string) => void;
}

function estimateResale(car: VehicleExperienceCar) {
  const avgCondition = (car.conditionEngine + car.conditionBody + car.conditionInterior) / 300;
  const customizationValue = Object.entries(car.customization).length * 0.02;
  return Math.round(car.marketValue * avgCondition * (1 + customizationValue));
}

function customizationCostTotal(car: VehicleExperienceCar, options: CustomizationOption[]) {
  let total = 0;
  for (const [category, key] of Object.entries(car.customization)) {
    const opt = options.find((o) => o.category === category && o.key === key);
    if (opt) total += opt.cost;
  }
  return total;
}

/**
 * The full-screen vehicle configurator — Market preview and the
 * Collection configurator both open through this. Large hero artwork
 * with a view switcher (3/4 front / side / rear / interior, whichever
 * exist for this car) on the left, a professional option panel with
 * visual swatches and a live price/profit summary on the right —
 * modelled on the workflow of a premium manufacturer configurator,
 * built from original CX artwork rather than any real brand's assets.
 */
export function VehicleExperience({ mode, car, options, repairCosts, onClose, onBuy, buying, cash, onChanged, onError }: VehicleExperienceProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string>('Exterior');
  const [activeCategory, setActiveCategory] = useState<string>('paint');
  const [localError, setLocalError] = useState<string | null>(null);
  const meta = RARITY_META[car.rarity];

  const views = useMemo(() => availableViews(car.name), [car.name]);
  const [activeView, setActiveView] = useState<ViewKey>(views[0]);

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
    <div className="animate-page fixed inset-0 z-[100] flex flex-col bg-noir">
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

      <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:overflow-hidden lg:grid-cols-[1fr_340px]">
        {/* HERO — the vehicle, dominating the screen, with a view
            switcher beneath it when more than one angle exists. */}
        <div className="relative order-1 flex h-[45vh] shrink-0 flex-col overflow-hidden lg:h-auto">
          <div className="relative flex-1 overflow-hidden">
            <div className="pointer-events-none absolute inset-0" style={{ background: rarityGlowRadial(car.rarity) }} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
            <VehicleArtwork
              config={{ name: car.name, rarity: car.rarity, customization: car.customization }}
              interactive
              view={activeView}
              className="h-full w-full p-6 sm:p-10"
            />
          </div>
          {views.length > 1 && (
            <div className="flex shrink-0 justify-center gap-2 border-t border-white/10 bg-black/30 px-4 py-3">
              {views.map((v) => (
                <button
                  key={v}
                  onClick={() => setActiveView(v)}
                  className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                    activeView === v ? 'bg-white text-noir' : 'border border-white/15 text-on-noir-muted hover:border-white/30'
                  }`}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — professional configurator panel: expandable
            sections, visual swatches, live price/profit summary. */}
        <div className="order-2 flex flex-col border-white/10 lg:overflow-hidden lg:border-l">
          <div className="p-4 lg:flex-1 lg:overflow-y-auto lg:p-5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-white/10 p-3">
                <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Condition</p>
                <p className="mt-1 font-display text-lead font-semibold text-on-noir">{avgCondition}%</p>
              </div>
              <div className="rounded-xl border border-white/10 p-3">
                <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Mileage</p>
                <p className="mt-1 font-display text-lead font-semibold text-on-noir">{car.mileageKm.toLocaleString('en-GB')} km</p>
              </div>
            </div>

            {mode === 'configure' ? (
              <div className="mt-5">
                {SECTIONS.map((section) => {
                  const sectionOpen = openSection === section.title;
                  const sectionCategories = section.categories.filter((c) => options.some((o) => o.category === c));
                  if (sectionCategories.length === 0) return null;
                  return (
                    <div key={section.title} className="border-b border-white/10">
                      <button
                        onClick={() => {
                          setOpenSection(sectionOpen ? '' : section.title);
                          if (!sectionOpen) setActiveCategory(sectionCategories[0]);
                        }}
                        className="flex w-full items-center justify-between py-3 text-left text-detail font-bold uppercase tracking-wider text-on-noir"
                      >
                        {section.title}
                        <Icon name="chevronDown" size={15} className={`text-on-noir-muted transition-transform ${sectionOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {sectionOpen && (
                        <div className="pb-4">
                          <div className="flex flex-wrap gap-1.5">
                            {sectionCategories.map((cat) => (
                              <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                                  activeCategory === cat ? 'bg-white/15 text-on-noir' : 'text-on-noir-muted hover:bg-white/5'
                                }`}
                              >
                                {CATEGORY_LABELS[cat] ?? cat}
                                {!PIXEL_ACCURATE_CATEGORIES.has(cat) && <span className="ml-1 text-[9px] text-on-noir-muted/60">(stat)</span>}
                              </button>
                            ))}
                          </div>

                          <div className="mt-3 space-y-1.5">
                            {options
                              .filter((o) => o.category === activeCategory && sectionCategories.includes(activeCategory))
                              .map((o) => {
                                const active = car.customization[activeCategory] === o.key;
                                const swatch = activeCategory === 'paint' ? paintSwatch(o.key) : optionSwatch(activeCategory, o.key);
                                return (
                                  <button
                                    key={o.id}
                                    disabled={active || busy !== null}
                                    onClick={() => doCustomize(o.id)}
                                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-detail transition-colors disabled:opacity-60 ${
                                      active ? 'border-accent-bright/50 bg-accent-bright/10 text-on-noir' : 'border-white/10 text-on-noir-muted hover:border-white/25'
                                    }`}
                                  >
                                    {swatch && (
                                      <span
                                        className="h-6 w-6 shrink-0 rounded-full border border-white/25"
                                        style={{ background: swatch }}
                                      />
                                    )}
                                    <span className="flex-1">{active ? '✓ ' : ''}{o.label}</span>
                                    <span className="tabular-nums">{eur(o.cost)}</span>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="pt-4">
                  <p className="pb-2 text-[10px] font-bold uppercase tracking-wider text-on-noir-muted">Restore Condition</p>
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
              </div>
            ) : (
              <p className="mt-5 text-detail text-on-noir-muted">Buy this vehicle to unlock full customization.</p>
            )}
          </div>

          {/* Sticky live price / profit summary */}
          <div className="shrink-0 border-t border-white/10 bg-black/40 p-4 lg:p-5">
            <div className="space-y-1.5 text-detail">
              <div className="flex items-center justify-between text-on-noir-muted">
                <span>{mode === 'preview' ? 'Base Vehicle' : 'Purchase Price'}</span>
                <span className="tabular-nums text-on-noir">{eur(car.purchasePrice)}</span>
              </div>
              {mode === 'configure' && (
                <div className="flex items-center justify-between text-on-noir-muted">
                  <span>Options</span>
                  <span className="tabular-nums text-on-noir">+{eur(customizationSpend)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-white/10 pt-1.5 font-semibold">
                <span className="text-on-noir">Total Investment</span>
                <span className="tabular-nums text-on-noir">{eur(totalInvestment)}</span>
              </div>
              <div className="flex items-center justify-between text-on-noir-muted">
                <span>Market Value</span>
                <span className="tabular-nums text-on-noir">{eur(car.marketValue)}</span>
              </div>
              <div className="flex items-center justify-between text-on-noir-muted">
                <span>Est. Resale Value</span>
                <span className="tabular-nums text-on-noir">{eur(resale)}</span>
              </div>
            </div>

            <div className="mt-3 rounded-xl bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Potential Profit</p>
              <p className={`mt-0.5 font-display text-xl font-semibold ${potentialProfit >= 0 ? 'text-accent-bright' : 'text-danger'}`}>
                {potentialProfit >= 0 ? '+' : ''}{eur(potentialProfit)}
              </p>
            </div>

            {mode === 'preview' ? (
              <button
                disabled={buying || (cash !== undefined && cash < car.purchasePrice)}
                onClick={onBuy}
                className="btn btn-accent-bright btn-lg btn-block mt-4 disabled:opacity-40"
              >
                {buying ? 'Buying…' : cash !== undefined && cash < car.purchasePrice ? 'Not enough cash' : 'Buy This Vehicle'}
              </button>
            ) : (
              <button
                disabled={busy !== null}
                onClick={doSell}
                className="btn btn-lg btn-block mt-4 border border-white/20 text-on-noir hover:bg-white/10 disabled:opacity-40"
              >
                {busy === 'sell' ? 'Selling…' : 'Sell Vehicle'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
