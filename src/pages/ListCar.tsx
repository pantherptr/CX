import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { eur } from '../lib/format';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { createCar } from '../lib/data/cars';
import { catalogue } from '../lib/catalogue';
import type { Car } from '../data/types';

/**
 * Real listing creation. Every field here maps to a column on `cars`;
 * publishing uploads the photos to the `car-photos` bucket, inserts the
 * car and its images, and flips `profiles.is_host` (see createCar).
 *
 * There is deliberately no availability step: a car is bookable unless an
 * existing booking overlaps it (enforced by the exclusion constraint in
 * migration 0003), and there is no host-blackout-dates table — so a
 * calendar here would collect something the platform can't honour.
 */

const STEPS = [
  { title: 'Your car', icon: 'car' as IconName },
  { title: 'Photos', icon: 'camera' as IconName },
  { title: 'Pricing', icon: 'euro' as IconName },
  { title: 'Review', icon: 'checkCircle' as IconName },
];

// These must match the Postgres enums exactly (car_category,
// transmission_type, fuel_type — 0001_init.sql).
const CATEGORIES = ['Economy', 'Luxury', 'SUV', 'Sport', 'Electric', 'Convertible', 'Family'] as const;
const TRANSMISSIONS = ['Automatic', 'Manual'] as const;
const FUELS = ['Petrol', 'Diesel', 'Electric', 'Hybrid'] as const;
const DRIVES = ['Front-wheel drive', 'Rear-wheel drive', 'All-wheel drive'];

/** Superset of the options Browse filters on, so a new listing is
 *  actually reachable through the feature filter. */
const FEATURES = [
  'Apple CarPlay', 'Bluetooth', 'Navigation', 'Heated seats',
  'Parking sensors', 'Adaptive cruise control', 'Panoramic roof', 'Premium sound',
];

const MAX_PHOTOS = 8;
const MAX_BYTES = 5 * 1024 * 1024;

interface PendingPhoto {
  file: File;
  preview: string;
}

function Labeled({ label, children, full, hint }: { label: string; children: ReactNode; full?: boolean; hint?: string }) {
  return (
    <label className={full ? 'sm:col-span-2' : ''}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-faint">{hint}</span>}
    </label>
  );
}

