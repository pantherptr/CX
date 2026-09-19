/**
 * Host-chosen cancellation policies — the single description of the rules.
 * api/_lib/cancellationPolicy.ts is a deliberate copy of `refundFor` (the
 * serverless functions can't import from src/), so keep the two in sync:
 * the server's numbers are the ones that move money.
 */
export type CancellationPolicy = 'flexible' | 'moderate' | 'strict';

export const DEFAULT_POLICY: CancellationPolicy = 'moderate';

interface Tier {
  /** Applies while at least this many hours remain before pick-up. */
  minHours: number;
  percent: number;
}

const HOURS = { day: 24, fiveDays: 120, sevenDays: 168 } as const;

const TIERS: Record<CancellationPolicy, Tier[]> = {
  flexible: [{ minHours: HOURS.day, percent: 100 }],
  moderate: [
    { minHours: HOURS.fiveDays, percent: 100 },
    { minHours: HOURS.day, percent: 50 },
  ],
  strict: [{ minHours: HOURS.sevenDays, percent: 50 }],
};

export const POLICY_INFO: Record<
  CancellationPolicy,
  { label: string; tagline: string; rules: string[] }
> = {
  flexible: {
    label: 'Flexible',
    tagline: 'Full refund until 24 hours before pick-up.',
    rules: ['Cancel up to 24 hours before pick-up for a full refund.', 'Less than 24 hours before pick-up: no refund.'],
  },
  moderate: {
    label: 'Moderate',
    tagline: 'Full refund until 5 days before pick-up.',
    rules: [
      'Cancel at least 5 days before pick-up for a full refund.',
      'Between 5 days and 24 hours before pick-up: 50% refund.',
      'Less than 24 hours before pick-up: no refund.',
    ],
  },
  strict: {
    label: 'Strict',
    tagline: '50% refund until 7 days before pick-up.',
    rules: ['Cancel at least 7 days before pick-up for a 50% refund.', 'Less than 7 days before pick-up: no refund.'],
  },
};

export function isPolicy(v: unknown): v is CancellationPolicy {
  return v === 'flexible' || v === 'moderate' || v === 'strict';
}

export interface RefundResult {
  percent: number;
  amount: number;
  hoursUntilStart: number;
}

/** Pick-up is treated as local midnight of the start date (not UTC), the
 *  same boundary the previous 24h rule used. `initiatedBy` matters: when the
 *  host or CX cancels, the renter always gets everything back. `anytime`
 *  keeps the promise of older "Stay flexible" fares: full refund until the
 *  trip starts. */
export function refundFor(
  policy: CancellationPolicy,
  startDate: string,
  total: number,
  opts: { now?: number; initiatedBy?: 'renter' | 'host' | 'admin'; anytime?: boolean } = {},
): RefundResult {
  const now = opts.now ?? Date.now();
  const hoursUntilStart = (new Date(`${startDate}T00:00:00`).getTime() - now) / 3_600_000;
  let percent = 0;
  if (opts.initiatedBy && opts.initiatedBy !== 'renter') percent = 100;
  else if (opts.anytime) percent = hoursUntilStart >= 0 ? 100 : 0;
  else percent = TIERS[policy].find((t) => hoursUntilStart >= t.minHours)?.percent ?? 0;
  return { percent, amount: Math.round(total * percent) / 100, hoursUntilStart };
}
