import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { SearchBar } from '../components/SearchBar';
import { CarCard } from '../components/CarCard';
import { SectionHead } from '../components/primitives';
import { Reveal, Img, useParallax } from '../components/motion';
import { useFeaturedCars } from '../lib/data/cars';
import { unsplash } from '../lib/img';
import { catalogue } from '../lib/catalogue';

const whyCX: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'verified', title: 'Verified cars', desc: 'Every vehicle inspected and confirmed before it goes live.' },
  { icon: 'lock', title: 'Secure bookings', desc: 'Encrypted payments and protection on every trip, no exceptions.' },
  { icon: 'users', title: 'Real people', desc: 'Identity-checked local hosts, not a faceless rental counter.' },
];

export default function Home() {
  const heroParallax = useParallax(0.08, 40);
  const { cars: featuredCars, loading: featuredLoading } = useFeaturedCars(4);

  return (
    <div>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden bg-noir">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(60% 55% at 80% 8%, rgba(0,212,71,0.20), transparent 62%), radial-gradient(45% 45% at 6% 92%, rgba(0,212,71,0.08), transparent 65%)',
          }}
        />
        <div className="container-page relative z-10 grid items-center gap-10 pt-14 pb-6 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:pt-20">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[12.5px] font-medium text-on-noir backdrop-blur-sm">
              <span className="flex h-2 w-2 items-center justify-center">
                <span className="h-2 w-2 animate-ping rounded-full bg-accent-bright/60" />
                <span className="absolute h-2 w-2 rounded-full bg-accent-bright" />
              </span>
              Now live in {catalogue.cities} European cities
            </span>

            <h1 className="mt-5 font-display text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.02em] text-on-noir text-balance sm:text-6xl lg:text-[4rem]">
              Your next car is waiting.
            </h1>
            <p className="mt-4 max-w-md text-[17px] leading-relaxed text-on-noir-muted text-pretty">
              Premium cars. Verified hosts. Ready for the road.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/browse" className="btn btn-accent-bright btn-lg">
                Explore Cars <Icon name="arrowRight" size={17} />
              </Link>
              <Link to="/list-your-car" className="btn btn-lg bg-white/10 text-on-noir hover:bg-white/15">
                List Your Car
              </Link>
            </div>
          </div>

          {/* Hero visual — cinematic spotlit car */}
          <div className="relative animate-scale-in" style={{ transform: `translateY(${heroParallax}px)` }}>
            <div className="relative mx-auto max-w-md lg:max-w-none">
              <div className="animate-float-slow">
                <Img
                  src={unsplash('photo-1580273916550-e323be2ae537', 1100)}
                  alt="A premium car available on CX"
                  className="relative w-full object-contain"
                />
                {/* Spotlight vignette — fades the photo's edges into the
                    noir background regardless of its own backdrop. */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: 'radial-gradient(60% 58% at 50% 42%, transparent 34%, var(--color-noir) 96%)',
                  }}
                />
                {/* A single soft light pass, once the entrance settles */}
                <div
                  className="animate-light-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  style={{ animationDelay: '1.8s' }}
                />
              </div>

              {/* Floating rating chip */}
              <div className="absolute -left-2 top-8 hidden animate-float rounded-2xl border border-white/10 bg-noir-2/85 px-3.5 py-2.5 shadow-pop backdrop-blur sm:block">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-bright/15 text-accent-bright">
                    <Icon name="verified" size={18} />
                  </span>
                  <div className="text-[12.5px] leading-tight">
                    <p className="font-semibold text-on-noir">Verified host</p>
                    <p className="text-on-noir-muted">Michael · 348 trips</p>
                  </div>
                </div>
              </div>

              {/* Floating price chip */}
              <div className="absolute bottom-6 right-0 animate-float-slow rounded-2xl border border-white/10 bg-noir-2/90 px-4 py-3 shadow-pop backdrop-blur">
                <p className="text-[12px] text-on-noir-muted">BMW M4 Competition</p>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-xl font-semibold text-on-noir">€145</span>
                  <span className="text-[13px] text-on-noir-muted">/ day</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search module — floating light card */}
        <div className="container-page relative z-10 mt-8 pb-14 lg:mt-4">
          <div className="mx-auto max-w-5xl">
            <SearchBar variant="hero" />
          </div>
        </div>
      </section>

      {/* ---------------- FEATURED CARS ---------------- */}
      <section className="container-page mt-20 sm:mt-24">
        <SectionHead
          eyebrow="Featured"
          title="Cars people love to drive"
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

      {/* ---------------- WHY CX ---------------- */}
      <section className="container-page mt-20 sm:mt-24">
        <div className="grid gap-8 sm:grid-cols-3">
          {whyCX.map((f, i) => (
            <Reveal key={f.title} delay={i * 90}>
              <div className="flex flex-col items-start gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-050 text-accent">
                  <Icon name={f.icon} size={22} />
                </span>
                <h3 className="font-display text-lg font-semibold text-ink">{f.title}</h3>
                <p className="text-[14.5px] leading-relaxed text-muted">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- FINAL CTA ---------------- */}
      <section className="relative mt-20 overflow-hidden bg-noir py-20 sm:mt-24 sm:py-28">
        <div
          className="glow-accent-bright pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 opacity-60"
        />
        <Reveal className="relative">
          <div className="container-page flex flex-col items-center gap-6 text-center">
            <h2 className="font-display text-3xl font-semibold text-on-noir text-balance sm:text-5xl">
              Ready for your next journey?
            </h2>
            <Link to="/browse" className="btn btn-accent-bright btn-lg">
              Explore Cars <Icon name="arrowRight" size={17} />
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
