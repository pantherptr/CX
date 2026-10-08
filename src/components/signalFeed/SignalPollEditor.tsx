import { Icon } from '../Icon';

export const POLL_MAX_OPTIONS = 4;

/** The poll builder inside a composer: 2–4 options (the post's own text is the
 *  question). Controlled — the composer keeps the list and publishes it with
 *  the post. */
export function SignalPollEditor({
  options,
  onChange,
  onRemove,
}: {
  options: string[];
  onChange: (next: string[]) => void;
  onRemove: () => void;
}) {
  const set = (i: number, v: string) => onChange(options.map((o, j) => (j === i ? v.slice(0, 60) : o)));
  return (
    <div className="mt-3 rounded-2xl border border-line bg-panel/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-detail font-semibold text-ink">
          <Icon name="chart" size={15} /> Poll
        </span>
        <button type="button" onClick={onRemove} aria-label="Remove poll" className="grid h-8 w-8 place-items-center rounded-full text-faint hover:bg-panel hover:text-ink">
          <Icon name="x" size={15} />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={o}
              onChange={(e) => set(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              maxLength={60}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[16px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => onChange(options.filter((_, j) => j !== i))}
                aria-label="Remove option"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-faint hover:bg-panel hover:text-ink"
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < POLL_MAX_OPTIONS && (
        <button
          type="button"
          onClick={() => onChange([...options, ''])}
          className="pressable mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-detail font-semibold text-accent-700"
        >
          <Icon name="plus" size={15} /> Add option
        </button>
      )}
    </div>
  );
}

/** At least two non-empty options make a poll. */
export const cleanPollOptions = (options: string[]) => options.map((o) => o.trim()).filter(Boolean);
