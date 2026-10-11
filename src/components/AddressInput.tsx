import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { searchPlaces, type Place } from '../lib/geocode';

/** Text field with address suggestions as you type. Picking one calls onPick with its coordinates. */
export function AddressInput({
  value,
  onChange,
  onPick,
  near,
  placeholder = 'Street, city',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: Place) => void;
  near?: [number, number];
  placeholder?: string;
  className?: string;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const skip = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    if (value.trim().length < 3) { setResults([]); return; }
    const ctrl = new AbortController();
    setBusy(true);
    const t = window.setTimeout(async () => {
      const r = await searchPlaces(value, near, ctrl.signal);
      if (!ctrl.signal.aborted) { setResults(r); setOpen(true); setBusy(false); }
    }, 320);
    return () => { ctrl.abort(); window.clearTimeout(t); setBusy(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="input !text-[16px] sm:!text-body"
      />
      {busy && <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-ink" />}
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-line bg-white p-1 shadow-pop">
          {results.map((p, i) => (
            <li key={`${p.lat},${p.lng},${i}`}>
              <button
                type="button"
                onClick={() => { skip.current = true; onChange(p.label); onPick(p); setOpen(false); }}
                className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-panel"
              >
                <Icon name="pin" size={15} className="mt-0.5 shrink-0 text-accent" />
                <span className="min-w-0">
                  <span className="block truncate text-detail font-semibold text-ink">{p.short || p.label}</span>
                  <span className="block truncate text-caption text-muted">{p.label}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
