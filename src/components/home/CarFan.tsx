import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from '../motionKit';
import { useCars } from '../../lib/data/cars';
import { unsplash } from '../../lib/img';
import { eur } from '../../lib/format';
import { useLocale } from '../../lib/i18n';

/** Real cars of the fleet as a fan of cards: the middle one is in front, a drag or a tap on a side card turns the fan,
 *  and it turns by itself every few seconds while on screen. */
export function CarFan() {
  const { t } = useLocale();
  const { cars } = useCars();
  const list = (cars ?? []).filter((c) => c.images[0]).slice(0, 7);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const n = list.length;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (reduced || paused || !onScreen || n < 2) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % n), 3200);
    return () => window.clearInterval(id);
  }, [reduced, paused, onScreen, n]);

  if (n < 3) return null;
  const off = (i: number) => { const r = i - active; return Math.abs(r - n) < Math.abs(r) ? r - n : Math.abs(r + n) < Math.abs(r) ? r + n : r; };

  return (
    <div ref={box} className="mx-auto w-full max-w-3xl" onPointerDown={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <div className="relative h-[22.5rem] overflow-hidden sm:h-[25rem]" role="group" aria-label={t('Cars like yours on CX')}>
        {list.map((c, i) => {
          const o = off(i);
          const a = Math.abs(o);
          if (a > 2) return null;
          return (
            <motion.div
              key={c.id}
              className="absolute bottom-6 left-1/2 w-[13.5rem] overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_26px_44px_-26px_rgba(0,40,15,0.55)] sm:w-[16rem]"
              style={{ zIndex: 10 - a, x: '-50%', transformOrigin: '50% 120%', touchAction: 'pan-y' }}
              animate={{ translateX: o * 56, y: a * 14, rotate: o * 9, scale: 1 - a * 0.07, opacity: 1 - a * 0.15 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              drag={o === 0 ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              onDragEnd={(_e, info) => { if (info.offset.x < -60) setActive((x) => (x + 1) % n); else if (info.offset.x > 60) setActive((x) => (x - 1 + n) % n); }}
              onClick={() => { if (o !== 0) setActive(i); }}
            >
              <img src={unsplash(c.images[0], 520)} alt="" draggable={false} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              <div className="p-3.5">
                <p className="truncate text-body font-semibold text-ink">{c.make} {c.model}</p>
                <p className="mt-0.5 flex items-center justify-between text-detail text-muted"><span>{c.city}</span><span className="font-semibold text-ink">{eur(c.pricePerDay)} <span className="font-normal text-muted">/ {t('day')}</span></span></p>
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-center gap-2" aria-hidden>
        {list.map((c, i) => <span key={c.id} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-ink' : 'w-1.5 bg-ink/25'}`} />)}
      </div>
      <p className="mt-4 text-center"><Link to="/signup" className="btn btn-primary btn-lg">{t('List yours')}</Link></p>
    </div>
  );
}
