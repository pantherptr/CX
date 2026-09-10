/**
 * City Empire reputation tiers — pure client-side labeling over the
 * existing 0-100 `game_player_state.reputation` integer (no schema
 * change, same shape as empire.ts's RARITY_META).
 */
export interface ReputationTier {
  min: number;
  max: number;
  label: string;
}

export const REPUTATION_TIERS: ReputationTier[] = [
  { min: 0, max: 19, label: 'Unknown' },
  { min: 20, max: 39, label: 'Local Trader' },
  { min: 40, max: 59, label: 'Known Dealer' },
  { min: 60, max: 74, label: 'Trusted Name' },
  { min: 75, max: 89, label: 'City Reputation' },
  { min: 90, max: 100, label: 'City Icon' },
];

export function reputationLabel(reputation: number): string {
  const tier = REPUTATION_TIERS.find((t) => reputation >= t.min && reputation <= t.max);
  return tier?.label ?? 'Unknown';
}