export default function ListCar() {
  const { toast } = useApp();
  const { session, refreshProfile } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    make: '', model: '', trim: '',
    year: String(new Date().getFullYear()),
    category: 'Sport' as Car['category'],
    city: catalogue.cityNames[0] ?? 'Milan',
    location: '',
    seats: '4', doors: '2', luggage: '2',
    transmission: 'Automatic' as Car['transmission'],
    fuel: 'Petrol' as Car['fuel'],
    mileage: 'Unlimited',
    drive: 'Rear-wheel drive',
    description: '',
  });
  const [features, setFeatures] = useState<string[]>([]);
  const [instantBook, setInstantBook] = useState(true);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [price, setPrice] = useState(95);

  const [submitting, setSubmitting] = useState<'draft' | 'published' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<Car | null>(null);

  // Object URLs are only for local previews — release them all on unmount.
  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted: PendingPhoto[] = [];
    let firstError: string | null = null;

    for (const file of Array.from(list)) {
      if (photos.length + accepted.length >= MAX_PHOTOS) {
        firstError ??= `You can add up to ${MAX_PHOTOS} photos.`;
        break;
      }
      if (!file.type.startsWith('image/')) {
        firstError ??= `“${file.name}” isn’t an image file.`;
        continue;
      }
      if (file.size > MAX_BYTES) {
        firstError ??= `“${file.name}” is larger than 5MB.`;
        continue;
      }
      const preview = URL.createObjectURL(file);
      objectUrls.current.push(preview);
      accepted.push({ file, preview });
    }

    if (accepted.length) setPhotos((p) => [...p, ...accepted]);
    setPhotoError(firstError);
  };

  const removePhoto = (index: number) => {
    setPhotos((p) => {
      const target = p[index];
      if (target) URL.revokeObjectURL(target.preview);
      return p.filter((_, i) => i !== index);
    });
    setPhotoError(null);
  };

  const toggleFeature = (f: string) =>
    setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  const year = Number(form.year);
  const thisYear = new Date().getFullYear();
  const stepValid = [
    Boolean(
      form.make.trim() && form.model.trim() && form.location.trim() && form.city &&
      Number.isInteger(year) && year >= 1950 && year <= thisYear + 2 &&
      Number(form.seats) >= 1 && Number(form.doors) >= 1 && Number(form.luggage) >= 0,
    ),
    photos.length >= 1,
    price > 0,
    true,
  ];
  const canContinue = stepValid[step];

  const next = () => {
    if (!canContinue) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0 });
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async (status: 'draft' | 'published') => {
    if (!session || submitting) return;
    setSubmitting(status);
    setSubmitError(null);

    const { car, error, warning } = await createCar(
      {
        hostId: session.user.id,
        make: form.make.trim(),
        model: form.model.trim(),
        trim: form.trim.trim() || undefined,
        year,
        category: form.category,
        city: form.city,
        location: form.location.trim(),
        pricePerDay: price,
        transmission: form.transmission,
        fuel: form.fuel,
        seats: Number(form.seats),
        doors: Number(form.doors),
        luggage: Number(form.luggage),
        mileage: form.mileage.trim() || undefined,
        drive: form.drive || undefined,
        description: form.description.trim() || undefined,
        features,
        instantBook,
        status,
      },
      photos.map((p) => p.file),
    );

    setSubmitting(null);
    if (error || !car) {
      setSubmitError(error ?? 'Something went wrong. Please try again.');
      return;
    }

    // The account just became a host — refresh so the navbar and route
    // guards see it without a reload.
    await refreshProfile();
    setCreated(car);
    window.scrollTo({ top: 0 });

    if (warning) {
      toast({ title: 'Listing created', desc: warning, icon: 'info' });
    } else {
      toast({
        title: status === 'published' ? 'Listing published' : 'Draft saved',
        desc: status === 'published' ? 'Your car is now live on CX.' : 'You can publish it any time.',
        icon: 'sparkles',
      });
    }
  };

  /* ---------------- Success ---------------- */
  if (created) {
    const isPublished = created.status === 'published';
    return (
      <div className="container-page max-w-xl py-16 text-center">
        <div className="animate-scale-in">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent-bright/15 text-accent-bright">
            <Icon name="checkCircle" size={34} />
          </span>
          <h1 className="mt-6 font-display text-3xl font-semibold text-ink sm:text-4xl">
            {isPublished ? 'Your listing is live.' : 'Draft saved.'}
          </h1>
          <p className="mt-3 text-[15px] text-muted">
            {isPublished
              ? `Your ${created.year} ${created.make} ${created.model} is now visible to renters across Europe. You’ll be notified the moment a booking comes in.`
              : `Your ${created.year} ${created.make} ${created.model} is saved to your fleet. It won’t appear on the marketplace until you publish it.`}
          </p>
        </div>

        <div className="card mt-8 overflow-hidden text-left">
          <img src={created.images[0]} alt="" className="aspect-[16/9] w-full object-cover" />
          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 truncate font-medium text-ink">{created.make} {created.model}</h2>
              <span className="shrink-0 text-ink">
                <span className="font-semibold">{eur(created.pricePerDay)}</span>
                <span className="text-[13px] text-muted"> / day</span>
              </span>
            </div>
            <p className="mt-1 text-[13px] text-muted">
              {created.year} · {created.category} · {created.location}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to="/host" className="btn btn-accent-bright btn-lg flex-1">
            Go to host dashboard <Icon name="arrowRight" size={17} />
          </Link>
          {isPublished && (
            <Link to={`/cars/${created.slug}`} className="btn btn-secondary btn-lg flex-1">
              View listing
            </Link>
          )}
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
            <div
              className="h-full rounded-full bg-accent-bright transition-all duration-500"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <div className="mt-3 hidden justify-between sm:flex">
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                onClick={() => i <= step && setStep(i)}
                className={`flex items-center gap-1.5 text-[13px] font-medium ${i <= step ? 'text-ink' : 'text-faint'}`}
              >
                <Icon name={s.icon} size={15} /> {s.title}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-6 sm:p-8">
          {/* ---------------- Step 0: the car ---------------- */}
          {step === 0 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Tell us about your car</h2>
              <p className="mt-1 text-[14px] text-muted">The basics renters look for first.</p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Labeled label="Make">
                  <input value={form.make} onChange={(e) => set({ make: e.target.value })} placeholder="e.g. BMW" className="input" />
                </Labeled>
                <Labeled label="Model">
                  <input value={form.model} onChange={(e) => set({ model: e.target.value })} placeholder="e.g. M2" className="input" />
                </Labeled>
                <Labeled label="Trim (optional)">
                  <input value={form.trim} onChange={(e) => set({ trim: e.target.value })} placeholder="e.g. Competition" className="input" />
                </Labeled>
                <Labeled label="Year">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1950}
                    max={thisYear + 2}
                    value={form.year}
                    onChange={(e) => set({ year: e.target.value })}
                    className="input"
                  />
                </Labeled>
                <Labeled label="Type">
                  <select value={form.category} onChange={(e) => set({ category: e.target.value as Car['category'] })} className="input">
                    {CATEGORIES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Transmission">
                  <select value={form.transmission} onChange={(e) => set({ transmission: e.target.value as Car['transmission'] })} className="input">
                    {TRANSMISSIONS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Fuel">
                  <select value={form.fuel} onChange={(e) => set({ fuel: e.target.value as Car['fuel'] })} className="input">
                    {FUELS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Drive">
                  <select value={form.drive} onChange={(e) => set({ drive: e.target.value })} className="input">
                    {DRIVES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Seats">
                  <input type="number" inputMode="numeric" min={1} max={9} value={form.seats} onChange={(e) => set({ seats: e.target.value })} className="input" />
                </Labeled>
                <Labeled label="Doors">
                  <input type="number" inputMode="numeric" min={1} max={6} value={form.doors} onChange={(e) => set({ doors: e.target.value })} className="input" />
                </Labeled>
                <Labeled label="Luggage">
                  <input type="number" inputMode="numeric" min={0} max={10} value={form.luggage} onChange={(e) => set({ luggage: e.target.value })} className="input" />
                </Labeled>
                <Labeled label="Mileage">
                  <input value={form.mileage} onChange={(e) => set({ mileage: e.target.value })} placeholder="e.g. Unlimited" className="input" />
                </Labeled>
              </div>

              <div className="mt-8 border-t border-line pt-6">
                <h3 className="font-display text-lg font-semibold text-ink">Where &amp; what it’s like</h3>
                <p className="mt-1 text-[14px] text-muted">This is what renters see on your listing page.</p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Labeled label="City">
                    <select value={form.city} onChange={(e) => set({ city: e.target.value })} className="input">
                      {catalogue.cityNames.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Labeled>
                  <Labeled label="Pick-up area" hint="Shown publicly — the exact address is only shared after booking.">
                    <input value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Brera, Milan" className="input" />
                  </Labeled>
                  <Labeled label="Description" full>
                    <textarea
                      value={form.description}
                      onChange={(e) => set({ description: e.target.value })}
                      rows={4}
                      placeholder="What makes this car a great trip? Condition, character, what it’s best for…"
                      className="input resize-y"
                    />
                  </Labeled>
                </div>

                <div className="mt-5">
                  <span className="field-label">Features</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {FEATURES.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => toggleFeature(f)}
                        data-active={features.includes(f)}
                        className="chip"
                      >
                        {features.includes(f) && <Icon name="check" size={13} strokeWidth={3} />}
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4">
                  <input
                    type="checkbox"
                    checked={instantBook}
                    onChange={(e) => setInstantBook(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                  />
                  <span>
                    <span className="block text-[14.5px] font-medium text-ink">Allow instant booking</span>
                    <span className="block text-[13px] text-muted">Renters can book without waiting for you to approve each request.</span>
                  </span>
                </label>
              </div>

              {!canContinue && (
                <p className="mt-5 flex items-center gap-2 text-[13.5px] text-muted">
                  <Icon name="info" size={15} /> Fill in make, model, year, city and pick-up area to continue.
                </p>
              )}
            </div>
          )}

          {/* ---------------- Step 1: photos ---------------- */}
          {step === 1 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Add photos</h2>
              <p className="mt-1 text-[14px] text-muted">Listings with 6+ quality photos get booked twice as often. The first is your cover.</p>

              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = ''; // let the same file be re-picked
                }}
              />

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileInput.current?.click()}
                className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-12 text-center transition-colors ${
                  dragOver ? 'border-accent-bright bg-accent-050' : 'border-line-strong bg-panel/40 hover:border-faint'
                }`}
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-surface text-accent shadow-hair">
                  <Icon name="upload" size={22} />
                </span>
                <p className="mt-3 text-[14.5px] font-medium text-ink">Drag &amp; drop photos here</p>
                <p className="text-[13px] text-muted">or click to browse — images up to 5MB, {MAX_PHOTOS} max</p>
              </div>

              {photoError && (
                <p className="mt-3 flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-[13.5px] text-danger">
                  <Icon name="info" size={16} /> {photoError}
                </p>
              )}

              {photos.length > 0 && (
                <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {photos.map((p, i) => (
                    <div key={p.preview} className="group relative aspect-square overflow-hidden rounded-xl border border-line">
                      <img src={p.preview} alt="" className="h-full w-full object-cover" />
                      {i === 0 && <span className="badge badge-ink absolute left-2 top-2">Cover</span>}
                      <button
                        onClick={() => removePhoto(i)}
                        aria-label="Remove photo"
                        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button
                      onClick={() => fileInput.current?.click()}
                      aria-label="Add more photos"
                      className="grid aspect-square place-items-center rounded-xl border border-dashed border-line-strong text-muted hover:border-faint hover:text-ink"
                    >
                      <Icon name="plus" size={22} />
                    </button>
                  )}
                </div>
              )}

              {photos.length === 0 && (
                <p className="mt-4 flex items-center gap-2 text-[13.5px] text-muted">
                  <Icon name="info" size={15} /> At least one photo is required.
                </p>
              )}
            </div>
          )}

          {/* ---------------- Step 2: pricing ---------------- */}
          {step === 2 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Set your price</h2>
              <p className="mt-1 text-[14px] text-muted">You can change this any time from your host dashboard.</p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-noir p-6 text-on-noir">
                <div>
                  <p className="text-[13px] text-on-noir-muted">Daily price</p>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      onClick={() => setPrice((p) => Math.max(5, p - 5))}
                      aria-label="Decrease price"
                      className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                    >
                      <Icon name="x" size={14} className="rotate-45" />
                    </button>
                    <span className="font-display text-4xl font-semibold tabular-nums">{eur(price)}</span>
                    <button
                      onClick={() => setPrice((p) => p + 5)}
                      aria-label="Increase price"
                      className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                    >
                      <Icon name="plus" size={14} />
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-on-noir-muted">Earnings on a 3-day trip</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-accent-bright">{eur(price * 3)}</p>
                </div>
              </div>
              <p className="mt-4 flex items-start gap-2 text-[13.5px] text-muted">
                <Icon name="info" size={15} className="mt-px shrink-0" />
                Renters also pay a service fee and protection on top of your daily rate — you receive the rate you set.
              </p>
            </div>
          )}

          {/* ---------------- Step 3: review ---------------- */}
          {step === 3 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Review your listing</h2>
              <p className="mt-1 text-[14px] text-muted">Here’s how renters will see your car.</p>

              <div className="mt-6 overflow-hidden rounded-2xl border border-line">
                <div className="relative aspect-[16/9] bg-panel-2">
                  {photos[0] && <img src={photos[0].preview} alt="" className="h-full w-full object-cover" />}
                  {instantBook && (
                    <span className="badge badge-glass absolute left-3 top-3">
                      <Icon name="instant" size={12} className="text-accent-bright" /> Instant book
                    </span>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium text-ink">{form.make} {form.model}</h3>
                      <p className="text-[13px] text-muted">
                        {form.trim ? `${form.trim} · ` : ''}{form.year} · {form.category}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
                        <Icon name="pin" size={13} /> {form.location}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-ink">
                      <Icon name="star" size={13} className="text-star" /> New
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <div className="flex flex-wrap gap-4 text-[13px] text-muted">
                      <span className="inline-flex items-center gap-1"><Icon name="seat" size={14} /> {form.seats}</span>
                      <span className="inline-flex items-center gap-1"><Icon name="bag" size={14} /> {form.luggage}</span>
                      <span className="inline-flex items-center gap-1"><Icon name="gear" size={14} /> {form.transmission}</span>
                      <span className="inline-flex items-center gap-1"><Icon name="gas" size={14} /> {form.fuel}</span>
                    </div>
                    <span className="text-ink">
                      <span className="text-[17px] font-semibold">{eur(price)}</span>
                      <span className="text-[13px] text-muted"> / day</span>
                    </span>
                  </div>
                  {features.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
                      {features.map((f) => (
                        <span key={f} className="badge bg-panel-2 text-ink-soft">{f}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {submitError && (
                <p className="mt-5 flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-[13.5px] text-danger">
                  <Icon name="info" size={16} /> {submitError}
                </p>
              )}

              <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-accent-050 p-4 text-[13.5px] text-accent-700">
                <Icon name="checkCircle" size={17} className="mt-px shrink-0" />
                Publishing makes your car bookable immediately. Save it as a draft if you’d rather finish later.
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button onClick={back} disabled={step === 0 || !!submitting} className="btn btn-ghost text-muted hover:text-ink disabled:opacity-40">
            <Icon name="chevronLeft" size={16} /> Back
          </button>

          {step < STEPS.length - 1 ? (
            <button onClick={next} disabled={!canContinue} className="btn btn-accent-bright btn-lg disabled:opacity-50">
              Continue <Icon name="arrowRight" size={17} />
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <button
                onClick={() => submit('draft')}
                disabled={!!submitting}
                className="btn btn-secondary disabled:opacity-60"
              >
                {submitting === 'draft' ? 'Saving…' : 'Save as draft'}
              </button>
              <button
                onClick={() => submit('published')}
                disabled={!!submitting}
                className="btn btn-accent-bright btn-lg disabled:opacity-60"
              >
                {submitting === 'published' ? 'Publishing…' : 'Publish listing'}
                {!submitting && <Icon name="check" size={17} strokeWidth={2.5} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
