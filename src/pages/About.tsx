import { Icon, type IconName } from '../components/Icon';
import { Img } from '../components/motion';
import { SectionHead } from '../components/primitives';
import { PostMarquee, type MarqueeQuote } from '../components/home/PostMarquee';
import { INVESTIGATORS } from '../lib/investigations';
import { PageHero, FeatureGrid, CtaBand } from '../components/marketing';
import { Reveal } from '../components/motion';
import { unsplash, avatar } from '../lib/img';
import { catalogue } from '../lib/catalogue';
import { CxFlagC } from '../components/CxFlag';

const values: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'shield', title: 'Trust first', desc: 'Every host and vehicle is verified. Safety and transparency underpin every decision we make.' },
  { icon: 'sparkles', title: 'Quality obsessed', desc: 'We curate a fleet worth driving and hold every listing to a genuinely premium standard.' },
  { icon: 'globe', title: 'Local at heart', desc: 'We empower car owners in every city to earn from what they already own.' },
  { icon: 'leaf', title: 'Built to last', desc: 'Shared cars mean fewer cars. Better use of what exists is better for everyone.' },
];

const team = [
  { name: 'Sofia Marchetti', role: 'Co-founder & CEO', n: 24 },
  { name: 'Michael Ferraro', role: 'Co-founder & CTO', n: 12 },
  { name: 'Giulia Bianchi', role: 'Head of Trust', n: 45 },
  { name: 'Lukas Weber', role: 'Head of Operations', n: 33 },
];

const TEAM_LINES = [
  'Every case is read by a real person.',
  'You describe the problem once, we take it from there.',
  'Payments and contact details stay inside CX, always.',
  'We follow your case until it is closed.',
  'A name and a face behind every answer.',
  'Writing to us is the safest way to sort anything out.',
];
const TEAM_QUOTES: MarqueeQuote[] = TEAM_LINES.map((text, i) => ({ name: INVESTIGATORS[i % INVESTIGATORS.length].name, place: 'CX Investigations', avatar: INVESTIGATORS[i % INVESTIGATORS.length].src, text }));

export default function About() {
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
              src={unsplash('photo-1503376780353-7e6692767b70', 1600)}
              alt=""
              className="aspect-[16/9] w-full object-cover sm:aspect-[21/9]"
              fallback={<div className="aspect-[21/9] w-full bg-panel" />}
            />
          </div>
        </Reveal>
      </section>

      {/* Stats */}
      <section className="container-page mt-16">
        <Reveal>
          <figure className="mx-auto flex max-w-xl flex-col items-center text-center">
            <CxFlagC className="h-56 w-auto text-ink sm:h-72" title="CX" />
            <figcaption className="mt-5 font-display text-2xl font-semibold text-ink text-balance">
              Wherever there’s a road, there’s a CX.
            </figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="container-page mt-16">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { v: '24/7', l: 'Support' },
            { v: String(catalogue.vehicles), l: 'Cars listed' },
            { v: String(catalogue.hosts), l: 'Verified hosts' },
            { v: String(catalogue.cities), l: 'Cities and growing' },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl border border-line bg-surface p-5 text-center sm:p-6">
              <p className="flex items-center justify-center gap-1.5 font-display text-3xl font-semibold tabular-nums text-ink sm:text-4xl">
                {s.v}
              </p>
              <p className="mt-1 text-caption text-muted sm:text-detail">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What makes CX different */}
      <section className="container-page mt-24">
        <SectionHead center eyebrow="The CX difference" title="A rental that feels like it was made for you." />
        <div className="mt-9">
          <FeatureGrid
            items={[
              { icon: 'verified', title: 'Curated, not crowded', desc: 'Every listing is reviewed before it goes live, so the fleet stays worth driving.' },
              { icon: 'pin', title: 'Delivered to your door', desc: 'Hosts can bring the car to you, so your trip starts the moment you land.' },
              { icon: 'heart', title: 'A community, not a counter', desc: 'Real hosts, real drivers, and SIGNAL to share the moments in between.' },
            ]}
          />
        </div>
      </section>

      {/* Values */}
      <section className="container-page mt-24">
        <SectionHead eyebrow="What we stand for" title="Principles that guide us" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {values.map((v) => (
            <div key={v.title} className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-col sm:gap-0 sm:p-6">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-050 text-accent-700"><Icon name={v.icon} size={22} /></span>
              <div className="sm:mt-4">
              <h3 className="font-medium text-ink">{v.title}</h3>
              <p className="mt-1 text-detail leading-relaxed text-muted">{v.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Team */}
      <section className="container-page mt-24">
        <SectionHead eyebrow="The people" title="Meet the team" />
        <div className="mt-9 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {team.map((t) => (
            <div key={t.name} className="card overflow-hidden text-center">
              <Img
                src={avatar(t.n)}
                alt={t.name}
                className="aspect-square w-full object-cover"
                fallback={<span className="grid aspect-square w-full place-items-center bg-panel text-muted"><Icon name="user" size={28} /></span>}
              />
              <div className="p-4">
                <p className="font-medium text-ink">{t.name}</p>
                <p className="text-detail text-muted">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mt-24 overflow-hidden">
        <div className="container-page"><SectionHead center eyebrow="CX Investigations" title="The people who answer you." /></div>
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
