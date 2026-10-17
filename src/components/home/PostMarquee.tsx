import { useLocale } from '../../lib/i18n';

export interface MarqueeQuote { name: string; place: string; avatar?: string; text: string; respected?: boolean; rtl?: boolean }
// Six members from different places. Each post stays in its own language (Italian, English, Arabic) whatever language the site is in.
// The two rows are the first and the last three, so each row mixes them.
const QUOTES: MarqueeQuote[] = [
  { name: 'Giulia', place: 'Milano', avatar: '/signal/av-giulia.webp', text: 'Fast & Furious, edizione Milano. Finestrini giù, la famiglia prima di tutto, niente freni. 🏁' },
  { name: 'Sophie', place: 'London', avatar: '/signal/av-marco.webp', text: 'Delivered to my door, right on time. This is how renting should feel.' },
  { name: 'Adam', place: 'San Pietroburgo', avatar: '/signal/av-adam.webp', text: 'Cattedrale di Kazan, San Pietroburgo. Volto coperto, nome conosciuto: il rispetto viene prima. 🖤', respected: true },
  { name: 'Daniel', place: 'Manchester', text: 'Grey sky, clean ride, zero stress. Booked in two minutes, mate. 🖤' },
  { name: 'Luca', place: 'Milano', avatar: '/signal/av-luca.webp', text: 'Pioggia sul vetro, lealtà sul sedile. Niente finto, niente show: solo quelli veri. 🖤' },
  { name: 'Yusuf', place: 'Dubai', rtl: true, text: 'يلا يا حبيبي، المفاتيح في إيدي والطريق طريقنا 🏎️🔝' },
];

function Card({ q }: { q: MarqueeQuote }) {
  const { t } = useLocale();
  return (
    <figure className="relative flex w-[17rem] shrink-0 flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2.5">
        {q.avatar ? (
          <img src={q.avatar} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover ring-1 ring-accent-bright/30" />
        ) : (
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#0e3322] to-[#06120d] text-detail font-bold text-[#7dffa8] ring-1 ring-accent-bright/30">{q.name[0]}</span>
        )}
        <figcaption className="min-w-0 text-detail font-semibold leading-tight text-ink">{q.name}<span className="block text-caption font-normal text-muted">{q.place}</span></figcaption>
      </div>
      <blockquote dir={q.rtl ? 'rtl' : undefined} lang={q.rtl ? 'ar' : undefined} className={`line-clamp-3 text-ink-soft ${q.rtl ? 'text-[15px] leading-loose' : 'text-detail leading-relaxed'}`}>{q.text}</blockquote>
      {q.respected && (
        <span className="cx-marquee-stamp absolute bottom-2.5 right-3 -rotate-[8deg] rounded-md border-2 border-double border-accent-700/80 px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.18em] text-accent-700">{t('Respected')}</span>
      )}
    </figure>
  );
}

/** Two rows of short SIGNAL posts that drift in opposite directions; they stop on hover or touch and with reduced motion. */
export function PostMarquee({ quotes = QUOTES }: { quotes?: MarqueeQuote[] }) {
  const half = Math.ceil(quotes.length / 2);
  const row = (reverse: boolean, items: MarqueeQuote[]) => (
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
    <div className="relative -mx-5 space-y-3 sm:mx-0">
      {row(false, quotes.slice(0, half))}
      {row(true, quotes.slice(half))}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-bg to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-bg to-transparent" />
    </div>
  );
}
