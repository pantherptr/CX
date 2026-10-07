import { useMemo } from 'react';
import { motion } from '../motionKit';
import { useLocale } from '../../lib/i18n';

/** The price filter as a histogram: one bar per price band, drawn from the
 *  real fleet, with the chosen band in black and the rest in grey. Two native
 *  range inputs sit on the baseline so keyboard, screen-reader and touch input
 *  keep working; dragging a thumb re-colours the bars live. */
export function PriceHistogram({
  prices,
  min,
  max,
  step,
  low,
  high,
  onLow,
  onHigh,
}: {
  prices: number[];
  min: number;
  max: number;
  step: number;
  low: number;
  high: number;
  onLow: (v: number) => void;
  onHigh: (v: number) => void;
}) {
  const { t } = useLocale();
  const BINS = 30;
  const counts = useMemo(() => {
    const c = new Array<number>(BINS).fill(0);
    for (const p of prices) {
      const i = Math.min(BINS - 1, Math.max(0, Math.floor(((p - min) / (max - min)) * BINS)));
      c[i] += 1;
    }
    return c;
  }, [prices, min, max]);
  const peak = Math.max(1, ...counts);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const lowOnTop = low > max - step * 5;

  return (
    <div>
      <div className="flex h-14 items-end gap-[3px]" aria-hidden="true">
        {counts.map((c, i) => {
          const from = min + (i * (max - min)) / BINS;
          const to = from + (max - min) / BINS;
          const inside = to > low && from < high;
          return (
            <motion.span
              key={i}
              className="flex-1 rounded-[3px]"
              initial={false}
              animate={{ height: `${c === 0 ? 6 : 14 + (c / peak) * 86}%`, backgroundColor: inside ? '#16161a' : '#dfe2e8' }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            />
          );
        })}
      </div>
      <div className="relative mt-1 h-7">
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-line-strong" />
        <div className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-ink" style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }} />
        <input
          type="range" min={min} max={max} step={step} value={low}
          onChange={(e) => onLow(+e.target.value)}
          className="range-dual range-ink absolute inset-0 w-full" style={{ zIndex: lowOnTop ? 3 : 1 }}
          aria-label={t('Minimum price per day')}
        />
        <input
          type="range" min={min} max={max} step={step} value={high}
          onChange={(e) => onHigh(+e.target.value)}
          className="range-dual range-ink absolute inset-0 w-full" style={{ zIndex: 2 }}
          aria-label={t('Maximum price per day')}
        />
      </div>
    </div>
  );
}
