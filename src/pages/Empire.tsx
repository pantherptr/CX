import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { CarSilhouette } from '../components/empire/CarSilhouette';
import { PremiumPageLoader } from '../components/PremiumLoader';
import { useAuth } from '../lib/auth';
import { eur } from '../lib/format';
import {
  RARITY_META,
  usePlayerState,
  useBusinessTiers,
  useMarket,
  useMyInventory,
  useRepairCosts,
  useCustomizationOptions,
  buyMarketCar,
  repairCar,
  customizeCar,
  sellCar,
  upgradeBusiness,
  estimateNetWorth,
  type MarketListing,
  type InventoryCar,
  type Rarity,
} from '../lib/data/empire';
import {
  useCxScoreLevels,
  useCxScore,
  useCxScoreHistory,
  levelForScore,
  nextLevel,
  cxScoreEventLabel,
} from '../lib/data/cxScore';

type Tab = 'market' | 'collection' | 'business' | 'score';

function RarityBadge({ rarity }: { rarity: Rarity }) {
  const meta = RARITY_META[rarity];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
      style={{ color: meta.color, background: `${meta.color}1a`, boxShadow: meta.glow }}
    >
      {meta.label}
    </span>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-white/50">
        <span>{label}</span>
        <span className="tabular-nums text-white/70">{value}</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-accent-bright" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function ConditionBar({ label, value }: { label: string; value: number }) {
  const tone = value >= 80 ? 'var(--color-accent-bright)' : value >= 45 ? 'var(--color-star)' : 'var(--color-danger)';
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-muted">
        <span>{label}</span>
        <span className="tabular-nums" style={{ color: tone }}>{value}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: tone }} />
      </div>
    </div>
  );
}

function HeroStat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 backdrop-blur-md">
      <Icon name={icon} size={18} className="text-accent-bright" />
      <p className="mt-2 font-display text-xl font-semibold text-white tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-caption text-white/60">{label}</p>
    </div>
  );
}

