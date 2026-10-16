import { Icon } from './Icon';
import { Img } from './motion';
import { Modal } from './primitives';
import { motion } from './motionKit';
import { unsplash } from '../lib/img';
import { useLocale } from '../lib/i18n';

/** Every photo of a car at once: the first one wide, the rest in two columns, each fading in a beat after the
 *  last. Tapping one hands its index to the full-screen viewer. */
export function PhotoGridSheet({
  images,
  alt,
  open,
  onClose,
  onPick,
}: {
  images: string[];
  alt: string;
  open: boolean;
  onClose: () => void;
  onPick: (index: number) => void;
}) {
  const { t } = useLocale();
  return (
    <Modal open={open} onClose={onClose} className="max-h-[94vh] overflow-y-auto rounded-t-[1.75rem] sm:max-w-3xl" labelledBy="photo-grid-title">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
        <h2 id="photo-grid-title" className="font-display text-lg font-semibold text-ink">
          {t('All photos')} <span className="ml-1 text-detail font-medium text-muted">{images.length}</span>
        </h2>
        <button type="button" onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel">
          <Icon name="x" size={20} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 pb-6">
        {images.map((im, i) => (
          <motion.button
            key={`${im}-${i}`}
            type="button"
            onClick={() => onPick(i)}
            aria-label={`${alt} — ${i + 1} / ${images.length}`}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.045, 0.45) }}
            whileTap={{ scale: 0.97 }}
            className={`group relative overflow-hidden rounded-2xl bg-panel ${i === 0 ? 'col-span-2 aspect-[4/3]' : 'aspect-square'}`}
          >
            <Img
              src={unsplash(im, i === 0 ? 900 : 480)}
              alt=""
              loading={i < 4 ? 'eager' : 'lazy'}
              draggable={false}
              className="h-full w-full object-cover transition-transform duration-500 group-active:scale-105"
              fallback={<span className="block h-full w-full bg-panel" />}
            />
            <span className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{i + 1}</span>
          </motion.button>
        ))}
      </div>
    </Modal>
  );
}
