import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { SectionHead } from '../components/primitives';

const CATEGORIES = [
  'Before you book',
  'Booking & changes',
  'Pickup',
  'During your trip',
  'Returning & billing',
  'Account & hosting',
] as const;

type Category = (typeof CATEGORIES)[number];

const faqs: { q: string; a: string; category: Category }[] = [
  {
    category: 'Before you book',
    q: 'How does booking a car work?',
    a: 'Search by city and dates, choose a car, and either reserve instantly or send a request to the host. You\'ll see the full price — including service fee and protection — before you confirm anything.',
  },
  {
    category: 'Before you book',
    q: 'Is my trip insured?',
    a: 'Every booking includes a protection plan, priced as a percentage of your rental cost and shown as a separate line item at checkout — never hidden in the daily rate.',
  },
  {
    category: 'Before you book',
    q: 'What extras can I add to my trip?',
    a: 'At checkout you can add an additional driver or a child seat, each priced per day and shown as its own line in your total — nothing bundled in without you choosing it.',
  },
  {
    category: 'Before you book',
    q: 'What\'s the difference between "Best price" and "Stay flexible"?',
    a: '"Best price" is the default fare with free cancellation up to 24 hours before pick-up. "Stay flexible" costs a small per-day surcharge but lets you cancel any time right up until pick-up.',
  },
  {
    category: 'Booking & changes',
    q: 'What\'s the cancellation policy?',
    a: 'Standard bookings include free cancellation up to 24 hours before your trip starts. Bookings on the flexible fare can cancel any time before pick-up. Cancel from your trip details page and any payment is released back to you automatically.',
  },
  {
    category: 'Booking & changes',
    q: 'Can I change my trip dates after booking?',
    a: 'Yes — from Trip Details, use "Modify dates" any time before your trip starts. We re-check the car\'s availability for your new dates and recalculate the price before anything is confirmed.',
  },
  {
    category: 'Pickup',
    q: 'How do I coordinate pickup with my host?',
    a: 'Your Trip Details page shows the pickup location with a direct link to Maps, plus your host\'s typical response time. Message them directly from there to confirm exact timing.',
  },
  {
    category: 'During your trip',
    q: 'How do I contact my host or a renter?',
    a: 'Every booking opens a conversation in Messages, so you can coordinate pickup, ask questions, or share details without leaving CX.',
  },
  {
    category: 'Returning & billing',
    q: 'What happens when I return the car?',
    a: 'Once your return date passes, the trip automatically moves to Completed in My Trips — no action needed. Your itemised receipt (rental, fees, protection, any extras) stays available on Trip Details.',
  },
  {
    category: 'Account & hosting',
    q: 'How do I become a host?',
    a: 'Tap "List your car" from the menu, walk through the guided listing flow (vehicle details, photos, pricing, availability) and publish. Your car becomes visible to renters immediately.',
  },
  {
    category: 'Account & hosting',
    q: 'How and when do hosts get paid?',
    a: 'Payouts are tied to each completed trip. Hosts can review earnings and payout history from the Host Dashboard.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line py-1 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
        aria-expanded={open}
      >
        <span className="font-medium text-ink">{q}</span>
        <Icon
          name="chevronDown"
          size={18}
          className={`shrink-0 text-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className="grid overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="pb-4 text-[14.5px] leading-relaxed text-muted text-pretty">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function Help() {
  const [category, setCategory] = useState<Category | 'All'>('All');
  const visible = useMemo(
    () => (category === 'All' ? faqs : faqs.filter((f) => f.category === category)),
    [category],
  );

  return (
    <div>
      <section className="container-page pt-14">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow mb-3">Help & Support</p>
          <h1 className="font-display text-4xl font-semibold leading-[1.04] text-ink text-balance sm:text-5xl">
            How can we help?
          </h1>
          <p className="mt-5 text-[16px] leading-relaxed text-muted text-pretty">
            Answers organised by where you are in your trip — before booking, during, and after.
          </p>
        </div>
      </section>

      <section className="container-page mt-16">
        <div className="mx-auto max-w-2xl card p-6 sm:p-8">
          <SectionHead title="Frequently asked questions" />
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setCategory('All')} data-active={category === 'All'} className="chip">
              All
            </button>
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)} data-active={category === c} className="chip">
                {c}
              </button>
            ))}
          </div>
          <div className="mt-2">
            {visible.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      <section className="container-page mt-16 mb-24">
        <div className="mx-auto max-w-2xl rounded-[1.75rem] bg-ink px-6 py-12 text-center text-white sm:px-12">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/10">
            <Icon name="headset" size={22} />
          </span>
          <h2 className="mt-5 font-display text-2xl font-semibold">Still need help?</h2>
          <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-white/70">
            Start a conversation and we'll pick it up from there — same place you talk to hosts and
            renters, so nothing gets lost.
          </p>
          <Link to="/messages" className="btn btn-accent btn-lg mt-6">
            Message us <Icon name="arrowRight" size={17} />
          </Link>
        </div>
      </section>
    </div>
  );
}