function MarketCard({ listing, cash, onBuy }: { listing: MarketListing; cash: number; onBuy: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const meta = RARITY_META[listing.rarity];
  const canAfford = cash >= listing.price;
  const profit = listing.marketValue - listing.price;

  return (
    <div className="card overflow-hidden" style={{ boxShadow: meta.glow }}>
      <div className="relative bg-panel-2 px-4 pt-5">
        <RarityBadge rarity={listing.rarity} />
        <CarSilhouette silhouette={listing.silhouette} color={meta.color} className="mt-3 h-20 w-full" />
      </div>
      <div className="p-4">
        <p className="text-caption text-muted">{listing.brand} · {listing.category}</p>
        <p className="font-display text-lead font-semibold text-ink">{listing.name}</p>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
          <StatBar label="Top Speed" value={Math.round((listing.topSpeed / 420) * 100)} />
          <StatBar label="Accel" value={listing.acceleration} />
          <StatBar label="Handling" value={listing.handling} />
          <StatBar label="Braking" value={listing.braking} />
        </div>
        <div className="mt-3 flex items-center justify-between text-detail text-ink-soft">
          <span>Condition {listing.conditionPct}%</span>
          <span>{listing.mileageKm.toLocaleString('en-GB')} km</span>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="font-display text-xl font-semibold text-ink">{eur(listing.price)}</p>
            <p className={`text-caption ${profit > 0 ? 'text-accent-700' : 'text-muted'}`}>
              Market value {eur(listing.marketValue)}{profit > 0 ? ` · +${eur(profit)} potential` : ''}
            </p>
          </div>
        </div>
        <button
          disabled={!canAfford || busy}
          onClick={async () => {
            setBusy(true);
            await onBuy(listing.listingId);
            setBusy(false);
          }}
          className="btn btn-accent-bright btn-block mt-3 disabled:opacity-40"
        >
          {busy ? 'Buying…' : canAfford ? 'Buy' : 'Not enough cash'}
        </button>
      </div>
    </div>
  );
}

function InventoryCard({
  car,
  repairCosts,
  options,
  onChanged,
  onError,
}: {
  car: InventoryCar;
  repairCosts: { component: 'engine' | 'body' | 'interior'; label: string; cost: number }[];
  options: { id: string; category: string; key: string; label: string; cost: number }[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const meta = RARITY_META[car.rarity];
  const avgCondition = Math.round((car.conditionEngine + car.conditionBody + car.conditionInterior) / 3);
  const estValue = Math.round(car.marketValue * (avgCondition / 100) * (1 + 0.02 * Object.keys(car.customization).length));

  const doRepair = async (component: 'engine' | 'body' | 'interior') => {
    setBusy(component);
    const { error } = await repairCar(car.id, component);
    setBusy(null);
    if (error) onError(error);
    else onChanged();
  };

  const doCustomize = async (optionId: string) => {
    setBusy(optionId);
    const { error } = await customizeCar(car.id, optionId);
    setBusy(null);
    if (error) onError(error);
    else onChanged();
  };

  const doSell = async () => {
    if (!confirm(`Sell the ${car.name} for an estimated ${eur(estValue)}?`)) return;
    setBusy('sell');
    const { error } = await sellCar(car.id);
    setBusy(null);
    if (error) onError(error);
    else onChanged();
  };

  const categories = Array.from(new Set(options.map((o) => o.category)));

  return (
    <div className="card overflow-hidden" style={{ boxShadow: meta.glow }}>
      <div className="relative bg-panel-2 px-4 pt-5">
        <RarityBadge rarity={car.rarity} />
        <CarSilhouette silhouette={car.silhouette} color={meta.color} className="mt-3 h-20 w-full" />
      </div>
      <div className="p-4">
        <p className="text-caption text-muted">{car.brand} · {car.category}</p>
        <p className="font-display text-lead font-semibold text-ink">{car.name}</p>

        <div className="mt-3 space-y-2">
          <ConditionBar label="Engine" value={car.conditionEngine} />
          <ConditionBar label="Body" value={car.conditionBody} />
          <ConditionBar label="Interior" value={car.conditionInterior} />
        </div>

        {Object.keys(car.customization).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(car.customization).map(([cat, key]) => (
              <span key={cat} className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium capitalize text-ink-soft">
                {String(key).replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}

        <p className="mt-3 text-caption text-muted">Estimated value <span className="font-semibold text-ink">{eur(estValue)}</span></p>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {repairCosts.map((r) => {
            const value = r.component === 'engine' ? car.conditionEngine : r.component === 'body' ? car.conditionBody : car.conditionInterior;
            const full = value >= 100;
            return (
              <button
                key={r.component}
                disabled={full || busy !== null}
                onClick={() => doRepair(r.component)}
                title={`${r.label} — ${eur(r.cost)}`}
                className="btn btn-secondary btn-sm disabled:opacity-40"
              >
                {busy === r.component ? '…' : full ? 'OK' : `Fix ${r.component[0].toUpperCase()}`}
              </button>
            );
          })}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button onClick={() => setShowCustomize((v) => !v)} className="btn btn-secondary btn-sm">
            Customize
          </button>
          <button disabled={busy !== null} onClick={doSell} className="btn btn-sm border border-line text-ink hover:border-ink disabled:opacity-40">
            {busy === 'sell' ? 'Selling…' : 'Sell'}
          </button>
        </div>

        {showCustomize && (
          <div className="mt-3 max-h-56 space-y-3 overflow-y-auto rounded-xl border border-line p-3">
            {categories.map((cat) => (
              <div key={cat}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{cat.replace(/_/g, ' ')}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {options
                    .filter((o) => o.category === cat)
                    .map((o) => {
                      const active = car.customization[cat] === o.key;
                      return (
                        <button
                          key={o.id}
                          disabled={active || busy !== null}
                          onClick={() => doCustomize(o.id)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                            active ? 'border-accent bg-accent-050 text-accent-700' : 'border-line text-ink-soft hover:border-ink'
                          }`}
                        >
                          {active ? '✓ ' : ''}{o.label} · {eur(o.cost)}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Empire() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [tab, setTab] = useState<Tab>('market');

  const { state: playerState, refresh: refreshState } = usePlayerState();
  const { listings, refresh: refreshMarket } = useMarket();
  const { inventory, refresh: refreshInventory } = useMyInventory(userId);
  const repairCosts = useRepairCosts();
  const customizationOptions = useCustomizationOptions();
  const businessTiers = useBusinessTiers();

  const { score } = useCxScore(userId);
  const levels = useCxScoreLevels();
  const history = useCxScoreHistory(userId);

  const [marketMsg, setMarketMsg] = useState<string | null>(null);
  const [collectionMsg, setCollectionMsg] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);

  const ownedCars = useMemo(() => (inventory ?? []).filter((c) => c.status === 'owned'), [inventory]);
  const soldCars = useMemo(() => (inventory ?? []).filter((c) => c.status === 'sold'), [inventory]);
  const netWorth = estimateNetWorth(playerState, inventory);
  const totalProfit = (playerState?.totalRevenue ?? 0) - (playerState?.totalExpenses ?? 0);

  const currentTier = businessTiers?.find((t) => t.tier === playerState?.businessTier) ?? null;
  const nextTier = businessTiers?.find((t) => t.tier === (playerState?.businessTier ?? 1) + 1) ?? null;

  const currentLevel = levels ? levelForScore(score ?? 0, levels) : null;
  const upcomingLevel = levels ? nextLevel(currentLevel, levels) : null;
  const levelProgress = currentLevel && upcomingLevel
    ? Math.min(100, Math.round((((score ?? 0) - currentLevel.minScore) / (upcomingLevel.minScore - currentLevel.minScore)) * 100))
    : 100;

  const handleBuy = async (listingId: string) => {
    const { error } = await buyMarketCar(listingId);
    if (error) {
      setMarketMsg(error);
    } else {
      setMarketMsg('Purchased — added to your collection.');
      refreshState();
      refreshMarket();
      refreshInventory();
    }
    setTimeout(() => setMarketMsg(null), 3500);
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    const { error } = await upgradeBusiness();
    setUpgrading(false);
    setUpgradeMsg(error ?? 'Business upgraded!');
    if (!error) refreshState();
    setTimeout(() => setUpgradeMsg(null), 3500);
  };

  const onInventoryChanged = () => {
    refreshState();
    refreshInventory();
  };

  const onInventoryError = (message: string) => {
    setCollectionMsg(message);
    setTimeout(() => setCollectionMsg(null), 3500);
  };

  if (!session) {
    return (
      <div className="relative overflow-hidden bg-noir">
        <div className="container-page relative flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-accent-bright">
            <Icon name="cars" size={26} />
          </span>
          <h1 className="mt-6 font-display text-3xl font-semibold text-on-noir sm:text-5xl">CX Rent — Luxury Car Empire</h1>
          <p className="mt-3 max-w-md text-copy leading-relaxed text-on-noir-muted">
            Sign in to buy, restore, customize and sell luxury cars — and build your own empire.
          </p>
          <Link to="/login" state={{ from: { pathname: '/empire' } }} className="btn btn-accent-bright btn-lg mt-7">
            Sign In <Icon name="arrowRight" size={17} />
          </Link>
        </div>
      </div>
    );
  }

  if (!playerState || !listings || !inventory || !businessTiers || !levels) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <PremiumPageLoader size={90} />
      </div>
    );
  }

  return (
    <div>
      <section className="relative overflow-hidden bg-noir">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(70% 55% at 20% 10%, rgba(0,212,71,0.16), transparent 65%)' }}
        />
        <div className="container-page relative py-14 sm:py-16">
          <p className="eyebrow">CX Rent</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-on-noir sm:text-5xl">Luxury Car Empire</h1>
          <p className="mt-2 max-w-md text-copy text-on-noir-muted">{currentTier?.name ?? 'Small Garage'} · Reputation {playerState.reputation}/100</p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat icon="wallet" label="Cash" value={eur(playerState.cash)} />
            <HeroStat icon="trending" label="Net Worth" value={eur(netWorth)} />
            <HeroStat icon="trophy" label="CX Score" value={(score ?? 0).toLocaleString('en-GB')} />
            <HeroStat icon="cars" label="Cars Owned" value={String(ownedCars.length)} />
          </div>
        </div>
      </section>

      <div className="container-page py-8">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {([
            ['market', 'Car Market', 'tag'],
            ['collection', 'My Collection', 'cars'],
            ['business', 'Business', 'chart'],
            ['score', 'CX Score', 'trophy'],
          ] as [Tab, string, IconName][]).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-detail font-semibold transition-colors ${
                tab === key ? 'bg-ink text-white' : 'border border-line text-ink-soft hover:border-ink'
              }`}
            >
              <Icon name={icon} size={14} /> {label}
            </button>
          ))}
        </div>

        {tab === 'market' && (
          <div className="mt-8">
            {marketMsg && <p className="mb-4 text-detail font-medium text-accent-700">{marketMsg}</p>}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l) => (
                <MarketCard key={l.listingId} listing={l} cash={playerState.cash} onBuy={handleBuy} />
              ))}
            </div>
          </div>
        )}

        {tab === 'collection' && (
          <div className="mt-8">
            {collectionMsg && <p className="mb-4 text-detail font-medium text-danger">{collectionMsg}</p>}
            {ownedCars.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-body text-muted">Your collection is empty — buy your first car from the Market.</p>
                <button onClick={() => setTab('market')} className="btn btn-accent-bright btn-lg mt-5">
                  Browse Market
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {ownedCars.map((c) => (
                  <InventoryCard
                    key={c.id}
                    car={c}
                    repairCosts={repairCosts ?? []}
                    options={customizationOptions ?? []}
                    onChanged={onInventoryChanged}
                    onError={onInventoryError}
                  />
                ))}
              </div>
            )}

            {soldCars.length > 0 && (
              <div className="mt-12">
                <h3 className="font-display text-xl font-semibold text-ink">Sale History</h3>
                <div className="card mt-4 divide-y divide-line">
                  {soldCars.map((c) => {
                    const profit = (c.salePrice ?? 0) - c.purchasePrice;
                    return (
                      <div key={c.id} className="flex items-center justify-between p-4">
                        <div>
                          <p className="font-medium text-ink">{c.name}</p>
                          <p className="text-caption text-muted">Bought {eur(c.purchasePrice)} · Sold {eur(c.salePrice ?? 0)}</p>
                        </div>
                        <span className={`font-display text-lead font-semibold ${profit >= 0 ? 'text-accent-700' : 'text-danger'}`}>
                          {profit >= 0 ? '+' : ''}{eur(profit)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="card p-4">
                <p className="text-caption text-muted">Total Revenue</p>
                <p className="mt-1 font-display text-xl font-semibold text-ink">{eur(playerState.totalRevenue)}</p>
              </div>
              <div className="card p-4">
                <p className="text-caption text-muted">Total Expenses</p>
                <p className="mt-1 font-display text-xl font-semibold text-ink">{eur(playerState.totalExpenses)}</p>
              </div>
              <div className="card p-4 col-span-2 sm:col-span-2">
                <p className="text-caption text-muted">Total Profit</p>
                <p className={`mt-1 font-display text-xl font-semibold ${totalProfit >= 0 ? 'text-accent-700' : 'text-danger'}`}>
                  {totalProfit >= 0 ? '+' : ''}{eur(totalProfit)}
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === 'business' && (
          <div className="mt-8 max-w-2xl">
            {upgradeMsg && <p className="mb-4 text-detail font-medium text-accent-700">{upgradeMsg}</p>}
            <div className="card p-6">
              <p className="eyebrow">Current Tier</p>
              <h3 className="mt-1 font-display text-2xl font-semibold text-ink">{currentTier?.name}</h3>
              <p className="mt-1 text-body text-muted">{currentTier?.description}</p>
              <p className="mt-3 text-detail text-ink-soft">Showroom capacity: {currentTier?.displaySlots} cars</p>
            </div>

            {nextTier ? (
              <div className="card mt-4 p-6">
                <p className="eyebrow">Next Tier</p>
                <h3 className="mt-1 font-display text-xl font-semibold text-ink">{nextTier.name}</h3>
                <p className="mt-1 text-body text-muted">{nextTier.description}</p>
                <div className="mt-4 space-y-2 text-detail">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Cash required</span>
                    <span className={playerState.cash >= nextTier.cashRequired ? 'text-accent-700' : 'text-ink'}>
                      {eur(nextTier.cashRequired)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">CX Score required</span>
                    <span className={(score ?? 0) >= nextTier.cxScoreRequired ? 'text-accent-700' : 'text-ink'}>
                      {nextTier.cxScoreRequired.toLocaleString('en-GB')}
                    </span>
                  </div>
                </div>
                <button
                  disabled={upgrading || playerState.cash < nextTier.cashRequired || (score ?? 0) < nextTier.cxScoreRequired}
                  onClick={handleUpgrade}
                  className="btn btn-accent-bright btn-lg btn-block mt-5 disabled:opacity-40"
                >
                  {upgrading ? 'Upgrading…' : `Upgrade to ${nextTier.name}`}
                </button>
              </div>
            ) : (
              <p className="mt-4 text-body text-muted">You've reached the highest business tier — Global Car Empire.</p>
            )}
          </div>
        )}

        {tab === 'score' && (
          <div className="mt-8 max-w-2xl">
            <div className="card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">Current Level</p>
                  <h3 className="mt-1 font-display text-2xl font-semibold text-ink">{currentLevel?.label ?? 'New Member'}</h3>
                </div>
                <p className="font-display text-2xl font-semibold text-ink tabular-nums">{(score ?? 0).toLocaleString('en-GB')}</p>
              </div>

              {upcomingLevel && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-caption text-muted">
                    <span>Progress to {upcomingLevel.label}</span>
                    <span>{levelProgress}%</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-panel-2">
                    <div className="h-full rounded-full bg-accent-bright transition-all" style={{ width: `${levelProgress}%` }} />
                  </div>
                </div>
              )}

              {currentLevel && currentLevel.benefitPercentage > 0 ? (
                <div className="mt-5 rounded-xl bg-accent-050 p-4">
                  <p className="text-detail font-semibold text-accent-700">
                    Active Benefit: {currentLevel.benefitPercentage}% off every booking, up to {eur(currentLevel.maxDiscountEur)}
                  </p>
                </div>
              ) : (
                <div className="mt-5 rounded-xl bg-panel p-4">
                  <p className="text-detail text-muted">Reach 3,000 CX Score to unlock your first CX Rent benefit — 5% off, up to €50.</p>
                </div>
              )}
            </div>

            <div className="card mt-4 p-6">
              <p className="font-display text-lead font-semibold text-ink">How to earn CX Score</p>
              <ul className="mt-3 space-y-1.5 text-detail text-ink-soft">
                <li>+100 — Completed rental</li>
                <li>+150 — 3+ day rental bonus</li>
                <li>+300 — 7+ day rental bonus</li>
                <li>+200 — Premium vehicle rental</li>
                <li>+1,000 / +3,000 / +10,000 — Rare, Legendary or Mythic vehicle acquired</li>
                <li>Up to +500 — Profitable car sale</li>
                <li>+5,000–20,000 — Business milestone reached</li>
              </ul>
            </div>

            <div className="mt-8">
              <h3 className="font-display text-xl font-semibold text-ink">Score History</h3>
              <div className="card mt-4 divide-y divide-line">
                {(history ?? []).length === 0 ? (
                  <p className="p-4 text-detail text-muted">No CX Score activity yet.</p>
                ) : (
                  (history ?? []).map((e) => (
                    <div key={e.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium text-ink">{cxScoreEventLabel(e.eventType)}</p>
                        <p className="text-caption text-muted">{new Date(e.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                      <span className="font-display font-semibold text-accent-700">+{e.points}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
