import { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { useApp } from '../../lib/store';
import {
  useCatalog,
  saveCatalogModel,
  setCatalogActive,
  uploadCatalogImage,
  deleteCatalogImage,
  setCatalogDefaultImage,
  type CatalogModel,
} from '../../lib/data/catalog';

/** Studio cut-outs per colour were set aside: every listing leads with the host's own cover shot
 *  (same side-profile pose for every car). The catalogue is now the names + specs hosts pick from. */
const STUDIO_IMAGES = false;

const CATEGORIES = ['Economy', 'Luxury', 'SUV', 'Sport', 'Electric', 'Convertible', 'Family'] as const;
const FUELS = ['Petrol', 'Diesel', 'Electric', 'Hybrid'] as const;
const TRANSMISSIONS = ['Automatic', 'Manual'] as const;
const DRIVES = ['Front-wheel drive', 'Rear-wheel drive', 'All-wheel drive'] as const;
const COLORS = [
  { key: 'black', label: 'Black', hex: '#15161a' },
  { key: 'white', label: 'White', hex: '#f3f3f1' },
  { key: 'silver', label: 'Silver', hex: '#c4c7cc' },
  { key: 'grey', label: 'Grey', hex: '#7b7f86' },
  { key: 'red', label: 'Red', hex: '#c8202b' },
  { key: 'blue', label: 'Blue', hex: '#1f4fd8' },
  { key: 'green', label: 'Green', hex: '#1f7a3d' },
  { key: 'yellow', label: 'Yellow', hex: '#f2c230' },
  { key: 'orange', label: 'Orange', hex: '#e86f1c' },
];

function Toggle<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" data-active={on} className="chip" onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
            {on && <Icon name="check" size={12} strokeWidth={3} />}
            {o}
          </button>
        );
      })}
    </div>
  );
}

function ModelForm({ initial, onSaved, onCancel }: { initial?: CatalogModel; onSaved: (id: string) => void; onCancel: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState({
    make: initial?.make ?? '',
    model: initial?.model ?? '',
    version: initial?.version ?? '',
    yearFrom: String(initial?.yearFrom ?? new Date().getFullYear() - 3),
    yearTo: initial?.yearTo ? String(initial.yearTo) : '',
    category: (initial?.category ?? 'Sport') as CatalogModel['category'],
    seats: String(initial?.seats ?? 4),
    doors: String(initial?.doors ?? 4),
    luggage: String(initial?.luggage ?? 2),
  });
  const [fuels, setFuels] = useState<CatalogModel['fuels']>(initial?.fuels ?? ['Petrol']);
  const [trans, setTrans] = useState<CatalogModel['transmissions']>(initial?.transmissions ?? ['Automatic']);
  const [drives, setDrives] = useState<string[]>(initial?.drives ?? ['Rear-wheel drive']);
  const [busy, setBusy] = useState(false);
  const ok = f.make.trim() && f.model.trim() && Number(f.yearFrom) > 1950 && fuels.length > 0 && trans.length > 0 && drives.length > 0;

  const save = async () => {
    setBusy(true);
    const r = await saveCatalogModel({
      id: initial?.id,
      make: f.make, model: f.model, version: f.version || null,
      yearFrom: Number(f.yearFrom), yearTo: f.yearTo ? Number(f.yearTo) : null,
      category: f.category, seats: Number(f.seats), doors: Number(f.doors), luggage: Number(f.luggage),
      fuels, transmissions: trans, drives,
    });
    setBusy(false);
    if (r.error || !r.id) { toast({ title: 'Could not save', desc: r.error ?? '', icon: 'info' }); return; }
    toast({ title: 'Saved', icon: 'check' });
    onSaved(r.id);
  };

  const field = (label: string, node: React.ReactNode, full = false) => (
    <label className={full ? 'sm:col-span-2' : ''}><span className="field-label">{label}</span>{node}</label>
  );

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {field('Make', <input className="input" value={f.make} onChange={(e) => setF({ ...f, make: e.target.value })} placeholder="Porsche" />)}
        {field('Model', <input className="input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder="911" />)}
        {field('Version (optional)', <input className="input" value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="Carrera GTS" />)}
        {field('Type', <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as CatalogModel['category'] })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>)}
        {field('Built from', <input className="input" inputMode="numeric" value={f.yearFrom} onChange={(e) => setF({ ...f, yearFrom: e.target.value })} />)}
        {field('Built until (empty = still made)', <input className="input" inputMode="numeric" value={f.yearTo} onChange={(e) => setF({ ...f, yearTo: e.target.value })} />)}
        {field('Seats', <input className="input" inputMode="numeric" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} />)}
        {field('Doors', <input className="input" inputMode="numeric" value={f.doors} onChange={(e) => setF({ ...f, doors: e.target.value })} />)}
        {field('Luggage', <input className="input" inputMode="numeric" value={f.luggage} onChange={(e) => setF({ ...f, luggage: e.target.value })} />)}
      </div>
      <div className="mt-3 space-y-3">
        <div><span className="field-label">Fuel</span><Toggle options={FUELS} value={fuels} onChange={setFuels} /></div>
        <div><span className="field-label">Transmission</span><Toggle options={TRANSMISSIONS} value={trans} onChange={setTrans} /></div>
        <div><span className="field-label">Drive</span><Toggle options={DRIVES} value={drives as (typeof DRIVES)[number][]} onChange={(v) => setDrives(v)} /></div>
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={onCancel} className="btn btn-secondary btn-sm">Cancel</button>
        <button onClick={save} disabled={!ok || busy} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? 'Saving…' : 'Save model'}</button>
      </div>
    </div>
  );
}

