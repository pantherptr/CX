import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { SectionHead } from '../components/primitives';
import { unsplash } from '../lib/img';

const steps: { n: string; title: string; desc: string; icon: IconName; points: string[] }[] = [
  { n: '01', title: 'Find your car', icon: 'search', desc: 'Browse thousands of cars from trusted local hosts and filter by everything that matters.', points: ['Search by city, dates and car type', 'Filter on price, brand, features and rating', 'Read real reviews from past trips'] },
  { n: '02', title: 'Book your trip', icon: 'calendar', desc: 'Reserve instantly or send a request, then pay securely in a few taps.', points: ['Instant book on eligible cars', 'Free cancellation up to 24h before', 'Protection included on every trip'] },
  { n: '03', title: 'Hit the road', icon: 'key', desc: 'Meet your host or unlock remotely, enjoy the drive, then rate your experience.', points: ['Contactless or in-person handover', '24/7 roadside assistance', 'Rate your host after the trip'] },
];

const faqs = [
  { q: 'What do I need to rent a car?', a: 'A valid driving licence, a payment method and a verified Velora account. Most cars require drivers to be at least 21 with two years of driving experience.' },
  { q: 'Is insurance included?', a: 'Yes. Every trip includes damage protection and 24/7 roadside assistance as standard, with the option to upgrade for extra peace of mind.' },
  { q: 'Can I cancel my booking?', a: 'Absolutely. You can cancel free of charge up to 24 hours before your trip starts, directly from your dashboard.' },
  { q: 'How does pick-up work?', a: 'You’ll arrange handover with your host — many offer delivery to your hotel or the airport. Details appear in your trip once booked.' },
];

export default function HowItWorks() {
  const [open, setOpen] = useState(0);
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow mb-3">How it works</p>
        <h1 className="font-display text-4xl font-semibold leading-[1.05] text-ink text-balance sm:text-5xl">Renting a car, reimagined.</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted text-pretty">From first search to final drop-off, every step is designed to be simple, transparent and completely trustworthy.</p>
        <div className="mt-7 flex justify-center gap-3">
          <Link to="/browse" className="btn btn-primary btn-lg">Find a car <Icon name="arrowRight" size={17} /></Link>
          <Link to="/list-your-car" className="btn btn-secondary btn-lg">Become a host</Link>
        </div>
      </div>

      <div className="mt-16 space-y-6">
        {steps.map((s, i) => (
          <div key={s.n} className="card grid items-center gap-8 overflow-hidden p-6 sm:p-8 lg:grid-cols-2">
            <div className={i % 2 ? 'lg:order-2' : ''}>
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white"><Icon name={s.icon} size={22} /></span>
                <span className="font-display text-4xl font-semibold text-panel-2">{s.n}</span>
              </div>
              <h2 className="mt-5 font-display text-2xl font-semibold text-ink">{s.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.desc}</p>
              <ul className="mt-5 space-y-2.5">
                {s.points.map((p) => (
                  <li key={p} className="flex items-center gap-2.5 text-[14.5px] text-ink-soft">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-050 text-accent"><Icon name="check" size={12} strokeWidth={3} /></span>{p}
                  </li>
                ))}
              </ul>
            </div>
            <div className={`overflow-hidden rounded-2xl ${i % 2 ? 'lg:order-1' : ''}`}>
              <img src={unsplash(['photo-1552519507-da3b142c6e3d', 'photo-1503736334956-4c8f8e92946d', 'photo-1494976388531-d1058494cdd8'][i], 800)} alt="" className="aspect-[16/10] w-full object-cover" />
            </div>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <section className="mx-auto mt-20 max-w-3xl">
        <SectionHead center eyebrow="Questions" title="Everything you need to know" />
        <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-surface">
          {faqs.map((f, i) => (
            <div key={f.q}>
              <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left">
                <span className="text-[15.5px] font-medium text-ink">{f.q}</span>
                <Icon name="chevronDown" size={20} className={`shrink-0 text-muted transition-transform ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && <p className="animate-fade-in px-6 pb-5 text-[14.5px] leading-relaxed text-muted">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
