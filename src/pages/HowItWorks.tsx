import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { Img } from '../components/motion';
import { SectionHead } from '../components/primitives';
import { PageHero, FeatureGrid, CtaBand } from '../components/marketing';
import { Reveal } from '../components/motion';
import { unsplash } from '../lib/img';

const steps: { n: string; title: string; desc: string; icon: IconName; points: string[] }[] = [
  { n: '01', title: 'Find your car', icon: 'search', desc: 'Browse cars from trusted local hosts and filter by everything that matters.', points: ['Search by city, dates and car type', 'Filter on price, brand, features and rating', 'Read real reviews from past trips'] },
  { n: '02', title: 'Book your trip', icon: 'calendar', desc: 'Reserve instantly or send a request, then pay securely in a few taps.', points: ['Instant book on eligible cars', 'Free cancellation up to 24h before', 'Protection included on every trip'] },
  { n: '03', title: 'Hit the road', icon: 'key', desc: 'Meet your host or unlock remotely, enjoy the drive, then rate your experience.', points: ['Pick up from your host, or have the car delivered where offered', '24/7 roadside assistance', 'Rate your host after the trip'] },
];

const faqs = [
  { q: 'What do I need to rent a car?', a: 'A valid driving licence, a payment method and a verified CX account. Most cars require drivers to be at least 21 with two years of driving experience.' },
  { q: 'Is insurance included?', a: 'Yes. Every trip includes damage protection and 24/7 roadside assistance as standard, with the option to upgrade for extra peace of mind.' },
  { q: 'Can I cancel my booking?', a: 'Absolutely. You can cancel free of charge up to 24 hours before your trip starts, directly from your dashboard.' },
  { q: 'How does pick-up work?', a: 'You’ll arrange handover with your host — many offer delivery to your hotel or the airport. Details appear in your trip once booked.' },
];

const included: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'shield', title: 'Damage protection', desc: 'Every trip includes protection as standard, with upgrades if you want more.' },
  { icon: 'headset', title: '24/7 roadside help', desc: 'Support before, during and after your trip, whenever you need it.' },
  { icon: 'calendar', title: 'Free cancellation', desc: 'Cancel free of charge up to 24 hours before your trip starts.' },
  { icon: 'verified', title: 'Verified hosts', desc: 'Connect with verified hosts and transparent rental information.' },
];

export default function HowItWorks() {
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
        {/* Timeline — a real sequence, so the numbering earns its place. */}
        <div className="relative mt-14 space-y-6 sm:mt-20 sm:space-y-8">
          <div className="pointer-events-none absolute bottom-10 left-[1.65rem] top-10 hidden w-px bg-gradient-to-b from-accent/40 via-line to-transparent sm:block lg:hidden" aria-hidden="true" />
          {steps.map((s, i) => (
            <Reveal key={s.n}>
              <div className="grid items-center gap-6 overflow-hidden rounded-[1.75rem] border border-line bg-surface p-5 sm:gap-10 sm:p-8 lg:grid-cols-2 lg:p-10">
                <div className={i % 2 ? 'lg:order-2' : ''}>
                  <div className="flex items-center gap-4">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-050 text-accent-700">
                      <Icon name={s.icon} size={22} />
                    </span>
                    <span className="font-display text-5xl font-semibold leading-none text-line-strong">{s.n}</span>
                  </div>
                  <h2 className="mt-5 font-display text-2xl font-semibold text-ink sm:text-3xl">{s.title}</h2>
                  <p className="mt-2 text-copy leading-relaxed text-muted">{s.desc}</p>
                  <ul className="mt-5 space-y-3">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-start gap-3 text-body text-ink-soft">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-050 text-accent-700"><Icon name="check" size={12} strokeWidth={3} /></span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`overflow-hidden rounded-2xl ${i % 2 ? 'lg:order-1' : ''}`}>
                  <Img
                    src={unsplash(['photo-1552519507-da3b142c6e3d', 'photo-1503736334956-4c8f8e92946d', 'photo-1494976388531-d1058494cdd8'][i], 900)}
                    alt=""
                    className="aspect-[16/10] w-full object-cover"
                    fallback={<div className="aspect-[16/10] w-full bg-panel" />}
                  />
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Included on every trip */}
        <section className="mt-20 sm:mt-28">
          <SectionHead center eyebrow="Peace of mind" title="Included on every trip" />
          <div className="mt-9">
            <FeatureGrid items={included} cols={4} />
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