function ModelDetail({ model, onChanged, onEdit }: { model: CatalogModel; onChanged: () => void; onEdit: () => void }) {
  const { toast } = useApp();
  const [colorKey, setColorKey] = useState(COLORS[0].key);
  const [custom, setCustom] = useState({ label: '', hex: '#9aa0a6' });
  const [file, setFile] = useState<File | null>(null);
  const [makeDefault, setMakeDefault] = useState(model.images.length === 0);
  const [busy, setBusy] = useState(false);
  const used = new Set(model.images.map((i) => i.colorKey));

  const upload = async () => {
    if (!file) return;
    const c = colorKey === 'custom'
      ? { key: custom.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'), label: custom.label.trim(), hex: custom.hex }
      : COLORS.find((x) => x.key === colorKey)!;
    if (!c.key || !c.label) { toast({ title: 'Name the colour', icon: 'info' }); return; }
    setBusy(true);
    const r = await uploadCatalogImage(model.id, c, file, makeDefault || model.images.length === 0);
    setBusy(false);
    if (r.error) { toast({ title: 'Upload failed', desc: r.error, icon: 'info' }); return; }
    toast({ title: `${c.label} image added`, icon: 'check' });
    setFile(null);
    onChanged();
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-semibold text-ink">{model.make} {model.model}{model.version ? ` · ${model.version}` : ''}</p>
          <p className="text-detail text-muted">{model.yearFrom}–{model.yearTo ?? 'now'} · {model.category} · {model.seats} seats · {model.fuels.join(' / ')}</p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={onEdit} className="btn btn-secondary btn-sm">Edit</button>
          <button
            onClick={async () => { await setCatalogActive(model.id, !model.active); onChanged(); }}
            className="btn btn-secondary btn-sm"
          >{model.active ? 'Hide from hosts' : 'Show to hosts'}</button>
        </div>
      </div>

      {STUDIO_IMAGES && (
        <>
      <p className="mt-4 text-caption font-semibold uppercase tracking-wide text-muted">Studio images ({model.images.length})</p>
      {model.images.length === 0 ? (
        <p className="mt-2 rounded-xl bg-panel px-3 py-4 text-center text-detail text-muted">No image yet — listings of this model show the host's photos until one is added.</p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {model.images.map((im) => (
            <div key={im.id} className="overflow-hidden rounded-xl border border-line bg-gradient-to-b from-[#f4f5f2] to-[#e6e9e3]">
              <img src={im.url} alt="" className="h-28 w-full object-contain p-2" />
              <div className="flex items-center gap-1.5 border-t border-line bg-white px-2 py-1.5">
                <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: im.colorHex }} />
                <span className="min-w-0 flex-1 truncate text-caption font-semibold text-ink">{im.colorLabel}</span>
                {im.isDefault ? (
                  <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-caption font-semibold text-accent">Default</span>
                ) : (
                  <button className="text-caption font-semibold text-muted hover:text-ink" onClick={async () => { await setCatalogDefaultImage(model.id, im.id); onChanged(); }}>Make default</button>
                )}
                <button aria-label="Delete" className="text-faint hover:text-danger" onClick={async () => { if (window.confirm('Delete this image?')) { await deleteCatalogImage(im.id); onChanged(); } }}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-panel p-3">
        <p className="text-caption font-semibold text-ink">Add / replace an image</p>
        <p className="mt-0.5 text-caption text-muted">Side view of the car, transparent background (PNG/WebP), about 1600px wide. One per colour.</p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <select className="input" value={colorKey} onChange={(e) => setColorKey(e.target.value)}>
            {COLORS.map((c) => <option key={c.key} value={c.key}>{c.label}{used.has(c.key) ? ' (replace)' : ''}</option>)}
            <option value="custom">Other colour…</option>
          </select>
          {colorKey === 'custom' && (
            <div className="flex gap-2">
              <input className="input" placeholder="Colour name" value={custom.label} onChange={(e) => setCustom({ ...custom, label: e.target.value })} />
              <input type="color" aria-label="Colour" value={custom.hex} onChange={(e) => setCustom({ ...custom, hex: e.target.value })} className="h-11 w-12 shrink-0 rounded-lg border border-line bg-white p-1" />
            </div>
          )}
          <label className="btn btn-secondary btn-sm cursor-pointer justify-center sm:col-span-2">
            <Icon name="upload" size={14} /> {file ? file.name : 'Choose image'}
            <input type="file" accept="image/png,image/webp,image/jpeg" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <label className="mt-2 flex items-center gap-2 text-caption text-ink">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
          Use as the default image of this model
        </label>
        <button onClick={upload} disabled={!file || busy} className="btn btn-primary btn-sm mt-2.5 disabled:opacity-50">{busy ? 'Uploading…' : 'Upload'}</button>
      </div>
        </>
      )}
    </div>
  );
}

/** Admin → Catalog: the models hosts choose from, and the studio image(s) every listing leads with. */
export function CatalogPanel() {
  const { models, loading, reload } = useCatalog();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'new' | 'edit'>('view');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (models ?? []).filter((m) => !s || `${m.make} ${m.model} ${m.version ?? ''}`.toLowerCase().includes(s));
  }, [models, q]);
  const current = (models ?? []).find((m) => m.id === selected) ?? null;

  if (loading) return <p className="py-10 text-center text-detail text-muted">Loading…</p>;
  if ((models ?? []).length === 0 && mode === 'view') {
    return (
      <div>
        <p className="rounded-xl bg-panel px-4 py-6 text-center text-detail text-muted">
          The catalogue is empty — run migration 0107 in Supabase to load the starter models, or add one.
        </p>
        <button onClick={() => setMode('new')} className="btn btn-primary btn-sm mt-3">Add a model</button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lead font-semibold text-ink">Car catalogue</h2>
          <p className="mt-1 text-detail text-muted">
            {(models ?? []).length} models · hosts pick make, model, version and colour from here
          </p>
        </div>
        <button onClick={() => { setMode('new'); setSelected(null); }} className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Add model</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div>
          <input className="input !text-[16px] sm:!text-body" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-2 max-h-[34rem] space-y-1 overflow-y-auto">
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => { setSelected(m.id); setMode('view'); }}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${selected === m.id ? 'bg-accent/10' : 'hover:bg-panel'} ${m.active ? '' : 'opacity-50'}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-detail font-semibold text-ink">{m.make} {m.model}</span>
                    <span className="block truncate text-caption text-muted">{m.version ?? 'Standard'} · {m.yearFrom}–{m.yearTo ?? 'now'}</span>
                  </span>
                  {m.images.length > 0
                    ? <span className="rounded-full bg-accent/10 px-2 py-0.5 text-caption font-semibold text-accent">{m.images.length}</span>
                    : <span className="rounded-full bg-[#f5a524]/15 px-2 py-0.5 text-caption font-semibold text-[#a86400]">0</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          {mode === 'new' && <ModelForm onCancel={() => setMode('view')} onSaved={(id) => { setMode('view'); setSelected(id); reload(); }} />}
          {mode === 'edit' && current && <ModelForm initial={current} onCancel={() => setMode('view')} onSaved={() => { setMode('view'); reload(); }} />}
          {mode === 'view' && current && <ModelDetail model={current} onChanged={reload} onEdit={() => setMode('edit')} />}
          {mode === 'view' && !current && <p className="rounded-xl bg-panel px-4 py-10 text-center text-detail text-muted">Pick a model to edit it or hide it from hosts.</p>}
        </div>
      </div>
    </div>
  );
}
