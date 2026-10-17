import { useLocale } from '../../lib/i18n';

const QUOTES = [
  { name: 'Giulia', place: 'Milano', avatar: '/signal/av-giulia.webp', text: 'Night out, no stress. Booked in two minutes, keys in my hand in ten. Thank you CX 🖤' },
  { name: 'Luca', place: 'Milano', avatar: '/signal/av-luca.webp', text: 'What a car! 😍 Easy to book, super host, car in perfect shape.' },
  { name: 'Adam', place: 'Amalfi Coast', avatar: '/signal/av-adam.webp', text: 'Golden hour on the Amalfi Coast. Good cars, better people.' },
  { name: 'Marco', place: 'Firenze', avatar: '/signal/av-marco.webp', text: 'Delivered to my door, right on time. This is how renting should feel.' },
  { name: 'Giulia', place: 'Milano', avatar: '/signal/av-giulia.webp', text: 'The host replied in minutes and the handover was a breeze.' },
  { name: 'Luca', place: 'Roma', avatar: '/signal/av-luca.webp', text: 'Weekend sorted. I will be back for the next one.' },
];

function Card({ q }: { q: (typeof QUOTES)[number] }) {
  const { t } = useLocale();
  return (
    <figure className="flex w-[17rem] shrink-0 flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <img src={q.avatar} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover ring-1 ring-accent-bright/30" />
        <figcaption className="min-w-0 text-detail font-semibold leading-tight text-ink">{q.name}<span className="block text-caption font-normal text-muted">{q.place}</span></figcaption>
      </div>
      <blockquote className="line-clamp-3 text-detail leading-relaxed text-ink-soft">{t(q.text)}</blockquote>
    </figure>
  );
}

/** Two rows of short SIGNAL posts that drift in opposite directions; they stop on hover or touch and with reduced motion. */
export function PostMarquee() {
  const row = (reverse: boolean, items: typeof QUOTES) => (
    <div className="cx-marquee group flex overflow-hidden" aria-hidden={reverse}>
      <div className={`cx-marquee-track flex shrink-0 gap-3 pr-3 ${reverse ? 'cx-marquee-rev' : ''}`}>
        {[...items, ...items].map((q, i) => <Card key={`${q.name}-${i}`} q={q} />)}
      </div>
      <div aria-hidden className={`cx-marquee-track flex shrink-0 gap-3 pr-3 ${reverse ? 'cx-marquee-rev' : ''}`}>
        {[...items, ...items].map((q, i) => <Card key={`${q.name}-b${i}`} q={q} />)}
      </div>
    </div>
  );
  return (
    <div className="relative -mx-5 mt-12 space-y-3 sm:mx-0">
      {row(false, QUOTES.slice(0, 3))}
      {row(true, QUOTES.slice(3))}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-bg to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-bg to-transparent" />
    </div>
  );
}
