import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { VerifiedBadge } from '../primitives';
import { useLocale } from '../../lib/i18n';
import { fetchVisions, type Vision } from '../../lib/data/visions';
import type { SpotlightCardData } from '../../lib/data/spotlight';
import { SignalMediaViewer } from './SignalMediaViewer';
import { SharedAvatar } from '../motionKit';

/** A Signal Spotlight in the feed: CX's editorial pick of a Vision. Photo or
 *  video first, a title and almost no text — no reactions, comments, counts or
 *  sharing. Tapping anywhere (or "Watch Vision") opens the ORIGINAL Vision right
 *  here in the fullscreen viewer, with its own title and caption, and a link on
 *  to the creator's Visions. When the feed has several Spotlights the viewer lets
 *  you swipe from one to the next, and the photo grows out of the card it was
 *  tapped on. */
export function SignalSpotlightCard({ data, all }: { data: SpotlightCardData; all?: SpotlightCardData[] }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [vision, setVision] = useState<Vision | null>(null);
  const city = data.city?.trim();
  const sub = [data.carLabel, t('Shot on CX')].filter(Boolean).join(' · ');
  const list = all && all.length > 0 ? all : [data];
  const startIndex = Math.max(0, list.findIndex((x) => x.entryId === data.entryId));
  const handleOf = (d: SpotlightCardData) => (d.creatorUsername ? `@${d.creatorUsername}` : t('a CX creator'));
  const handle = data.creatorUsername ? `@${data.creatorUsername}` : t('a CX creator');

  // The creator's own title/caption for the Vision — fetched only once it is opened.
  useEffect(() => {
    if (!open || vision) return;
    let cancelled = false;
    fetchVisions(data.creatorId, 60).then((rows) => {
      if (!cancelled) setVision(rows.find((v) => v.id === data.visionId) ?? null);
    });
    return () => { cancelled = true; };
  }, [open, vision, data.creatorId, data.visionId]);

  const goToProfile = (d: SpotlightCardData) => navigate(`/signal/profile/${d.creatorId}?vision=${d.visionId}`);

  return (
    <>
      <article
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
        aria-label={`${t('Signal Spotlight')}${data.title ? ` — ${data.title}` : ''}`}
        className="group relative mb-5 aspect-[4/5] w-full animate-fade-up cursor-pointer overflow-hidden rounded-[28px] bg-noir text-white shadow-[0_28px_60px_-30px_rgba(0,0,0,0.65)] outline-none ring-1 ring-black/10 transition-transform duration-300 ease-out active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-accent-bright sm:aspect-[16/10]"
      >
        {data.mediaKind === 'video' ? (
          <video src={data.mediaUrl} muted playsInline loop autoPlay preload="metadata" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-[1.04]" />
        ) : (
          <SharedAvatar as="div" id={`post-media-spotlight-${data.entryId}-${data.mediaUrl}`} active={!open} className="absolute inset-0">
            <Img
              src={data.mediaUrl}
              alt={data.title ?? ''}
              className="h-full w-full object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-[1.04]"
              fallback={<span className="absolute inset-0 grid place-items-center text-white/50"><Icon name="image" size={28} /></span>}
            />
          </SharedAvatar>
        )}
        {/* depth: dark at the top and bottom where the text sits, a faint glass edge all round */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/0 to-black/85" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-inset ring-white/15" />

        {/* publisher + eyebrow */}
        <div className="absolute inset-x-0 top-0 p-4 sm:p-6">
          <div className="flex items-center gap-2.5">
            <Img
              src={data.publisherAvatar ?? '/brand/avatar-cx.webp'}
              alt=""
              className="h-9 w-9 rounded-full object-cover ring-1 ring-white/35"
              fallback={<span className="grid h-9 w-9 place-items-center rounded-full bg-white/15"><Icon name="sparkles" size={14} /></span>}
            />
            <span className="font-display text-[16px] font-semibold">{data.publisherLabel}</span>
            <VerifiedBadge role="cx" size={17} />
          </div>
          <p className="mt-4 inline-flex items-center gap-2 text-micro font-semibold uppercase tracking-[0.3em] text-white/90">
            <span aria-hidden="true" className="h-px w-6 bg-white/60" />
            {t('Signal Spotlight')}{city ? ` · ${city}` : ''}
          </p>
          {data.curatedBy && <p translate="no" className="mt-1.5 text-caption text-white/65">{t('Curated by')} {data.curatedBy}</p>}
        </div>

        {data.mediaKind === 'video' && (
          <span aria-hidden="true" className="pointer-events-none absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md sm:right-6 sm:top-6"><Icon name="play" size={14} fill /></span>
        )}

        {/* title + credit + CTA */}
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          {data.title && <h3 translate="no" className="max-w-[18ch] font-display text-[34px] font-semibold leading-[1.02] tracking-tight sm:text-[42px]">{data.title}</h3>}
          <p translate="no" className="mt-3 text-detail font-medium text-white/90">{t('Vision by')} {handle}</p>
          <p translate="no" className="mt-0.5 text-caption text-white/60">{sub}</p>
          <span className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-detail font-semibold text-noir transition-all duration-300 group-hover:gap-3 group-hover:bg-white/95">
            {t('Watch Vision')} <Icon name="arrowUpRight" size={15} />
          </span>
        </div>
      </article>

      {open && (
        <SignalMediaViewer
          images={list.map((d) => d.mediaUrl)}
          startIndex={startIndex}
          sharedKey={`spotlight-${data.entryId}`}
          captions={list.map((d, i) => ({
            title: i === startIndex ? (vision?.title || d.title) : d.title,
            caption: i === startIndex && vision?.caption ? vision.caption : `${t('Vision by')} ${handleOf(d)}${d.carLabel ? ` · ${d.carLabel}` : ''}`,
            badge: t('Selected for Signal Spotlight'),
          }))}
          footer={(i) => (
            <button type="button" onClick={() => goToProfile(list[i] ?? data)} className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/12 px-4 text-detail font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20">
              {t('See more from')} {handleOf(list[i] ?? data)} <Icon name="arrowUpRight" size={14} />
            </button>
          )}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
