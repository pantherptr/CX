/**
 * Server copy of src/lib/cancellationPolicy.ts's refund rules (serverless
 * functions can't import from src/). Keep the two in sync — this one moves
 * the money.
 */
export type CancellationPolicy = 'flexible' | 'moderate' | 'strict';

interface Tier {
  minHours: number;
  percent: number;
}

const TIERS: Record<CancellationPolicy, Tier[]> = {
  flexible: [{ minHours: 24, percent: 100 }],
  moderate: [
    { minHours: 120, percent: 100 },
    { minHours: 24, percent: 50 },
  ],
  strict: [{ minHours: 168, percent: 50 }],
};

export function isPolicy(v: unknown): v is CancellationPolicy {
  return v === 'flexible' || v === 'moderate' || v === 'strict';
}

export function refundFor(
  policy: CancellationPolicy,
  startDate: string,
  total: number,
  opts: { now?: number; initiatedBy?: 'renter' | 'host' | 'admin'; anytime?: boolean } = {},
): { percent: number; amount: number; hoursUntilStart: number } {
  const now = opts.now ?? Date.now();
  const hoursUntilStart = (new Date(`${startDate}T00:00:00`).getTime() - now) / 3_600_000;
  let percent = 0;
  if (opts.initiatedBy && opts.initiatedBy !== 'renter') percent = 100;
  else if (opts.anytime) percent = hoursUntilStart >= 0 ? 100 : 0;
  else percent = TIERS[policy].find((t) => hoursUntilStart >= t.minHours)?.percent ?? 0;
  return { percent, amount: Math.round(total * percent) / 100, hoursUntilStart };
}
