import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { SectionHead } from '../components/primitives';
import { PageHero, CtaBand } from '../components/marketing';
import { Reveal } from '../components/motion';
import { HostBento } from '../components/HostBento';
import { CarFan } from '../components/home/CarFan';

/** What a signed-out visitor sees at /list-your-car — the listing form
 *  itself needs an account, so instead of bouncing them straight to a
 *  login screen this explains the offer first. Every claim maps to a real
 *  part of the listing flow (see ListCar.tsx): you set the daily rate and
 *  receive it in full, pickup and/or delivery is your choice, and the
 *  listing is four short steps. */
const steps: { title: string; desc: string; icon: IconName }[] = [
  { title: 'Your car', icon: 'car', desc: 'Tell us the basics: make, model, year and what makes it special.' },
  { title: 'Photos', icon: 'camera', desc: 'Show it at its best with clear, honest photos.' },
  { title: 'Pricing', icon: 'euro', desc: 'Set your daily rate and choose pickup, delivery, or both.' },
  { title: 'Review', icon: 'checkCircle', desc: 'Check everything and publish when you are ready.' },
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
          <Reveal>
            <ol className="relative mx-auto mt-10 max-w-md sm:grid sm:max-w-5xl sm:grid-cols-4 sm:gap-6">
              {steps.map((s, i) => (
                <li key={s.title} className="relative flex gap-4 pb-9 last:pb-0 sm:block sm:pb-0 sm:text-center">
                  {i < steps.length - 1 && (
                    <span aria-hidden="true" className="absolute left-[21px] top-12 h-[calc(100%-2.75rem)] w-px bg-line-strong sm:left-[calc(50%+34px)] sm:top-[21px] sm:h-px sm:w-[calc(100%-68px)]" />
                  )}
                  <span className="relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-050 text-accent-700 ring-4 ring-bg sm:mx-auto">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <div className="min-w-0 pt-0.5 sm:mt-4">
                    <p className="text-label font-semibold tracking-[0.14em] text-faint">0{i + 1}</p>
                    <h3 className="mt-0.5 font-display text-[1.2rem] font-semibold text-ink">{s.title}</h3>
                    <p className="mt-1 text-detail leading-relaxed text-muted">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
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
