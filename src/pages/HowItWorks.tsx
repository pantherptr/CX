import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useLocale } from '../lib/i18n';
import { HowRoute, type RouteStep } from '../components/home/HowRoute';
import { ProtectionIcon, type ProtectionKind } from '../components/home/ProtectionIcon';
import { FindPoster } from '../components/home/scenes/FindPoster';
import { SectionHead } from '../components/primitives';
import { PageHero, CtaBand } from '../components/marketing';

const steps: RouteStep[] = [
  { icon: 'check', title: 'Find your car', desc: 'Browse cars from trusted local hosts and filter by everything that matters.', points: ['Search by city, dates and car type', 'Filter by price, brand and features', 'See where each car is parked on the map'], scene: <FindPoster /> },
  { icon: 'seal', title: 'Book your trip', desc: 'Reserve instantly or send a request, then pay securely in a few taps.', points: ['Instant book on eligible cars', 'Clear cancellation policy, shown before you pay', 'Protection included on every trip'], image: '/home/book-1100.webp', position: '50% 50%' },
  { icon: 'car', title: 'Hit the road', desc: 'Meet your host, enjoy the drive, then hand the keys back.', points: ['Both scan the CX Pass: that starts the trip', '24/7 roadside assistance', 'Scan again on return: the deposit is released'], image: '/home/road-cx-1100.webp', position: '50% 30%' },
  { icon: 'pin', title: 'Or have it brought to you', desc: 'Prefer not to collect? Choose delivery and the car arrives right at your door.', points: ['Choose delivery at checkout, to the address you pick', 'Hosts set their own delivery fee — you see it before you pay', 'Prefer to collect? Pick up from your host instead'], image: '/home/faster-1100.webp', position: '78% 55%' },
];

const faqs = [
  { q: 'What do I need to rent a car?', a: 'A valid driving licence, a payment method and a verified CX account. Most cars require drivers to be at least 21 with two years of driving experience.' },
  { q: 'Is insurance included?', a: 'Yes. Every trip includes damage protection and 24/7 roadside assistance as standard, with the option to upgrade for extra peace of mind.' },
  { q: 'Can I cancel my booking?', a: 'Yes, from your dashboard. How much you get back depends on the cancellation policy the host chose (Flexible, Moderate or Strict), which is shown before you pay. If a host cancels, you always get a full refund.' },
  { q: 'How does pick-up work?', a: 'You’ll arrange handover with your host — many offer delivery to your hotel or the airport. Details appear in your trip once booked.' },
];

const included: { icon: ProtectionKind; title: string; desc: string }[] = [
  { icon: 'shield', title: 'Damage protection', desc: 'Every trip includes protection as standard, with upgrades if you want more.' },
  { icon: 'headset', title: '24/7 roadside help', desc: 'Support before, during and after your trip, whenever you need it.' },
  { icon: 'seal', title: 'Clear cancellation terms', desc: 'Every car shows its cancellation policy before you pay. If a host cancels, you are fully refunded.' },
  { icon: 'check', title: 'Verified hosts', desc: 'Connect with verified hosts and transparent rental information.' },
];

export default function HowItWorks() {
  const { t } = useLocale();
  const [open, setOpen] = useState(0);
  return (
    <div>
      <PageHero
        eyebrow="How it works"
        title="Renting a car, reimagined."
        lead="From first search to final drop-off, every step is designed to be simple, transparent and completely trustworthy."
      >
        <Link to="/browse" className="btn btn-primary btn-lg">Find a car <Icon name="arrowRight" size={17} /></Link>
        <Link to="/list-your-car" className="btn btn-secondary btn-lg">Become a host</Link>
      </PageHero>

      <div className="container-page">
        {/* the route: scroll draws the line, the number rolls, each step lifts in */}
        <section className="mt-16 sm:mt-24">
          <HowRoute steps={steps} />
        </section>

        {/* Included on every trip */}
        <section className="mt-20 sm:mt-28">
          <SectionHead center eyebrow="Peace of mind" title="Included on every trip" />
          <div className="mt-9 grid gap-x-12 gap-y-7 sm:grid-cols-2">
            {included.map((it) => (
              <div key={it.title} className="flex items-start gap-4 border-t border-line pt-6">
                <ProtectionIcon kind={it.icon} size="sm" />
                <div className="min-w-0">
                  <h3 className="font-display text-[1.1rem] font-semibold text-ink">{t(it.title)}</h3>
                  <p className="mt-1 text-body leading-relaxed text-ink-soft">{t(it.desc)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto mt-20 max-w-3xl sm:mt-28">
          <SectionHead center eyebrow="Questions" title="Everything you need to know" />
          <div className="mt-8 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {faqs.map((f, i) => (
              <div key={f.q}>
                <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6" aria-expanded={open === i}>
                  <span className="text-copy font-medium text-ink">{f.q}</span>
                  <Icon name="chevronDown" size={20} className={`shrink-0 text-muted transition-transform ${open === i ? 'rotate-180' : ''}`} />
                </button>
                {open === i && <p className="animate-fade-in px-5 pb-5 text-body leading-relaxed text-muted sm:px-6">{f.a}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="mb-24 mt-20 sm:mt-28">
          <CtaBand
            title="Ready when you are."
            text="Find the car that fits your journey — or share your own with drivers who will treat it right."
            primary={{ to: '/browse', label: 'Find a car' }}
            secondary={{ to: '/list-your-car', label: 'List your car' }}
          />
        </section>
      </div>
    </div>
  );
}
