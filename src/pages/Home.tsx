import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { SearchBar } from '../components/SearchBar';
import { CarCard } from '../components/CarCard';
import { SectionHead } from '../components/primitives';
import { Reveal, Img, useParallax } from '../components/motion';
import { LiveVisitors } from '../components/LiveVisitors';
import { IntelligenceMap } from '../components/home/IntelligenceMap';
import { Pipeline } from '../components/home/Pipeline';
import { Ecosystem } from '../components/home/Ecosystem';
import { CommandCenter } from '../components/home/CommandCenter';
import { Timeline } from '../components/home/Timeline';
import { Playground } from '../components/home/Playground';
import { useFeaturedCars } from '../lib/data/cars';
import { categories, testimonials } from '../data/content';
import { unsplash, avatar } from '../lib/img';

const trustLogos = ['Corriere Auto', 'Le Journal', 'AutoWeek', 'MobilityEU', 'La Stampa'];

const whyFeatures: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'verified', title: 'Verified vehicles', desc: 'Every car is inspected, documented and confirmed before it can be listed.' },
  { icon: 'shield', title: 'Trusted hosts', desc: 'Identity-checked owners with real reviews from thousands of completed trips.' },
  { icon: 'calendar', title: 'Flexible booking', desc: 'Free cancellation up to 24 hours before pick-up, on every reservation.' },
  { icon: 'lock', title: 'Secure payments', desc: 'Encrypted, protected transactions handled entirely within Velora.' },
  { icon: 'headset', title: '24/7 support', desc: 'Real people, any time zone, whenever you need us on the road.' },
  { icon: 'sparkles', title: 'Premium standard', desc: 'A curated fleet held to a higher bar than any rental counter.' },
];

const steps = [
  { n: '01', title: 'Find your car', desc: 'Search thousands of cars from trusted local hosts. Filter by type, price, location and the features that matter to you.', icon: 'search' as IconName },
  { n: '02', title: 'Book your trip', desc: 'Reserve instantly or send a request. Choose your dates, add protection and pay securely in a few taps.', icon: 'calendar' as IconName },
  { n: '03', title: 'Hit the road', desc: 'Meet your host or unlock remotely, then enjoy the drive. Return the car and rate your experience.', icon: 'key' as IconName },
];

