import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { SectionHead } from '../components/primitives';
import { unsplash, avatar } from '../lib/img';

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

export default function About() {
  return (
    <div>
      {/* Hero */}
      <section className="container-page pt-14">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow mb-3">Our story</p>
          <h1 className="font-display text-4xl font-semibold leading-[1.04] text-ink text-balance sm:text-[3.4rem]">
            The premium way to move across Europe.
          </h1>
          <p className="mt-5 text-[16.5px] leading-relaxed text-muted text-pretty">
            Velora began in Milan with a simple idea: renting a car should feel as premium as the cars themselves.
            Today we connect tens of thousands of drivers with trusted local hosts in seven cities — and we’re just getting started.
          </p>
        </div>
        <div className="mt-12 overflow-hidden rounded-[1.75rem] border border-line">
          <img src={unsplash('photo-1503376780353-7e6692767b70', 1600)} alt="" className="aspect-[21/9] w-full object-cover" />
        </div>
      </section>

      {/* Stats */}
      <section className="container-page mt-16">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { v: '40,000+', l: 'Trips completed' },
            { v: '12,400+', l: 'Cars listed' },
            { v: '7', l: 'European cities' },
            { v: '4.9★', l: 'Average rating' },
          ].map((s) => (
            <div key={s.l} className="card p-6 text-center">
              <p className="font-display text-3xl font-semibold text-ink sm:text-4xl">{s.v}</p>
              <p className="mt-1 text-[13.5px] text-muted">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="container-page mt-24">
        <SectionHead eyebrow="What we stand for" title="Principles that guide us" />
        <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v) => (
            <div key={v.title} className="card p-6">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-050 text-accent"><Icon name={v.icon} size={22} /></span>
              <h3 className="mt-4 font-medium text-ink">{v.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{v.desc}</p>
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
              <img src={avatar(t.n)} alt={t.name} className="aspect-square w-full object-cover" />
              <div className="p-4">
                <p className="font-medium text-ink">{t.name}</p>
                <p className="text-[13px] text-muted">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container-page mt-24">
        <div className="flex flex-col items-center gap-6 rounded-[1.75rem] bg-ink px-6 py-16 text-center text-white">
          <h2 className="font-display text-3xl font-semibold text-balance sm:text-4xl">Join the journey.</h2>
          <p className="max-w-md text-[15px] text-white/70">Whether you’re driving or hosting, there’s a place for you at Velora.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/browse" className="btn btn-accent btn-lg">Find a car <Icon name="arrowRight" size={17} /></Link>
            <Link to="/list-your-car" className="btn btn-lg bg-white/10 text-white hover:bg-white/15">List your car</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
