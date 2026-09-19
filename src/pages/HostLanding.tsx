import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { SectionHead } from '../components/primitives';
import { PageHero, FeatureGrid, CtaBand } from '../components/marketing';
import { Reveal } from '../components/motion';

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
            <FeatureGrid
              cols={4}
              items={[
                { icon: 'euro', title: 'You set the rate', desc: 'Choose your daily price. Renters pay the service fee on top — you receive the rate you set.' },
                { icon: 'pin', title: 'Pickup or delivery', desc: 'Offer pickup, delivery with your own fee, or both. You decide how it works for you.' },
                { icon: 'shield', title: 'Protected trips', desc: 'Protection is included on every trip, and support is there when you need it.' },
                { icon: 'sparkles', title: 'A stage on SIGNAL', desc: 'Verified hosts can show their car to the CX community and reach renters who care.' },
              ]}
            />
          </div>
        </section>

        <section className="mt-20 sm:mt-28">
          <SectionHead center eyebrow="Simple by design" title="List in four short steps." />
          <ol className="mx-auto mt-9 grid max-w-4xl gap-3 sm:grid-cols-2 sm:gap-5">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 70}>
                <li className="flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-050 text-accent-700">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <div>
                    <p className="text-label font-semibold uppercase tracking-[0.14em] text-faint">Step {i + 1}</p>
                    <h3 className="mt-1 font-display text-lg font-semibold text-ink">{s.title}</h3>
                    <p className="mt-1 text-detail leading-relaxed text-muted">{s.desc}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
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