export default function Home() {
  const heroParallax = useParallax(0.08, 40);
  const { cars: featuredCars, loading: featuredLoading } = useFeaturedCars(8);

  return (
    <div>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(60% 55% at 82% 12%, rgba(11,122,91,0.07), transparent 60%), radial-gradient(50% 50% at 8% 8%, rgba(22,22,26,0.04), transparent 60%)',
          }}
        />
        <div className="container-page grid items-center gap-10 pt-10 pb-2 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pt-16">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft shadow-hair">
              <span className="flex h-2 w-2 items-center justify-center">
                <span className="h-2 w-2 animate-ping rounded-full bg-accent/60" />
                <span className="absolute h-2 w-2 rounded-full bg-accent" />
              </span>
              Now live in 7 European cities
            </span>
            <h1 className="mt-5 font-display text-[2.7rem] font-semibold leading-[1.03] tracking-[-0.02em] text-ink text-balance sm:text-6xl">
              The right car for every journey.
            </h1>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted text-pretty sm:text-[17px]">
              Rent exceptional cars from local owners, wherever the road takes you.
              Premium vehicles, verified hosts and prices that make sense.
            </p>

            <div className="mt-7 flex items-center gap-5">
              <div className="flex -space-x-2.5">
                {[20, 13, 47, 68].map((n) => (
                  <img
                    key={n}
                    src={avatar(n)}
                    alt=""
                    className="h-9 w-9 rounded-full border-2 border-bg object-cover"
                  />
                ))}
              </div>
              <div className="text-[13.5px] leading-tight">
                <div className="flex items-center gap-1 font-medium text-ink">
                  <Icon name="star" size={14} className="text-star" /> 4.9 average
                </div>
                <span className="text-muted">from 40,000+ trips</span>
              </div>
            </div>

            <div className="mt-6">
              <LiveVisitors variant="pill" />
            </div>
          </div>

          {/* Hero visual */}
          <div className="relative animate-scale-in" style={{ transform: `translateY(${heroParallax}px)` }}>
            <div className="relative overflow-hidden rounded-[1.75rem] border border-line shadow-lift">
              <div className="animate-ken-burns h-full w-full">
                <Img
                  src={unsplash('photo-1580273916550-e323be2ae537', 1100)}
                  alt="A premium car available on Velora"
                  className="aspect-[4/3] w-full object-cover lg:aspect-[5/6]"
                />
              </div>
              {/* A single soft light pass, once the entrance settles */}
              <div
                className="animate-light-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                style={{ animationDelay: '1.8s' }}
              />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink/40 to-transparent" />
            </div>

            {/* Floating rating chip */}
            <div className="absolute -left-3 top-6 hidden animate-float rounded-2xl border border-line bg-surface/90 px-3.5 py-2.5 shadow-pop backdrop-blur sm:block">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-050 text-accent">
                  <Icon name="verified" size={18} />
                </span>
                <div className="text-[12.5px] leading-tight">
                  <p className="font-semibold text-ink">Verified host</p>
                  <p className="text-muted">Michael · 348 trips</p>
                </div>
              </div>
            </div>

            {/* Floating price card */}
            <div className="absolute bottom-4 right-4 animate-float-slow rounded-2xl border border-line bg-surface px-4 py-3 shadow-pop">
              <p className="text-[12px] text-muted">BMW M4 Competition</p>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-xl font-semibold text-ink">€145</span>
                <span className="text-[13px] text-muted">/ day</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search module */}
        <div className="container-page relative z-10 mt-10 lg:mt-8">
          <div className="mx-auto max-w-5xl">
            <SearchBar variant="hero" />
            <p className="mt-3 flex items-center justify-center gap-2 text-[13px] text-muted">
              <Icon name="shield" size={14} className="text-accent" />
              Free cancellation up to 24 hours before your trip
            </p>
          </div>
        </div>

        {/* Trust strip */}
        <div className="container-page mt-14">
          <p className="text-center text-[12px] font-semibold uppercase tracking-[0.16em] text-faint">
            Trusted by drivers &amp; featured across Europe
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
            {trustLogos.map((l) => (
              <span key={l} className="font-display text-lg font-medium tracking-tight text-ink-soft">
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- FEATURED CARS ---------------- */}
      <section className="container-page mt-24">
        <SectionHead
          eyebrow="Featured"
          title="Cars people love to drive"
          desc="A hand-picked selection of the highest-rated vehicles from our community of trusted hosts."
          action={
            <Link to="/browse" className="btn btn-secondary btn-sm">
              View all cars <Icon name="arrowRight" size={16} />
            </Link>
          }
        />
        <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featuredLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card overflow-hidden">
                  <div className="skeleton aspect-[4/3]" />
                  <div className="space-y-2.5 p-4">
                    <div className="skeleton h-4 w-3/5 rounded-md" />
                    <div className="skeleton h-3 w-2/5 rounded-md" />
                  </div>
                </div>
              ))
            : (featuredCars ?? []).map((car, i) => (
                <Reveal key={car.id} delay={(i % 4) * 70}>
                  <CarCard car={car} priority={i < 4} />
                </Reveal>
              ))}
        </div>
      </section>

      {/* ---------------- CATEGORIES ---------------- */}
      <section className="container-page mt-24">
        <SectionHead eyebrow="Browse by category" title="Find your kind of drive" />
        <div className="mt-9 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {categories.map((cat, i) => (
            <Reveal key={cat.name} delay={(i % 4) * 60} className={i === 0 ? 'col-span-2 lg:col-span-2' : ''}>
              <Link
                to={`/browse?type=${cat.name}`}
                className="group relative block h-full overflow-hidden rounded-2xl border border-line"
              >
                <Img
                  src={unsplash(cat.image, 700)}
                  alt={cat.name}
                  loading="lazy"
                  className={`w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 ${
                    i === 0 ? 'aspect-[2/1] lg:aspect-[2.1/1]' : 'aspect-[4/3]'
                  }`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-white">{cat.name}</h3>
                    <p className="text-[13px] text-white/75">{cat.tagline}</p>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-all duration-300 group-hover:bg-white group-hover:text-ink">
                    <Icon name="arrowUpRight" size={17} />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section className="container-page mt-28">
        <SectionHead
          center
          eyebrow="How it works"
          title="Three steps to the open road"
          desc="Renting with Velora is designed to be effortless from the first search to the moment you hand back the keys."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 90}>
              <div className="card relative h-full overflow-hidden p-7">
                <span className="pointer-events-none absolute -right-2 -top-4 font-display text-[6rem] font-semibold leading-none text-panel-2 select-none">
                  {s.n}
                </span>
                <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-ink text-white">
                  <Icon name={s.icon} size={22} />
                </span>
                <h3 className="relative mt-5 font-display text-xl font-semibold text-ink">{s.title}</h3>
                <p className="relative mt-2 text-[14.5px] leading-relaxed text-muted">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- VELORA INTELLIGENCE ---------------- */}
      <IntelligenceMap />

      {/* ---------------- WHY VELORA ---------------- */}
      <section className="container-page mt-28">
        <Reveal>
        <div className="overflow-hidden rounded-[1.75rem] border border-line bg-panel">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex flex-col justify-center p-8 sm:p-12">
              <p className="eyebrow mb-3">Why Velora</p>
              <h2 className="font-display text-3xl font-semibold leading-[1.1] text-ink text-balance sm:text-4xl">
                Built around better car rentals.
              </h2>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">
                We rebuilt every part of the rental experience — trust, transparency and quality — so
                you can book with total confidence.
              </p>
              <Link to="/how-it-works" className="btn btn-primary mt-7 w-fit">
                Learn how it works <Icon name="arrowRight" size={16} />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2">
              {whyFeatures.map((f) => (
                <div key={f.title} className="bg-panel p-6 transition-colors hover:bg-surface">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-050 text-accent">
                    <Icon name={f.icon} size={20} />
                  </span>
                  <h3 className="mt-4 font-medium text-ink">{f.title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        </Reveal>
      </section>

      {/* ---------------- FROM IDEA TO EXECUTION ---------------- */}
      <Pipeline />

      {/* ---------------- BECOME A HOST ---------------- */}
      <section className="container-page mt-24">
        <Reveal>
        <div className="relative overflow-hidden rounded-[1.75rem] bg-ink text-white">
          <Img
            src={unsplash('photo-1503376780353-7e6692767b70', 1400)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/30" />
          <div className="relative grid gap-8 p-8 sm:p-14 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-100">
                Become a host
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold leading-[1.08] text-balance sm:text-[2.6rem]">
                Your car can earn while you’re not driving it.
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/70">
                List your vehicle in minutes and start earning from the days it would otherwise sit
                idle. You set the price, the availability and the rules — we handle payments,
                insurance and support.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link to="/list-your-car" className="btn btn-accent btn-lg">
                  List your car <Icon name="arrowRight" size={17} />
                </Link>
                <Link to="/host" className="btn btn-lg bg-white/10 text-white hover:bg-white/15">
                  Host dashboard
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:max-w-sm sm:justify-self-end">
              {[
                { v: '€780', l: 'Avg. monthly earnings' },
                { v: '€1.2M', l: 'Paid to hosts monthly' },
                { v: '12,400+', l: 'Cars listed' },
                { v: '5 min', l: 'To create a listing' },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                  <p className="font-display text-2xl font-semibold">{s.v}</p>
                  <p className="mt-1 text-[13px] text-white/60">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        </Reveal>
      </section>

      {/* ---------------- ECOSYSTEM ---------------- */}
      <Ecosystem />

      {/* ---------------- COMMAND CENTER ---------------- */}
      <CommandCenter />

      {/* ---------------- EVOLUTION TIMELINE ---------------- */}
      <Timeline />

      {/* ---------------- TESTIMONIALS ---------------- */}
      <section className="container-page mt-28">
        <SectionHead eyebrow="Loved by our community" title="Trusted by drivers and hosts alike" />
        <div className="mt-9 grid gap-5 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.id} delay={i * 90} className="h-full">
            <figure className="card flex h-full flex-col p-7">
              <div className="flex items-center gap-1 text-star">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Icon key={i} name="star" size={16} />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-ink-soft text-pretty">
                “{t.body}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-line pt-5">
                <img src={t.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
                <div>
                  <p className="font-medium text-ink">{t.name}</p>
                  <p className="text-[13px] text-muted">{t.location}</p>
                </div>
              </figcaption>
            </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- EXPERIENCE VELORA ---------------- */}
      <Playground />

      {/* ---------------- CTA BAND ---------------- */}
      <section className="container-page mt-24">
        <Reveal>
        <div className="flex flex-col items-center gap-6 rounded-[1.75rem] border border-line bg-surface px-6 py-14 text-center shadow-soft">
          <h2 className="font-display text-3xl font-semibold text-ink text-balance sm:text-4xl">
            Ready when you are.
          </h2>
          <p className="max-w-md text-[15px] text-muted">
            Find the perfect car for your next journey, or start earning from the one you already own.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/browse" className="btn btn-primary btn-lg">
              Browse cars <Icon name="arrowRight" size={17} />
            </Link>
            <Link to="/list-your-car" className="btn btn-secondary btn-lg">
              List your car
            </Link>
          </div>
        </div>
        </Reveal>
      </section>
    </div>
  );
}
