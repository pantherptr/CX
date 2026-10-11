import BookingPass from './ui/booking-pass';
import { useLocale } from '../lib/i18n';
import { eur } from '../lib/format';
import { uiLocale } from '../lib/i18n/uiLocale';

const d = (iso: string) => new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });
const dShort = (iso: string) => new Date(iso).toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short' }).toUpperCase().replace('.', '');

export interface BoardingPassData {
  reference: string;
  startDate: string;
  endDate: string;
  fulfillmentType: 'pickup' | 'delivery';
  deliveryAddress?: string | null;
  pickupLocation?: string | null;
  totalPrice: number;
  passengerName: string;
  hostName?: string;
  car: {
    year: number;
    make: string;
    model: string;
    seats?: number;
    transmission?: string;
    city: string;
    location?: string;
    lat?: number;
    lng?: number;
  };
}

/** The ticket shown the moment a booking is complete — and again on the trip page. */
export function BoardingPassCard({ b }: { b: BoardingPassData }) {
  const { t } = useLocale();
  const days = Math.max(1, Math.round((new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) / 86_400_000));
  const place = (b.fulfillmentType === 'delivery' ? b.deliveryAddress : b.pickupLocation || b.car.location) || b.car.city;
  const title = `${b.car.year} ${b.car.make} ${b.car.model}`;
  const coords = b.car.lat != null && b.car.lng != null ? `${b.car.lat.toFixed(4)}°, ${b.car.lng.toFixed(4)}°` : undefined;
  return (
    <BookingPass
      title={title}
      date={`${d(b.startDate)} → ${d(b.endDate)}`}
      welcome={t('Ready for\nthe road')}
      eyebrow={t('Your CX\nboarding pass')}
      words={[b.car.make, b.car.model]}
      notes={[b.car.city, `${t('Booking')} ${b.reference}`, place]}
      passenger={b.passengerName || t('Guest')}
      vehicle={`${b.car.make} ${b.car.model}`}
      reference={b.reference}
      pickup={dShort(b.startDate)}
      returnDate={dShort(b.endDate)}
      place={place}
      small={[
        [t('Days'), String(days)],
        [t('Seats'), String(b.car.seats ?? '—')],
        [t('Gearbox'), b.car.transmission ? (b.car.transmission === 'Automatic' ? 'AUTO' : 'MAN') : '—'],
      ]}
      total={eur(b.totalPrice)}
      coords={coords}
      host={b.hostName ? t('Hosted by {name}', { name: b.hostName }) : undefined}
      headline={t('I own the keys')}
      stamp={t('Confirmed')}
      labels={{
        boardingPass: t('Boarding pass'),
        passenger: t('Passenger'),
        vehicle: t('Vehicle'),
        reference: t('Reference'),
        pickup: t('Pick-up'),
        return: t('Return'),
        place: t('Place'),
        total: t('Total paid'),
        spot: t('Pick-up spot'),
        tearHere: t('Tear here'),
        tear: t('Tear off the stub'),
        reattach: t('Reattach the stub'),
        front: t('Front'),
        back: t('Boarding pass'),
      }}
    />
  );
}
