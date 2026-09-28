import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Img } from '../components/motion';
import { PremiumPageLoader } from '../components/PremiumLoader';
import { CancellationPolicyPicker } from '../components/CancellationPolicy';
import { useAuth } from '../lib/auth';
import { useApp } from '../lib/store';
import { useHostCars, updateCar } from '../lib/data/cars';
import { unsplash } from '../lib/img';
import type { CancellationPolicy } from '../lib/cancellationPolicy';

function Labeled({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-caption text-faint">{hint}</span>}
    </label>
  );
}

/**
 * Host-facing edit of an already-listed car. Previously the only way to
 * change a car after listing it was direct database access — no price
 * change, no pausing it, no updating its cancellation policy once picked
 * in the listing wizard. Reuses `useHostCars` (rather than a new fetch)
 * so "does this host actually own this car" falls out of the same list
 * their dashboard already trusts, instead of a second ownership check.
 */
export default function ManageCar() {
  const { carId } = useParams<{ carId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { toast } = useApp();
  const { cars, error: loadError } = useHostCars(session?.user.id);

  const car = (cars ?? []).find((c) => c.id === carId);

  const [price, setPrice] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [policy, setPolicy] = useState<CancellationPolicy>('moderate');
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryFeeType, setDeliveryFeeType] = useState<'free' | 'fixed'>('free');
  const [deliveryFeeAmount, setDeliveryFeeAmount] = useState('0');
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  // Owner Control Center states (0021_owner_control_center.sql) — a host
  // shouldn't be able to self-reinstate a listing an admin took down.
  const locked = car?.status === 'suspended' || car?.status === 'removed';

  // Seeds the form from the loaded car exactly once — after that the
  // fields are the user's own edits, not something a background refetch
  // should ever overwrite mid-edit.
  useEffect(() => {
    if (car && !initialized) {
      setPrice(String(car.pricePerDay));
      setStatus(car.status === 'published' ? 'published' : 'draft');
      setPolicy(car.cancellationPolicy ?? 'flexible');
      setPickupEnabled(car.pickupEnabled ?? true);
      setDeliveryEnabled(car.deliveryEnabled ?? false);
      setDeliveryFeeType(car.deliveryFeeType ?? 'free');
      setDeliveryFeeAmount(String(car.deliveryFeeAmount ?? 0));
      setInitialized(true);
    }
  }, [car, initialized]);

  const valid = Number(price) > 0 && (pickupEnabled || deliveryEnabled);

  const handleSave = async () => {
    if (!car || !valid) return;
    setSaving(true);
    const { error } = await updateCar(car.id, {
      pricePerDay: Number(price),
      status: locked ? undefined : status,
      cancellationPolicy: policy,
      pickupEnabled,
      deliveryEnabled,
      deliveryFeeType,
      deliveryFeeAmount: deliveryFeeType === 'fixed' ? Number(deliveryFeeAmount) || 0 : 0,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save changes', desc: error, icon: 'info' });
      return;
    }
    toast({ title: 'Listing updated', icon: 'checkCircle' });
    navigate('/host#cars');
  };

  if (cars === null) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <PremiumPageLoader size={90} />
      </div>
    );
  }

  if (loadError || !car) {
    return (
      <div className="container-page py-24 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-panel text-muted">
          <Icon name="car" size={26} />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
          {loadError ? 'Could not load this listing' : "This isn't one of your listings"}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-body text-muted">{loadError || 'It may have been removed, or it belongs to another host.'}</p>
        <Link to="/host#cars" className="btn btn-secondary btn-lg mt-6">Back to My Fleet</Link>
      </div>
    );
  }

  return (
    <div className="container-page py-8 sm:py-10">
      <Link to="/host#cars" className="inline-flex items-center gap-1.5 text-detail font-medium text-muted transition-colors hover:text-ink">
        <Icon name="chevronLeft" size={16} /> My Fleet
      </Link>

      <div className="mt-4 flex items-center gap-4">
        <Img
          src={unsplash(car.images[0], 300)}
          alt=""
          className="h-16 w-24 shrink-0 rounded-xl object-cover"
          fallback={<span className="grid h-16 w-24 shrink-0 place-items-center rounded-xl bg-panel text-muted"><Icon name="car" size={22} /></span>}
        />
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{car.make} {car.model}</h1>
          <p className="mt-0.5 text-body text-muted">{car.year} · {car.city}</p>
        </div>
      </div>

      <div className="mt-8 max-w-2xl space-y-8">
        {/* Status */}
        <section className="card p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Listing status</h2>
          {locked ? (
            <p className="mt-2 flex items-start gap-2.5 rounded-xl bg-danger/10 p-4 text-detail leading-relaxed text-danger">
              <Icon name="info" size={16} className="mt-0.5 shrink-0" />
              This listing was {car!.status} by CX and can't be republished from here. Contact support through the Help centre if you think this is a mistake.
            </p>
          ) : (
            <>
              <p className="mt-1 text-body text-muted">A paused listing stays saved but can't be found or booked.</p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setStatus('published')}
                  className={`flex-1 rounded-xl border p-4 text-left transition-colors ${status === 'published' ? 'border-ink bg-panel' : 'border-line hover:border-line-strong'}`}
                >
                  <span className="flex items-center gap-2 font-medium text-ink"><span className="h-2 w-2 rounded-full bg-accent" /> Published</span>
                  <span className="mt-1 block text-detail text-muted">Visible and bookable on CX.</span>
                </button>
                <button
                  onClick={() => setStatus('draft')}
                  className={`flex-1 rounded-xl border p-4 text-left transition-colors ${status === 'draft' ? 'border-ink bg-panel' : 'border-line hover:border-line-strong'}`}
                >
                  <span className="flex items-center gap-2 font-medium text-ink"><span className="h-2 w-2 rounded-full bg-faint" /> Paused</span>
                  <span className="mt-1 block text-detail text-muted">Hidden from search and browse.</span>
                </button>
              </div>
            </>
          )}
        </section>

        {/* Price */}
        <section className="card p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Price</h2>
          <p className="mt-1 text-body text-muted">Renters also pay a service fee and protection on top — you receive the rate you set.</p>
          <div className="mt-4 max-w-[180px]">
            <Labeled label="Price per day">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">€</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="input !pl-7"
                />
              </div>
            </Labeled>
          </div>
        </section>

        {/* Cancellation policy */}
        <section className="card p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Cancellation policy</h2>
          <p className="mt-1 text-body text-muted">
            Applies to new bookings only — trips already booked keep the policy shown when the renter paid.
          </p>
          <CancellationPolicyPicker value={policy} onChange={setPolicy} />
        </section>

        {/* Pickup & delivery */}
        <section className="card p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Pickup &amp; delivery</h2>
          <p className="mt-1 text-body text-muted">How can renters get this car?</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${pickupEnabled ? 'border-ink' : 'border-line'}`}>
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
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${deliveryEnabled ? 'border-ink' : 'border-line'}`}>
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
                <select value={deliveryFeeType} onChange={(e) => setDeliveryFeeType(e.target.value as 'free' | 'fixed')} className="input">
                  <option value="free">Free</option>
                  <option value="fixed">Fixed price</option>
                </select>
              </Labeled>
              {deliveryFeeType === 'fixed' && (
                <Labeled label="Fee amount">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">€</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={deliveryFeeAmount}
                      onChange={(e) => setDeliveryFeeAmount(e.target.value)}
                      className="input !pl-7"
                    />
                  </div>
                </Labeled>
              )}
            </div>
          )}
        </section>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={!valid || saving} className="btn btn-primary btn-lg disabled:opacity-60">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <Link to="/host#cars" className="btn btn-secondary btn-lg">Cancel</Link>
          {!valid && <span className="text-detail text-danger">{Number(price) > 0 ? '' : 'Enter a price above €0.'}</span>}
        </div>
      </div>
    </div>
  );
}
