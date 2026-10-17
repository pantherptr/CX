import { useEffect, useRef, useState } from 'react';
import { motion } from '../motionKit';
import { Icon } from '../Icon';
import { VerifiedBadge } from '../primitives';
import { useLocale } from '../../lib/i18n';

interface Post { name: string; role: 'host' | 'client'; place: string; avatar: string; text: string; image: string }
const POSTS: Post[] = [
  { name: 'Giulia', role: 'client', place: 'Milano · 2h', avatar: '/signal/av-giulia.webp', text: 'Night out, no stress. Booked in two minutes, keys in my hand in ten. Thank you CX 🖤', image: '/signal/giulia.webp' },
  { name: 'Luca', role: 'client', place: 'Milano · 1d', avatar: '/signal/av-luca.webp', text: 'What a car! 😍 Rented it through CX for a weekend — easy to book, super host, car in perfect shape.', image: '/signal/luca.webp' },
  { name: 'Adam', role: 'host', place: 'Amalfi Coast', avatar: '/signal/av-adam.webp', text: 'Golden hour on the Amalfi Coast. Good cars, better people.', image: '/signal/story.webp' },
];

/**
 * Home → SIGNAL, on the light page: a row of stories on top and a stack of posts you flick through with a finger (or that
 * turns by itself every few seconds while it is on screen). The top card slides away, the next one rises and settles.
 */
export function SignalDeck() {
  const { t } = useLocale();
  const [top, setTop] = useState(0);
  const [paused, setPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (reduced || paused || !onScreen) return;
    const id = window.setInterval(() => setTop((n) => (n + 1) % POSTS.length), 4200);
    return () => window.clearInterval(id);
  }, [reduced, paused, onScreen]);

  const stories = [
    { n: 'CX', src: '/brand/avatar-cx-chrome.png?v=3', seen: false },
    { n: 'Adam', src: '/signal/av-adam.webp', seen: false },
    { n: 'Giulia', src: '/signal/av-giulia.webp', seen: false },
    { n: 'Luca', src: '/signal/av-luca.webp', seen: true },
    { n: 'Marco', src: '/signal/av-marco.webp', seen: true },
  ];

  return (
    <div ref={box} className="mx-auto w-full max-w-md" onPointerDown={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      {/* stories */}
      <div className="scrollbar-none -mx-1 flex gap-4 overflow-x-auto px-1 pb-4" aria-hidden>
        {stories.map((s, i) => (
          <div key={s.n} className="flex shrink-0 flex-col items-center gap-1.5">
            <span className={`rounded-full p-[3px] ${s.seen ? 'bg-line-strong' : 'bg-gradient-to-tr from-accent-bright via-accent to-accent-700'} ${i === 0 ? 'cx-story-pulse' : ''}`}>
              <span className="block rounded-full bg-surface p-[2px]"><img src={s.src} alt="" width={56} height={56} className="h-14 w-14 rounded-full object-cover" /></span>
            </span>
            <span className="text-caption font-medium text-ink-soft">{s.n}</span>
          </div>
        ))}
      </div>

      {/* the stack */}
      <div className="relative h-[27.5rem]" role="group" aria-label="SIGNAL">
        {POSTS.map((p, i) => {
          const pos = (i - top + POSTS.length) % POSTS.length; // 0 = on top
          const isTop = pos === 0;
          return (
            <motion.article
              key={p.name}
              className="absolute inset-x-0 top-0 flex h-[24.5rem] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_28px_50px_-30px_rgba(0,50,20,0.5)]"
              style={{ zIndex: 10 - pos, touchAction: 'pan-y', transformOrigin: '50% 100%' }}
              animate={{ y: pos * 16, scale: 1 - pos * 0.05, rotate: pos === 0 ? 0 : pos % 2 ? 1.6 : -1.6, opacity: pos > 2 ? 0 : 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              drag={isTop ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              onDragEnd={(_e, info) => { if (Math.abs(info.offset.x) > 70 || Math.abs(info.velocity.x) > 500) setTop((n) => (n + 1) % POSTS.length); }}
              onClick={() => { if (!isTop) setTop(i); }}
            >
              <div className="flex shrink-0 items-center gap-2.5 p-3.5">
                <img src={p.avatar} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-accent-bright/30" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-detail font-semibold text-ink">{p.name} <VerifiedBadge role={p.role} size={14} /></span>
                  <span className="block text-caption text-muted">{p.place}</span>
                </span>
                <Icon name="moreHorizontal" size={18} className="text-ink-soft" />
              </div>
              <p className="line-clamp-2 shrink-0 px-3.5 pb-3 text-detail leading-relaxed text-ink">{t(p.text)}</p>
              <img src={p.image} alt="" draggable={false} loading="lazy" className="min-h-0 w-full flex-1 object-cover object-[50%_35%]" />
              <div className="flex shrink-0 items-center gap-5 px-4 py-3 text-detail font-semibold text-ink-soft">
                <span className="inline-flex items-center gap-1.5"><Icon name="like" size={18} /> {t('Respect')}</span>
                <span className="inline-flex items-center gap-1.5"><Icon name="bookmark" size={17} /> {t('Save')}</span>
                <span className="ml-auto inline-flex items-center gap-1.5"><Icon name="share" size={17} /> {t('Share')}</span>
              </div>
            </motion.article>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2" aria-hidden>
        {POSTS.map((p, i) => <span key={p.name} className={`h-1.5 rounded-full transition-all ${i === top ? 'w-6 bg-ink' : 'w-1.5 bg-ink/25'}`} />)}
      </div>
    </div>
  );
}
