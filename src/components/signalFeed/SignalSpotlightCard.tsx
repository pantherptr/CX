import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { VerifiedBadge } from '../primitives';
import { useLocale } from '../../lib/i18n';
import type { SpotlightCardData } from '../../lib/data/spotlight';

/** A Signal Spotlight in the feed: CX's editorial pick of a Vision. Photo or
 *  video first, a title and almost no text. There are deliberately no
 *  reactions, comments, counts or sharing here — the whole card (and the
 *  button) simply opens the original Vision on its creator's profile. */
export function SignalSpotlightCard({ data }: { data: SpotlightCardData }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const open = () => navigate(`/signal/profile/${data.creatorId}?vision=${data.visionId}`);
  const city = data.city?.trim();
  const sub = [data.carLabel, t('Shot on CX')].filter(Boolean).join(' · ');

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      aria-label={`${t('Signal Spotlight')}${data.title ? ` — ${data.title}` : ''}`}
      className="group relative mb-5 aspect-[4/5] w-full cursor-pointer overflow-hidden rounded-3xl bg-noir text-white shadow-[0_22px_48px_-26px_rgba(0,0,0,0.55)] outline-none ring-1 ring-black/5 focus-visible:ring-2 focus-visible:ring-accent-bright sm:aspect-[16/10]"
    >
      {data.mediaKind === 'video' ? (
        <video src={data.mediaUrl} muted playsInline loop autoPlay preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <Img
          src={data.mediaUrl}
          alt={data.title ?? ''}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.025]"
          fallback={<span className="absolute inset-0 grid place-items-center text-white/50"><Icon name="image" size={28} /></span>}
        />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/0 to-black/80" />

      {/* publisher + eyebrow */}
      <div className="absolute inset-x-0 top-0 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Img
            src={data.publisherAvatar ?? '/brand/avatar-cx.webp'}
            alt=""
            className="h-8 w-8 rounded-full object-cover ring-1 ring-white/30"
            fallback={<span className="grid h-8 w-8 place-items-center rounded-full bg-white/15"><Icon name="sparkles" size={14} /></span>}
          />
          <span className="font-display text-[15px] font-semibold">{data.publisherLabel}</span>
          <VerifiedBadge role="cx" size={16} />
        </div>
        <p className="mt-3 text-micro font-semibold uppercase tracking-[0.28em] text-white/85">
          {t('Signal Spotlight')}{city ? ` · ${city}` : ''}
        </p>
        {data.curatedBy && <p translate="no" className="mt-1 text-caption text-white/65">{t('Curated by')} {data.curatedBy}</p>}
      </div>

      {/* title + credit + CTA */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        {data.title && <h3 translate="no" className="font-display text-[28px] font-semibold leading-[1.05] tracking-tight sm:text-[34px]">{data.title}</h3>}
        <p className="mt-2 text-detail text-white/80">
          {t('Vision by')} {data.creatorUsername ? `@${data.creatorUsername}` : t('a CX creator')}
        </p>
        <p translate="no" className="mt-0.5 text-caption text-white/60">{sub}</p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); open(); }}
          className="pressable mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-detail font-semibold text-noir transition-colors hover:bg-white/90"
        >
          {t('Watch Vision')} <Icon name="arrowUpRight" size={15} />
        </button>
      </div>
    </article>
  );
}
