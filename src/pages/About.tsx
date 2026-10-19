import { NumberFlow } from '../components/NumberFlow';
import { ScrollWords } from '../components/ScrollWords';
import { StackCards } from '../components/StackCards';
import { SectionHead } from '../components/primitives';
import { PostMarquee, type MarqueeQuote } from '../components/home/PostMarquee';
import { INVESTIGATORS } from '../lib/investigations';
import { PageHero, CtaBand } from '../components/marketing';
import { Reveal } from '../components/motion';
import { useLocale } from '../lib/i18n';
import { ProtectionIcon, type ProtectionKind } from '../components/home/ProtectionIcon';
import { catalogue } from '../lib/catalogue';
import { CxFlagC } from '../components/CxFlag';
import { HowRoute, type RouteStep } from '../components/home/HowRoute';

const difference: RouteStep[] = [
  { icon: 'check', title: 'Curated, not crowded', desc: 'Every listing is reviewed before it goes live, so the fleet stays worth driving.', points: ['Our team looks at every car first', 'Verified hosts, verified drivers'], image: '/home/road-vanquish-1000.webp', position: '50% 66%' },
  { icon: 'pin', title: 'Delivered to your door', desc: 'Hosts can bring the car to you, so your trip starts the moment you land.', points: ['Choose delivery at checkout', 'Or pick it up from your host'], image: '/home/delivery-1122.webp', position: '50% 40%' },
  { icon: 'broadcast', title: 'A community, not a counter', desc: 'Real hosts, real drivers, and SIGNAL to share the moments in between.', points: ['Share your trip on SIGNAL', 'Real stories from real drivers'], image: '/home/faster-1100.webp', position: '78% 55%' },
];

const values: { icon: ProtectionKind; title: string; desc: string }[] = [
  { icon: 'shield', title: 'Trust first', desc: 'Every host and vehicle is verified. Safety and transparency underpin every decision we make.' },
  { icon: 'seal', title: 'Quality obsessed', desc: 'We curate a fleet worth driving and hold every listing to a genuinely premium standard.' },
  { icon: 'pin', title: 'Local at heart', desc: 'We empower car owners in every city to earn from what they already own.' },
  { icon: 'growth', title: 'Built to last', desc: 'Shared cars mean fewer cars. Better use of what exists is better for everyone.' },
];

const TEAM_LINES = [
  'Every case is read by a real person.',
  'You describe the problem once, we take it from there.',
  'Payments and contact details stay inside CX, always.',
  'We follow your case until it is closed.',
  'A name and a face behind every answer.',
  'Writing to us is the safest way to sort anything out.',
];
const TEAM_QUOTES: MarqueeQuote[] = TEAM_LINES.map((text, i) => ({ name: INVESTIGATORS[i % INVESTIGATORS.length].name, place: 'CX Investigative', avatar: INVESTIGATORS[i % INVESTIGATORS.length].src, text }));

export default function About() {
  const { t } = useLocale();
  const stats: { v: number | string; l: string; suffix?: string }[] = [
    { v: '24/7', l: 'Support' },
    { v: catalogue.vehicles, l: 'Cars listed' },
    { v: catalogue.hosts, l: 'Verified hosts' },
    { v: catalogue.cities, l: 'Cities and growing' },
  ];
  return (
    <div>
      <PageHero
        eyebrow="Our story"
        title="The premium way to move around the world."
        lead="CX began in Milan with a simple idea: renting a car should feel as premium as the cars themselves. Today we connect drivers with trusted local hosts all over the world — and we’re just getting started."
      />

      {/* The manifesto: the words light up as you scroll */}
      <section className="container-page mt-20 sm:mt-28">
        <p className="eyebrow text-center">{t('What we believe')}</p>
        <ScrollWords
          className="mx-auto mt-6 max-w-3xl text-center font-display text-[1.9rem] font-semibold leading-[1.18] tracking-[-0.02em] text-ink text-balance sm:text-[3rem]"
          text={t('A car is only worth something when it is on the road. We connect the people who own great cars with the people who want to drive them, with trust built in at every step.')}
        />
      </section>

      {/* The line, and the numbers (they count up when they come into view) */}
      <section className="container-page mt-20 sm:mt-28">
        <Reveal>
          <figure className="mx-auto flex max-w-xl flex-col items-center text-center">
            <CxFlagC className="h-44 w-auto text-ink sm:h-60" title="CX" />
            <figcaption className="mt-5 font-display text-2xl font-semibold text-ink text-balance">
              {t('Wherever there’s a road, there’s a CX.')}
            </figcaption>
          </figure>
        </Reveal>
        <Reveal>
          <dl className="mx-auto mt-12 grid max-w-4xl grid-cols-2 overflow-hidden rounded-3xl border border-line bg-surface lg:grid-cols-4">
            {stats.map((s, i) => (
              <div key={s.l} className={`px-5 py-7 text-center sm:py-9 ${i % 2 === 1 ? 'border-l border-line' : ''} ${i > 1 ? 'border-t border-line lg:border-t-0' : ''} ${i > 0 ? 'lg:border-l' : ''}`}>
                <dd className="font-display text-[2.6rem] font-semibold leading-none tracking-[-0.03em] text-accent-700 tabular-nums sm:text-[3.2rem]">
                  {typeof s.v === 'number' ? <NumberFlow scrollTrigger value={s.v} format={{ useGrouping: false }} /> : s.v}
                </dd>
                <dt className="mt-2 text-detail text-ink-soft">{t(s.l)}</dt>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      {/* What makes CX different: the same route you scroll as in How it works */}
      <section className="container-page mt-24 sm:mt-32">
        <SectionHead center eyebrow="The CX difference" title="A rental that feels like it was made for you." />
        <div className="mt-10">
          <HowRoute steps={difference} />
        </div>
      </section>

      {/* Principles: cards that pile up */}
      <section className="container-page mt-24 sm:mt-32">
        <SectionHead eyebrow="What we stand for" title="Principles that guide us" />
        <div className="mx-auto mt-10 max-w-2xl">
          <StackCards
            cards={values.map((v, i) => ({
              key: v.title,
              n: `0${i + 1}`,
              title: t(v.title),
              desc: t(v.desc),
              icon: <ProtectionIcon kind={v.icon} />,
            }))}
          />
        </div>
      </section>

      {/* The people who answer */}
      <section className="mt-24 overflow-hidden sm:mt-32">
        <div className="container-page"><SectionHead center eyebrow="CX Investigative" title="The people who answer you." /></div>
        <div className="mt-8"><PostMarquee quotes={TEAM_QUOTES} /></div>
      </section>

      <section className="container-page mb-24 mt-24">
        <CtaBand
          title="Join the journey."
          text="Whether you’re driving or hosting, there’s a place for you at CX."
          primary={{ to: '/browse', label: 'Find a car' }}
          secondary={{ to: '/list-your-car', label: 'List your car' }}
        />
      </section>
    </div>
  );
}
