import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { HowRoute, type RouteStep } from '../components/home/HowRoute';
import { SectionHead } from '../components/primitives';
import { PageHero, CtaBand } from '../components/marketing';
import { HostBento } from '../components/HostBento';
import { CarFan } from '../components/home/CarFan';

/** What a signed-out visitor sees at /list-your-car — the listing form
 *  itself needs an account, so instead of bouncing them straight to a
 *  login screen this explains the offer first. Every claim maps to a real
 *  part of the listing flow (see ListCar.tsx): you set the daily rate and
 *  receive it in full, pickup and/or delivery is your choice, and the
 *  listing is four short steps. */
const steps: RouteStep[] = [
  { icon: 'car', title: 'Your car', desc: 'Tell us the basics: make, model, year and what makes it special.', points: ['Pick it from the catalogue: make, model, version, colour', 'Add a few lines about what makes it yours'], image: '/home/road-vanquish-1000.webp', position: '50% 66%' },
  { icon: 'seal', title: 'Photos', desc: 'Show it at its best with clear, honest photos.', points: ['A side-profile cover photo, taken with our guide camera', 'More photos from every angle'], image: '/home/delivery-1122.webp', position: '50% 40%' },
  { icon: 'coin', title: 'Pricing', desc: 'Set your daily rate and choose pickup, delivery, or both.', points: ['You set the price and receive it in full', 'Mark the exact pick-up spot on the map'], image: '/home/faster-1100.webp', position: '78% 55%' },
  { icon: 'check', title: 'Review', desc: 'Check everything and publish when you are ready.', points: ['Our team looks at it first, usually within minutes', 'Then it is live for verified drivers'], image: '/home/book-1100.webp', position: '50% 50%' },
];

export default function HostLanding() {
  return (
    <div>
      <PageHero
        eyebrow="For car owners"
        title="Your car. Your rules. Your income."
        lead="Share the car you love with drivers who will treat it right. Set your own price, decide how it is handed over, and stay in control of every trip."
      >
        <Link to="/signup" className="btn btn-accent-bright btn-lg">
          Start listing <Icon name="arrowRight" size={17} />
        </Link>
        <Link to="/login" state={{ from: { pathname: '/list-your-car' } }} className="btn btn-secondary btn-lg">
          I already have an account
        </Link>
      </PageHero>

      <div className="container-page">
        <section className="mt-16 sm:mt-24">
          <SectionHead center eyebrow="Why host with CX" title="Made for owners who care about their car." />
          <div className="mt-9">
            <HostBento />
          </div>
        </section>

        <section className="mt-20 sm:mt-28">
          <SectionHead center eyebrow="Already on CX" title="Cars like yours, already earning." />
          <div className="mt-8"><CarFan /></div>
        </section>

        <section className="mt-20 sm:mt-28">
          <SectionHead center eyebrow="Simple by design" title="From garage to listed in minutes." />
          <div className="mt-10"><HowRoute steps={steps} /></div>
        </section>

        <section className="mb-24 mt-20 sm:mt-28">
          <CtaBand
            title="Ready to put your car to work?"
            text="Create your account and your listing can be live in minutes."
            primary={{ to: '/signup', label: 'Start listing' }}
            secondary={{ to: '/how-it-works', label: 'How CX works' }}
          />
        </section>
      </div>
    </div>
  );
}
