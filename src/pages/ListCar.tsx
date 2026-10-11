import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { eur } from '../lib/format';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { createCar } from '../lib/data/cars';
import { notifyTeamOfListing } from '../lib/data/listingReview';
import { useCatalog, groupByMake, type CatalogModel } from '../lib/data/catalog';
import { PoseCamera, CarPoseGuide } from '../components/PoseCamera';
import { LocationPicker, type PickedLocation } from '../components/LocationPicker';
import { catalogue } from '../lib/catalogue';
import { DEFAULT_POLICY, type CancellationPolicy } from '../lib/cancellationPolicy';
import { CancellationPolicyPicker } from '../components/CancellationPolicy';
import type { Car } from '../data/types';
import { CONTACT_WARNING, hasContactInfo } from '../lib/contactGuard';

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

/** Paint colours offered when a model has no colour-specific image yet. */
const GENERIC_COLORS = [
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

const MAX_PHOTOS = 7; // extras, on top of the cover
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
      {hint && <span className="mt-1 block text-caption text-faint">{hint}</span>}
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
  const [pin, setPin] = useState<PickedLocation | null>(null);
  const [features, setFeatures] = useState<string[]>([]);
  // The catalogue pick: the model entry (make + model + version) and the paint colour.
  const { models: catalogModels } = useCatalog();
  const [pickedMake, setPickedMake] = useState('');
  const [pickedModel, setPickedModel] = useState('');
  const [entry, setEntry] = useState<CatalogModel | null>(null);
  const [colorKey, setColorKey] = useState('');
  const [instantBook, setInstantBook] = useState(true);
  // The cover photo is its own, strict slot (side profile, same shot for every car); photos are the extras.
  const [cover, setCover] = useState<PendingPhoto | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const coverInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [publishDone, setPublishDone] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [price, setPrice] = useState(95);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [cancellationPolicy, setCancellationPolicy] = useState<CancellationPolicy>(DEFAULT_POLICY);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryFeeType, setDeliveryFeeType] = useState<'free' | 'fixed'>('free');
  const [deliveryFeeAmount, setDeliveryFeeAmount] = useState('15');
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState('10');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [deliveryHoursStart, setDeliveryHoursStart] = useState('09:00');
  const [deliveryHoursEnd, setDeliveryHoursEnd] = useState('19:00');

  const [submitting, setSubmitting] = useState<'draft' | 'published' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Object URLs are only for local previews — release them all on unmount.
  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  /** The cover must be the same shot for every car: landscape, big enough, whole car in frame. */
  const setCoverFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setPhotoError(`“${file.name}” isn’t an image file.`); return; }
    const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
      const u = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { resolve({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(u); };
      im.onerror = () => { resolve(null); URL.revokeObjectURL(u); };
      im.src = u;
    });
    if (!dims) { setPhotoError('We could not read that photo — try another one.'); return; }
    if (dims.h > dims.w * 0.85) {
      setPhotoError('The cover photo has to be landscape — turn your phone sideways and shoot the whole car from the side.');
      return;
    }
    if (dims.w < 1200) {
      setPhotoError('That photo is too small. The cover needs at least 1200px wide — use the camera or a larger photo.');
      return;
    }
    const preview = URL.createObjectURL(file);
    objectUrls.current.push(preview);
    setCover((prev) => { if (prev) URL.revokeObjectURL(prev.preview); return { file, preview }; });
    setPhotoError(null);
  };

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

  const thisYear = new Date().getFullYear();
  /** A catalogue model fills in everything a host would otherwise type by hand. */
  const applyEntry = (m: CatalogModel) => {
    const top = Math.min(m.yearTo ?? thisYear + 1, thisYear + 1);
    setForm((f) => ({
      ...f,
      make: m.make,
      model: m.model,
      trim: m.version ?? '',
      category: m.category,
      seats: String(m.seats),
      doors: String(m.doors),
      luggage: String(m.luggage),
      transmission: m.transmissions[0] ?? f.transmission,
      fuel: m.fuels[0] ?? f.fuel,
      drive: m.drives[0] ?? f.drive,
      year: String(Math.min(Math.max(Number(f.year) || top, m.yearFrom), top)),
    }));
  };
  const year = Number(form.year);
  const useCat = (catalogModels?.filter((m) => m.active).length ?? 0) > 0;
  const stepValid = [
    Boolean(
      (useCat ? entry && colorKey : form.make.trim() && form.model.trim()) && pin && form.city &&
      Number.isInteger(year) && year >= 1950 && year <= thisYear + 2 &&
      Number(form.seats) >= 1 && Number(form.doors) >= 1 && Number(form.luggage) >= 0,
    ),
    Boolean(cover),
    price > 0 && (pickupEnabled || deliveryEnabled) && (!deliveryEnabled || deliveryFeeType === 'free' || Number(deliveryFeeAmount) >= 0),
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
    if (hasContactInfo(form.description) || hasContactInfo(form.location)) {
      setSubmitError(CONTACT_WARNING);
      return;
    }
    setSubmitting(status);
    setSubmitError(null);

    const { car, error, warning } = await createCar(
      {
        hostId: session.user.id,
        make: form.make.trim(),
        model: form.model.trim(),
        trim: form.trim.trim() || undefined,
        catalogId: useCat ? entry?.id : undefined,
        colorKey: useCat ? colorKey : undefined,
        year,
        category: form.category,
        city: form.city,
        location: form.location.trim(),
        lat: pin?.lat,
        lng: pin?.lng,
        addressLabel: pin?.label,
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
        pickupEnabled,
        cancellationPolicy,
        deliveryEnabled,
        deliveryFeeType,
        deliveryFeeAmount: deliveryFeeType === 'fixed' ? Number(deliveryFeeAmount) || 0 : 0,
        deliveryRadiusKm: deliveryEnabled && deliveryRadiusKm ? Number(deliveryRadiusKm) : undefined,
        deliveryInstructions: deliveryEnabled ? deliveryInstructions.trim() || undefined : undefined,
        deliveryHoursStart: deliveryEnabled ? deliveryHoursStart : undefined,
        deliveryHoursEnd: deliveryEnabled ? deliveryHoursEnd : undefined,
      },
      [cover!, ...photos].map((p) => p.file),
    );

    setSubmitting(null);
    if (error || !car) {
      setSubmitError(error ?? 'Something went wrong. Please try again.');
      return;
    }

    // The account just became a host — refresh so the navbar and route
    // guards see it without a reload.
    await refreshProfile();
    if (status === 'published' && car.reviewStatus === 'pending') void notifyTeamOfListing(car.id);

    if (warning) {
      toast({ title: 'Listing created', desc: warning, icon: 'info' });
    } else {
      toast({
        title: status === 'published' ? 'Sent to the team' : 'Draft saved',
        desc: status === 'published' ? 'Your car goes live in about 5 minutes.' : 'You can publish it any time.',
        icon: 'sparkles',
      });
    }
    // Let the success state play out, then back to the host page.
    setPublishDone(true);
    window.setTimeout(() => navigate('/host'), 1400);
  };

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">List your car</h1>
          <span className="text-detail text-muted">Step {step + 1} of {STEPS.length}</span>
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
                className={`flex items-center gap-1.5 text-detail font-medium ${i <= step ? 'text-ink' : 'text-faint'}`}
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
              <p className="mt-1 text-body text-muted">The basics renters look for first.</p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {useCat ? (
                  <>
                    <Labeled label="Make">
                      <select
                        value={pickedMake}
                        onChange={(e) => { setPickedMake(e.target.value); setPickedModel(''); setEntry(null); setColorKey(''); }}
                        className="input"
                      >
                        <option value="">Choose a make…</option>
                        {groupByMake(catalogModels ?? []).map((g) => <option key={g.make}>{g.make}</option>)}
                      </select>
                    </Labeled>
                    <Labeled label="Model">
                      <select
                        value={pickedModel}
                        disabled={!pickedMake}
                        onChange={(e) => {
                          const name = e.target.value;
                          setPickedModel(name);
                          setColorKey('');
                          const options = (catalogModels ?? []).filter((m) => m.active && m.make === pickedMake && m.model === name);
                          const only = options.length === 1 ? options[0] : null;
                          setEntry(only);
                          if (only) applyEntry(only);
                        }}
                        className="input disabled:opacity-50"
                      >
                        <option value="">Choose a model…</option>
                        {(groupByMake(catalogModels ?? []).find((g) => g.make === pickedMake)?.models ?? []).map((m) => <option key={m}>{m}</option>)}
                      </select>
                    </Labeled>
                    {pickedModel && (catalogModels ?? []).filter((m) => m.active && m.make === pickedMake && m.model === pickedModel).length > 1 && (
                      <Labeled label="Version" full>
                        <div className="flex flex-wrap gap-2">
                          {(catalogModels ?? []).filter((m) => m.active && m.make === pickedMake && m.model === pickedModel).map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              data-active={entry?.id === m.id}
                              onClick={() => { setEntry(m); setColorKey(''); applyEntry(m); }}
                              className="chip"
                            >
                              {m.version || 'Standard'} <span className="text-faint">{m.yearFrom}–{m.yearTo ?? 'now'}</span>
                            </button>
                          ))}
                        </div>
                      </Labeled>
                    )}
                    {entry && (
                      <Labeled label="Year">
                        <select value={form.year} onChange={(e) => set({ year: e.target.value })} className="input">
                          {Array.from({ length: (entry.yearTo ?? thisYear + 1) - entry.yearFrom + 1 }, (_, i) => (entry.yearTo ?? thisYear + 1) - i).map((y) => <option key={y}>{y}</option>)}
                        </select>
                      </Labeled>
                    )}
                    {entry && (
                      <div className="sm:col-span-2">
                        <span className="field-label">Colour</span>
                        <div className="mt-2 flex flex-wrap gap-2.5">
                          {(entry.images.length > 0
                            ? entry.images.map((i) => ({ key: i.colorKey, label: i.colorLabel, hex: i.colorHex }))
                            : GENERIC_COLORS
                          ).map((c) => (
                            <button
                              key={c.key}
                              type="button"
                              onClick={() => setColorKey(c.key)}
                              aria-label={c.label}
                              title={c.label}
                              className={`grid h-10 w-10 place-items-center rounded-full ring-2 transition-transform active:scale-90 ${colorKey === c.key ? 'ring-accent' : 'ring-line'}`}
                            >
                              <span className="h-7 w-7 rounded-full ring-1 ring-black/10" style={{ background: c.hex }} />
                            </button>
                          ))}
                        </div>
                        {colorKey && <p className="mt-1.5 text-caption text-muted">{(entry.images.find((i) => i.colorKey === colorKey)?.colorLabel) ?? GENERIC_COLORS.find((c) => c.key === colorKey)?.label}</p>}
                      </div>
                    )}
                  </>
                ) : (
                  <>
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
                  </>
                )}
                {(!useCat || entry) && (
                  <>
                    {!useCat && (
                      <Labeled label="Type">
                        <select value={form.category} onChange={(e) => set({ category: e.target.value as Car['category'] })} className="input">
                          {CATEGORIES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </Labeled>
                    )}
                    <Labeled label="Transmission">
                      <select value={form.transmission} onChange={(e) => set({ transmission: e.target.value as Car['transmission'] })} className="input">
                        {(entry ? entry.transmissions : TRANSMISSIONS).map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </Labeled>
                    <Labeled label="Fuel">
                      <select value={form.fuel} onChange={(e) => set({ fuel: e.target.value as Car['fuel'] })} className="input">
                        {(entry ? entry.fuels : FUELS).map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </Labeled>
                    <Labeled label="Drive">
                      <select value={form.drive} onChange={(e) => set({ drive: e.target.value })} className="input">
                        {(entry ? entry.drives : DRIVES).map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </Labeled>
                    {!useCat && (
                      <>
                        <Labeled label="Seats">
                          <input type="number" inputMode="numeric" min={1} max={9} value={form.seats} onChange={(e) => set({ seats: e.target.value })} className="input" />
                        </Labeled>
                        <Labeled label="Doors">
                          <input type="number" inputMode="numeric" min={1} max={6} value={form.doors} onChange={(e) => set({ doors: e.target.value })} className="input" />
                        </Labeled>
                        <Labeled label="Luggage">
                          <input type="number" inputMode="numeric" min={0} max={10} value={form.luggage} onChange={(e) => set({ luggage: e.target.value })} className="input" />
                        </Labeled>
                      </>
                    )}
                  </>
                )}
                <Labeled label="Mileage">
                  <input value={form.mileage} onChange={(e) => set({ mileage: e.target.value })} placeholder="e.g. Unlimited" className="input" />
                </Labeled>
              </div>

              <div className="mt-8 border-t border-line pt-6">
                <h3 className="font-display text-lg font-semibold text-ink">Where &amp; what it’s like</h3>
                <p className="mt-1 text-body text-muted">This is what renters see on your listing page.</p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Labeled label="City">
                    <select value={form.city} onChange={(e) => set({ city: e.target.value })} className="input">
                      {catalogue.cityNames.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Labeled>
                  <div className="sm:col-span-2">
                    <span className="field-label">Where renters pick it up</span>
                    <div className="mt-1.5">
                      <LocationPicker
                        value={pin}
                        city={form.city}
                        onChange={(v) => { setPin(v); set({ location: v?.label ?? '' }); }}
                      />
                    </div>
                  </div>
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
                    <span className="block text-body font-medium text-ink">Allow instant booking</span>
                    <span className="block text-detail text-muted">Renters can book without waiting for you to approve each request.</span>
                  </span>
                </label>
              </div>

              {!canContinue && (
                <p className="mt-5 flex items-center gap-2 text-detail text-muted">
                  <Icon name="info" size={15} /> {useCat ? 'Choose your car, its colour, the city and the pick-up spot on the map to continue.' : 'Fill in make, model, year, city and the pick-up spot on the map to continue.'}
                </p>
              )}
            </div>
          )}

          {/* ---------------- Step 1: photos ---------------- */}
          {step === 1 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Your photos</h2>
              <p className="mt-1 text-body text-muted">Every CX car opens with the same shot, so the marketplace stays clean. Then add your own photos.</p>

              <input ref={coverInput} type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void setCoverFile(f); }} />
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              />

              {/* 1 — the cover */}
              <div className="mt-6 flex items-center gap-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-caption font-bold text-white">1</span>
                <h3 className="font-display text-lg font-semibold text-ink">Cover photo</h3>
                {cover && <span className="badge badge-accent"><Icon name="check" size={12} /> Done</span>}
              </div>

              <div className="mt-3 overflow-hidden rounded-[24px] border border-line bg-gradient-to-b from-[#f4f5f2] via-[#eef0ec] to-[#e2e5de]">
                {cover ? (
                  <div className="relative aspect-[16/10]">
                    <img src={cover.preview} alt="" className="h-full w-full object-cover" />
                    <span className="badge badge-ink absolute left-3 top-3">Cover</span>
                  </div>
                ) : (
                  <div className="relative grid aspect-[16/10] place-items-center">
                    <CarPoseGuide className="w-[78%] text-ink/35" />
                    <p className="absolute bottom-3 left-0 right-0 text-center text-caption font-semibold text-ink-soft">Whole car · side profile · nose to the left</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 border-t border-line bg-white p-3">
                  {typeof navigator !== 'undefined' && 'mediaDevices' in navigator && (
                    <button onClick={() => setCameraOpen(true)} className="btn btn-primary btn-sm">
                      <Icon name="camera" size={15} /> {cover ? 'Retake with the guide' : 'Open camera with guide'}
                    </button>
                  )}
                  <button onClick={() => coverInput.current?.click()} className="btn btn-secondary btn-sm">
                    <Icon name="upload" size={15} /> {cover ? 'Choose another' : 'Choose from gallery'}
                  </button>
                </div>
              </div>

              <ul className="mt-3 grid gap-1.5 text-detail text-muted sm:grid-cols-2">
                {['Phone sideways (landscape)', 'The car’s left side — nose pointing left', 'Whole car in frame, wheels on the ground', 'Clean spot, daylight, no people'].map((t) => (
                  <li key={t} className="flex items-start gap-2"><Icon name="checkCircle" size={15} className="mt-0.5 shrink-0 text-accent" /> {t}</li>
                ))}
              </ul>

              {photoError && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">
                  <Icon name="info" size={16} className="mt-0.5 shrink-0" /> {photoError}
                </p>
              )}

              {/* 2 — the rest */}
              <div className="mt-8 flex items-center gap-2.5">
                <span className={`grid h-7 w-7 place-items-center rounded-full text-caption font-bold ${cover ? 'bg-ink text-white' : 'bg-panel text-faint'}`}>2</span>
                <h3 className={`font-display text-lg font-semibold ${cover ? 'text-ink' : 'text-faint'}`}>More photos <span className="text-detail font-normal text-muted">· optional, up to {MAX_PHOTOS}</span></h3>
              </div>
              <p className="mt-1 text-detail text-muted">Front, rear, interior, dashboard, wheels. They appear right after the cover.</p>

              <div className={`mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 ${cover ? '' : 'pointer-events-none opacity-50'}`}>
                {photos.map((p, i) => (
                  <div key={p.preview} className="group relative aspect-square overflow-hidden rounded-xl border border-line">
                    <img src={p.preview} alt="" className="h-full w-full object-cover" />
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
                    aria-label="Add photos"
                    className="grid aspect-square place-items-center rounded-xl border border-dashed border-line-strong text-muted hover:border-faint hover:text-ink"
                  >
                    <Icon name="plus" size={22} />
                  </button>
                )}
              </div>

              {!cover && (
                <p className="mt-4 flex items-center gap-2 text-detail text-muted">
                  <Icon name="info" size={15} /> The cover photo is required to continue.
                </p>
              )}

              {cameraOpen && (
                <PoseCamera
                  onClose={() => setCameraOpen(false)}
                  onUnavailable={() => { setCameraOpen(false); coverInput.current?.click(); }}
                  onCapture={(f) => { setCameraOpen(false); void setCoverFile(f); }}
                />
              )}
            </div>
          )}

          {/* ---------------- Step 2: pricing ---------------- */}
          {step === 2 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Set your price</h2>
              <p className="mt-1 text-body text-muted">You can change this any time from your host dashboard.</p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-noir p-6 text-on-noir">
                <div>
                  <p className="text-detail text-on-noir-muted">Daily price</p>
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
                  <p className="text-detail text-on-noir-muted">Earnings on a 3-day trip</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-accent-bright">{eur(price * 3)}</p>
                </div>
              </div>
              <p className="mt-4 flex items-start gap-2 text-detail text-muted">
                <Icon name="info" size={15} className="mt-px shrink-0" />
                Renters also pay a service fee and protection on top of your daily rate — you receive the rate you set.
              </p>

              <div className="mt-8 border-t border-line pt-6">
                <h3 className="font-display text-lg font-semibold text-ink">Pickup &amp; delivery options</h3>
                <p className="mt-1 text-body text-muted">How can renters get this car?</p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${pickupEnabled ? 'border-ink' : 'border-line'}`}
                  >
                    <input
                      type="checkbox"
                      checked={pickupEnabled}
                      onChange={(e) => setPickupEnabled(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 text-body font-medium text-ink"><Icon name="pin" size={15} /> Customer pickup</span>
                      <span className="block text-detail text-muted">Renter comes to your pick-up area.</span>
                    </span>
                  </label>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${deliveryEnabled ? 'border-ink' : 'border-line'}`}
                  >
                    <input
                      type="checkbox"
                      checked={deliveryEnabled}
                      onChange={(e) => setDeliveryEnabled(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 text-body font-medium text-ink"><Icon name="car" size={15} /> Car delivery</span>
                      <span className="block text-detail text-muted">You deliver the car to the renter.</span>
                    </span>
                  </label>
                </div>

                {!pickupEnabled && !deliveryEnabled && (
                  <p className="mt-3 flex items-center gap-2 text-detail text-danger">
                    <Icon name="info" size={15} /> Offer at least one of pickup or delivery.
                  </p>
                )}

                {deliveryEnabled && (
                  <div className="mt-5 grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
                    <Labeled label="Delivery fee">
                      <select
                        value={deliveryFeeType}
                        onChange={(e) => setDeliveryFeeType(e.target.value as 'free' | 'fixed')}
                        className="input"
                      >
                        <option value="free">Free</option>
                        <option value="fixed">Fixed price</option>
                      </select>
                    </Labeled>
                    {deliveryFeeType === 'fixed' && (
                      <Labeled label="Fee amount">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={deliveryFeeAmount}
                          onChange={(e) => setDeliveryFeeAmount(e.target.value)}
                          className="input"
                        />
                      </Labeled>
                    )}
                    <Labeled label="Delivery area" hint="Shown to renters — not enforced automatically, use your own judgement per request.">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={deliveryRadiusKm}
                          onChange={(e) => setDeliveryRadiusKm(e.target.value)}
                          className="input"
                        />
                        <span className="shrink-0 text-detail text-muted">km radius</span>
                      </div>
                    </Labeled>
                    <div className="grid grid-cols-2 gap-4">
                      <Labeled label="Available from">
                        <input type="time" value={deliveryHoursStart} onChange={(e) => setDeliveryHoursStart(e.target.value)} className="input" />
                      </Labeled>
                      <Labeled label="Until">
                        <input type="time" value={deliveryHoursEnd} onChange={(e) => setDeliveryHoursEnd(e.target.value)} className="input" />
                      </Labeled>
                    </div>
                    <Labeled label="Delivery instructions (optional)" full>
                      <textarea
                        value={deliveryInstructions}
                        onChange={(e) => setDeliveryInstructions(e.target.value)}
                        rows={2}
                        placeholder="e.g. Please share the exact drop-off address after booking."
                        className="input resize-y"
                      />
                    </Labeled>
                  </div>
                )}
              </div>

              <div className="mt-8 border-t border-line pt-6">
                <h3 className="font-display text-lg font-semibold text-ink">Cancellation policy</h3>
                <p className="mt-1 text-body text-muted">
                  Renters see this before they book. If you ever cancel a trip yourself, the renter always gets a full refund.
                </p>
                <CancellationPolicyPicker value={cancellationPolicy} onChange={setCancellationPolicy} />
              </div>
            </div>
          )}

          {/* ---------------- Step 3: review ---------------- */}
          {step === 3 && (
            <div className="animate-fade-up">
              <h2 className="font-display text-xl font-semibold text-ink">Review your listing</h2>
              <p className="mt-1 text-body text-muted">Here’s how renters will see your car.</p>

              <div className="mt-6 overflow-hidden rounded-2xl border border-line">
                <div className="relative aspect-[16/9] bg-panel-2">
                  {cover && <img src={cover.preview} alt="" className="h-full w-full object-cover" />}
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
                      <p className="text-detail text-muted">
                        {form.trim ? `${form.trim} · ` : ''}{form.year} · {form.category}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-detail text-muted">
                        <Icon name="pin" size={13} /> {form.location}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-detail font-medium text-ink">
                      <Icon name="star" size={13} className="text-star" /> New
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <div className="flex flex-wrap gap-4 text-detail text-muted">
                      <span className="inline-flex items-center gap-1"><Icon name="seat" size={14} /> {form.seats}</span>
                      <span className="inline-flex items-center gap-1"><Icon name="bag" size={14} /> {form.luggage}</span>
                      <span className="inline-flex items-center gap-1"><Icon name="gear" size={14} /> {form.transmission}</span>
                      <span className="inline-flex items-center gap-1"><Icon name="gas" size={14} /> {form.fuel}</span>
                    </div>
                    <span className="text-ink">
                      <span className="text-lead font-semibold">{eur(price)}</span>
                      <span className="text-detail text-muted"> / day</span>
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
                <p className="mt-5 flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">
                  <Icon name="info" size={16} /> {submitError}
                </p>
              )}

              <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-accent-050 p-4 text-detail text-accent-700">
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
                disabled={!!submitting || publishDone}
                className={`btn btn-lg relative min-w-[11.5rem] overflow-hidden transition-all duration-500 ${
                  publishDone ? 'bg-accent text-white' : 'btn-accent-bright'
                } disabled:opacity-100`}
              >
                {submitting === 'published' && (
                  <span aria-hidden className="pointer-events-none absolute inset-0">
                    <span className="absolute inset-y-0 left-0 w-1/2 animate-[publish-sweep_1.1s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/45 to-transparent" />
                  </span>
                )}
                <span className="relative inline-flex items-center gap-2">
                  {publishDone ? (
                    <>
                      <span className="grid h-5 w-5 animate-scale-in place-items-center rounded-full bg-white/25"><Icon name="check" size={13} strokeWidth={3} /></span>
                      Sent — back to your fleet
                    </>
                  ) : submitting === 'published' ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Publishing…
                    </>
                  ) : (
                    <>Publish listing <Icon name="check" size={17} strokeWidth={2.5} /></>
                  )}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
