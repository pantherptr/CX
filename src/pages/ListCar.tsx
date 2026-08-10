import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { useApp } from '../lib/store';

const STEPS = [
  { title: 'Your car', icon: 'car' as IconName },
  { title: 'Photos', icon: 'camera' as IconName },
  { title: 'Availability', icon: 'calendar' as IconName },
  { title: 'Pricing', icon: 'euro' as IconName },
  { title: 'Review', icon: 'checkCircle' as IconName },
];

const SAMPLE_PHOTOS = [
  'photo-1502877338535-766e1452684a',
  'photo-1449965408869-eaa3f722e40d',
  'photo-1542282088-fe8426682b8f',
  'photo-1493238792000-8113da705763',
];

const MONTH = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Labeled({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={full ? 'sm:col-span-2' : ''}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Calendar({ selected, toggle }: { selected: Set<number>; toggle: (d: number) => void }) {
  const days = Array.from({ length: 35 }, (_, i) => i - 2); // offset so month starts mid-week
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-ink">September 2026</span>
        <div className="flex gap-1">
          <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-panel"><Icon name="chevronLeft" size={16} /></button>
          <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-panel"><Icon name="chevronRight" size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {MONTH.map((d) => (
          <span key={d} className="py-1.5 text-[11px] font-semibold uppercase text-faint">{d}</span>
        ))}
        {days.map((d, i) => {
          const valid = d >= 1 && d <= 30;
          const on = selected.has(d);
          return (
            <button
              key={i}
              disabled={!valid}
              onClick={() => valid && toggle(d)}
              className={`aspect-square rounded-lg text-[13.5px] font-medium transition-colors ${
                !valid ? 'text-transparent' : on ? 'bg-accent text-white' : 'text-ink-soft hover:bg-panel'
              }`}
            >
              {valid ? d : '.'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ListCar() {
  const { toast } = useApp();
  const [step, setStep] = useState(0);
  const [published, setPublished] = useState(false);
  const [photos, setPhotos] = useState<string[]>(SAMPLE_PHOTOS.slice(0, 2));
  const [dragOver, setDragOver] = useState(false);
  const [avail, setAvail] = useState<Set<number>>(() => new Set(Array.from({ length: 30 }, (_, i) => i + 1)));
  const [price, setPrice] = useState(95);
  const [weekly, setWeekly] = useState(10);
  const [monthly, setMonthly] = useState(22);

  const [form, setForm] = useState({ make: 'BMW', model: 'M2', year: '2024', type: 'Sport', seats: '4', doors: '2', transmission: 'Automatic', fuel: 'Petrol' });

  const addPhoto = () => {
    const nextPhoto = SAMPLE_PHOTOS[photos.length % SAMPLE_PHOTOS.length];
    setPhotos((p) => [...p, nextPhoto]);
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const monthlyEst = Math.round(price * 30 * (avail.size / 30) * 0.85);

  if (published) {
    return (
      <div className="container-page max-w-xl py-16 text-center">
        <div className="animate-scale-in">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent-050 text-accent"><Icon name="checkCircle" size={34} /></span>
          <h1 className="mt-6 font-display text-3xl font-semibold text-ink sm:text-4xl">Your listing is live.</h1>
          <p className="mt-3 text-[15px] text-muted">Your {form.year} {form.make} {form.model} is now visible to renters across Europe. You’ll be notified the moment a booking comes in.</p>
        </div>
        <div className="mt-8 card overflow-hidden text-left">
          <img src={unsplash(photos[0], 700)} alt="" className="aspect-[16/9] w-full object-cover" />
          <div className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-ink">{form.make} {form.model}</h2>
              <span className="text-ink"><span className="font-semibold">{eur(price)}</span><span className="text-[13px] text-muted"> / day</span></span>
            </div>
            <p className="mt-1 text-[13px] text-muted">{form.year} · {form.type} · Milan</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to="/host" className="btn btn-primary btn-lg flex-1">Go to host dashboard <Icon name="arrowRight" size={17} /></Link>
          <Link to="/browse" className="btn btn-secondary btn-lg flex-1">Preview on marketplace</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">List your car</h1>
          <span className="text-[13.5px] text-muted">Step {step + 1} of {STEPS.length}</span>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <div className="mt-3 hidden justify-between sm:flex">
            {STEPS.map((s, i) => (
              <button key={s.title} onClick={() => i <= step && setStep(i)} className={`flex items-center gap-1.5 text-[13px] font-medium ${i <= step ? 'text-ink' : 'text-faint'}`}>
                <Icon name={s.icon} size={15} /> {s.title}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-6 sm:p-8">
          {step === 0 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Tell us about your car</h2>
              <p className="mt-1 text-[14px] text-muted">The basics renters look for first.</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Labeled label="Make"><input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="input" /></Labeled>
                <Labeled label="Model"><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input" /></Labeled>
                <Labeled label="Year"><input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="input" /></Labeled>
                <Labeled label="Type">
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
                    {['Economy', 'Luxury', 'SUV', 'Sport', 'Electric', 'Convertible', 'Family'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Seats"><input value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} className="input" /></Labeled>
                <Labeled label="Doors"><input value={form.doors} onChange={(e) => setForm({ ...form, doors: e.target.value })} className="input" /></Labeled>
                <Labeled label="Transmission">
                  <select value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value })} className="input">
                    <option>Automatic</option><option>Manual</option>
                  </select>
                </Labeled>
                <Labeled label="Fuel">
                  <select value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })} className="input">
                    {['Petrol', 'Diesel', 'Electric', 'Hybrid'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Labeled>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Add photos</h2>
              <p className="mt-1 text-[14px] text-muted">Listings with 6+ quality photos get booked twice as often.</p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); addPhoto(); }}
                onClick={addPhoto}
                className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-12 text-center transition-colors ${
                  dragOver ? 'border-accent bg-accent-050' : 'border-line-strong bg-panel/40 hover:border-faint'
                }`}
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-surface text-accent shadow-hair"><Icon name="upload" size={22} /></span>
                <p className="mt-3 text-[14.5px] font-medium text-ink">Drag & drop photos here</p>
                <p className="text-[13px] text-muted">or click to browse — JPG or PNG, up to 10MB</p>
              </div>
              {photos.length > 0 && (
                <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {photos.map((p, i) => (
                    <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-line">
                      <img src={unsplash(p, 300)} alt="" className="h-full w-full object-cover" />
                      {i === 0 && <span className="absolute left-2 top-2 badge badge-ink">Cover</span>}
                      <button onClick={(e) => { e.stopPropagation(); setPhotos((ph) => ph.filter((_, idx) => idx !== i)); }} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink/70 text-white opacity-0 transition-opacity group-hover:opacity-100"><Icon name="x" size={13} /></button>
                    </div>
                  ))}
                  <button onClick={addPhoto} className="grid aspect-square place-items-center rounded-xl border border-dashed border-line-strong text-muted hover:border-faint hover:text-ink"><Icon name="plus" size={22} /></button>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Set availability</h2>
              <p className="mt-1 text-[14px] text-muted">Tap dates to block them. Green days are open for booking.</p>
              <div className="mt-6 rounded-2xl border border-line p-4 sm:p-6">
                <Calendar selected={avail} toggle={(d) => setAvail((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; })} />
              </div>
              <p className="mt-3 text-[13.5px] text-muted"><span className="font-medium text-ink">{avail.size} days</span> available this month.</p>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Set your price</h2>
              <p className="mt-1 text-[14px] text-muted">You can change this any time. We suggest {eur(95)}/day for cars like yours.</p>
              <div className="mt-6 flex items-center justify-between rounded-2xl bg-ink p-6 text-white">
                <div>
                  <p className="text-[13px] text-white/60">Daily price</p>
                  <div className="mt-1 flex items-center gap-2">
                    <button onClick={() => setPrice((p) => Math.max(20, p - 5))} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"><Icon name="x" size={14} className="rotate-45" /></button>
                    <span className="font-display text-4xl font-semibold tabular-nums">{eur(price)}</span>
                    <button onClick={() => setPrice((p) => p + 5)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"><Icon name="plus" size={14} /></button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-white/60">Est. monthly earnings</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-accent-100">{eur(monthlyEst)}</p>
                </div>
              </div>
              <div className="mt-5 space-y-5">
                {[
                  { label: 'Weekly discount', v: weekly, set: setWeekly, hint: '3+ day trips' },
                  { label: 'Monthly discount', v: monthly, set: setMonthly, hint: '30+ day trips' },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="flex items-center justify-between text-[14px]">
                      <span className="font-medium text-ink">{r.label} <span className="text-muted">· {r.hint}</span></span>
                      <span className="font-semibold text-ink">{r.v}%</span>
                    </div>
                    <input type="range" min={0} max={40} value={r.v} onChange={(e) => r.set(+e.target.value)} className="mt-2 w-full accent-[var(--color-accent)]" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Review your listing</h2>
              <p className="mt-1 text-[14px] text-muted">Here’s how renters will see your car.</p>
              <div className="mt-6 overflow-hidden rounded-2xl border border-line">
                <div className="relative aspect-[16/9]">
                  <img src={unsplash(photos[0], 800)} alt="" className="h-full w-full object-cover" />
                  <span className="absolute left-3 top-3 badge badge-glass"><Icon name="instant" size={12} className="text-accent" /> Instant book</span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-ink">{form.make} {form.model}</h3>
                      <p className="text-[13px] text-muted">{form.year} · {form.type} · Milan</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ink"><Icon name="star" size={13} className="text-star" /> New</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                    <div className="flex gap-4 text-[13px] text-muted">
                      <span className="inline-flex items-center gap-1"><Icon name="seat" size={14} /> {form.seats}</span>
                      <span className="inline-flex items-center gap-1"><Icon name="gear" size={14} /> {form.transmission}</span>
                      <span className="inline-flex items-center gap-1"><Icon name="gas" size={14} /> {form.fuel}</span>
                    </div>
                    <span className="text-ink"><span className="text-[17px] font-semibold">{eur(price)}</span><span className="text-[13px] text-muted"> / day</span></span>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-accent-050 p-4 text-[13.5px] text-accent-700">
                <Icon name="checkCircle" size={17} className="mt-px shrink-0" />
                Everything looks good. Publishing makes your car bookable immediately.
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button onClick={back} disabled={step === 0} className="btn btn-ghost text-muted hover:text-ink disabled:opacity-40">
            <Icon name="chevronLeft" size={16} /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={next} className="btn btn-primary btn-lg">Continue <Icon name="arrowRight" size={17} /></button>
          ) : (
            <button onClick={() => { setPublished(true); toast({ title: 'Listing published', desc: 'Your car is now live on Velora.', icon: 'sparkles' }); }} className="btn btn-accent btn-lg">
              Publish listing <Icon name="check" size={17} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
