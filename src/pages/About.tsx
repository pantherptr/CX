import { Img } from '../components/motion';
import { SectionHead } from '../components/primitives';
import { PostMarquee, type MarqueeQuote } from '../components/home/PostMarquee';
import { INVESTIGATORS } from '../lib/investigations';
import { PageHero, CtaBand } from '../components/marketing';
import { Reveal } from '../components/motion';
import { useLocale } from '../lib/i18n';
import { ProtectionIcon, type ProtectionKind } from '../components/home/ProtectionIcon';
import { catalogue } from '../lib/catalogue';
import { CxFlagC } from '../components/CxFlag';

const difference: { icon: ProtectionKind; title: string; desc: string }[] = [
  { icon: 'check', title: 'Curated, not crowded', desc: 'Every listing is reviewed before it goes live, so the fleet stays worth driving.' },
  { icon: 'pin', title: 'Delivered to your door', desc: 'Hosts can bring the car to you, so your trip starts the moment you land.' },
  { icon: 'broadcast', title: 'A community, not a counter', desc: 'Real hosts, real drivers, and SIGNAL to share the moments in between.' },
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
  const stats = [
    { v: '24/7', l: 'Support' },
    { v: String(catalogue.vehicles), l: 'Cars listed' },
    { v: String(catalogue.hosts), l: 'Verified hosts' },
    { v: String(catalogue.cities), l: 'Cities and growing' },
  ];
  return (
    <div>
      <PageHero
        eyebrow="Our story"
        title="The premium way to move around the world."
        lead="CX began in Milan with a simple idea: renting a car should feel as premium as the cars themselves. Today we connect drivers with trusted local hosts all over the world — and we’re just getting started."
      />
      <section className="container-page -mt-8 sm:-mt-12">
        <Reveal>
          <div className="overflow-hidden rounded-[1.75rem] border border-line shadow-card">
            <Img
              src="/home/faster-1100.webp"
              alt=""
              className="aspect-[4/3] w-full object-cover sm:aspect-[21/9]"
              style={{ objectPosition: '70% 62%' }}
              fallback={<div className="aspect-[21/9] w-full bg-panel" />}
            />
          </div>
        </Reveal>
      </section>

      {/* The line, and the numbers */}
      <section className="container-page mt-16">
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
                <dd className="font-display text-[2.6rem] font-semibold leading-none tracking-[-0.03em] text-accent-700 tabular-nums sm:text-[3.2rem]">{s.v}</dd>
                <dt className="mt-2 text-detail text-ink-soft">{t(s.l)}</dt>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      {/* What makes CX different: the heading on the left, three plain rows on the right */}
      <section className="container-page mt-24">
        <div className="grid gap-9 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow mb-3">{t('The CX difference')}</p>
            <h2 className="font-display text-[2.05rem] font-semibold leading-[1.05] tracking-[-0.028em] text-ink text-balance sm:text-[2.9rem]">
              {t('A rental that feels like it was made for you.')}
            </h2>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {difference.map((d) => (
              <li key={d.title} className="flex items-start gap-4 py-6 sm:gap-5 sm:py-7">
                <ProtectionIcon kind={d.icon} />
                <div className="min-w-0 pt-1">
                  <h3 className="font-display text-[1.2rem] font-semibold leading-tight text-ink">{t(d.title)}</h3>
                  <p className="mt-1.5 text-body leading-relaxed text-ink-soft">{t(d.desc)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Values: four short lines, no boxes */}
      <section className="container-page mt-24">
        <SectionHead eyebrow="What we stand for" title="Principles that guide us" />
        <div className="mt-9 grid gap-x-12 gap-y-9 sm:grid-cols-2">
          {values.map((v) => (
            <div key={v.title} className="flex items-start gap-4 border-t border-line pt-6">
              <ProtectionIcon kind={v.icon} size="sm" />
              <div className="min-w-0">
                <h3 className="font-display text-[1.1rem] font-semibold text-ink">{t(v.title)}</h3>
                <p className="mt-1 text-body leading-relaxed text-ink-soft">{t(v.desc)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The people who answer */}
      <section className="mt-24 overflow-hidden">
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
