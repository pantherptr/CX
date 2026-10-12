import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import LanyardBadge, { Ornament } from './ui/lanyard-badge';
import { Icon } from './Icon';
import { useLocale } from '../lib/i18n';
import { useApp } from '../lib/store';
import { setChromeOverride } from '../lib/theme';

export type PassTier = 'member' | 'verified' | 'host' | 'golden' | 'team';

export interface PassData {
  name: string;
  username: string | null;
  avatarUrl: string | null;
  tier: PassTier;
  trips: number;
  respects: number;
  /** Year the account was created, or null. */
  since: string | null;
  /** Public address of the profile — what the QR code opens. */
  url: string;
}

const TIER: Record<PassTier, { label: string; ink: string; card: string; ring: string }> = {
  member: { label: 'Member', ink: '#a8aaa4', card: '#0e100e', ring: '#5a5d57' },
  verified: { label: 'Verified member', ink: '#00d447', card: '#0e100e', ring: '#00d447' },
  host: { label: 'Verified host', ink: '#00d447', card: '#0b120d', ring: '#00d447' },
  golden: { label: 'Golden Host', ink: '#e3bd55', card: '#14110a', ring: '#e3bd55' },
  team: { label: 'CX Team', ink: '#e3bd55', card: '#14110a', ring: '#e3bd55' },
};

const DISPLAY = '"Clash Display", "Satoshi", "Arial Narrow", sans-serif';

/** A person's CX Pass: a card on a lanyard. Front — who they are; back — the numbers and a QR that opens
 *  their profile. Drag it, flick it, tap it to flip. */
export function CxPass({ pass, height = '580px' }: { pass: PassData; height?: string }) {
  const { t } = useLocale();
  const tier = TIER[pass.tier];
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    QRCode.toDataURL(pass.url, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#0a0b0a', light: '#ffffff' } })
      .then((d) => { if (!off) setQr(d); })
      .catch(() => {});
    return () => { off = true; };
  }, [pass.url]);

  const front = (
    <div className="relative h-full w-full" style={{ background: tier.card, color: tier.ink }}>
      <Ornament className="absolute" style={{ width: 300, right: -140, top: 120, maxWidth: 'none', opacity: 0.35 }} />
      <Ornament className="absolute" style={{ width: 200, left: -60, bottom: -80, maxWidth: 'none', opacity: 0.3 }} />
      <div className="absolute inset-x-0 top-[44px] flex flex-col items-center text-center">
        <img
          src="/cx-logo-main.png"
          alt="CX"
          draggable={false}
          style={{ height: 22, filter: 'invert(1) hue-rotate(180deg) brightness(1.05)' }}
        />
        <span
          className="mt-5 block overflow-hidden rounded-full"
          style={{ width: 96, height: 96, boxShadow: `0 0 0 2px ${tier.card}, 0 0 0 4px ${tier.ring}`, background: '#1a1c1a' }}
        >
          {pass.avatarUrl ? (
            <img src={pass.avatarUrl} alt="" draggable={false} className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[32px] font-bold">{pass.name.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <p className="mt-4 max-w-[200px] truncate text-[20px] font-bold uppercase leading-tight text-white" style={{ fontFamily: DISPLAY }}>
          {pass.name}
        </p>
        {pass.username && <p className="mt-0.5 text-[11px] tracking-wide text-white/60">@{pass.username}</p>}
        <span
          className="mt-4 rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{ border: `1px solid ${tier.ring}`, color: tier.ink }}
        >
          {t(tier.label)}
        </span>
      </div>
      <p className="absolute inset-x-0 bottom-5 text-center text-[8px] font-semibold uppercase tracking-[0.34em] opacity-70">CX · SIGNAL</p>
    </div>
  );

  const stat = (v: string | number, l: string) => (
    <div className="flex-1 text-center">
      <p className="text-[18px] font-bold leading-none text-white" style={{ fontFamily: DISPLAY }}>{v}</p>
      <p className="mt-1 text-[7.5px] font-semibold uppercase tracking-[0.16em] opacity-70">{l}</p>
    </div>
  );

  const back = (
    <div className="relative h-full w-full" style={{ background: tier.card, color: tier.ink }}>
      <Ornament className="absolute" style={{ width: 260, left: -90, top: -70, maxWidth: 'none', opacity: 0.25 }} />
      <div className="absolute inset-x-0 top-[46px] flex flex-col items-center">
        <span className="block rounded-2xl bg-white p-2.5 shadow-lg">
          {qr ? <img src={qr} alt="QR" draggable={false} style={{ width: 138, height: 138 }} /> : <span className="block animate-pulse bg-black/10" style={{ width: 138, height: 138 }} />}
        </span>
        <p className="mt-3 text-[8.5px] font-bold uppercase tracking-[0.22em]">{t('Scan to open profile')}</p>
        <div className="mt-6 flex w-full px-5">
          {stat(pass.trips, t('Trips'))}
          {stat(pass.respects, 'Respect')}
          {stat(pass.since ?? '—', t('Member since'))}
        </div>
      </div>
      <p className="absolute inset-x-0 bottom-5 truncate px-4 text-center text-[9px] font-semibold tracking-wide text-white/70">
        {pass.username ? `@${pass.username}` : pass.name}
      </p>
    </div>
  );

  return (
    <LanyardBadge
      front={front}
      back={back}
      strapText="cx signal"
      strapLabel={pass.tier === 'golden' ? 'GOLDEN HOST' : 'CX WORLD'}
      strapColor="#0a0b0a"
      inkColor={tier.ink}
      cardColor={tier.card}
      height={height}
      flipLabels={{ front: t('Show front'), back: t('Show back') }}
      className="rounded-3xl bg-gradient-to-b from-[#0c0e0c] to-[#050605]"
    />
  );
}

/** The layer behind "Share profile": a dark, blurred backdrop with the person's pass in the middle and the
 *  actions under it. Closes on a tap outside, the X or Escape. The pass itself is untouched. */
export function ShareProfileSheet({ open, onClose, pass, heading, start }: {
  open: boolean; onClose: () => void; pass: PassData; heading?: string;
  /** An extra, full-width action under Share / Copy — used by the welcome pass. */
  start?: { label: string; onClick: () => void };
}) {
  const { t } = useLocale();
  const { toast } = useApp();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Safari tints its own bars from the page colour: while the layer is open they take its tone too.
    const root = document.documentElement;
    const app = document.getElementById('root');
    const prevRootBg = root.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevAppBg = app?.style.backgroundColor ?? '';
    root.style.backgroundColor = '#0a0b0a';
    document.body.style.backgroundColor = '#0a0b0a';
    // #root paints the page colour; while the layer is open that colour is the layer's own dark.
    if (app) app.style.backgroundColor = '#0a0b0a';
    // The page itself steps out of sight while the layer is open: Safari's bars sit over the page, and a
    // light page showing under them (or behind the clock and battery) reads as unfinished.
    const prevVis = app?.style.visibility ?? '';
    if (app) app.style.visibility = 'hidden';
    setChromeOverride({ light: '#0a0b0a', dark: '#0a0b0a' });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      root.style.backgroundColor = prevRootBg;
      document.body.style.backgroundColor = prevBodyBg;
      if (app) { app.style.backgroundColor = prevAppBg; app.style.visibility = prevVis; }
      setChromeOverride(null);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pass.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: t('Could not copy link'), icon: 'info' });
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: pass.name, url: pass.url });
      } catch {
        /* closed without sharing */
      }
      return;
    }
    await copy();
  };

  return createPortal(
    <div className="fixed inset-x-0 top-0 z-[400]" style={{ bottom: -160 }} role="dialog" aria-modal="true" aria-label={heading ?? t('CX Pass')}>
      {/* solid dark ground — the page behind is hidden while the layer is open */}
      <div
        className="pass-backdrop absolute inset-0"
        style={{ background: 'radial-gradient(75% 55% at 50% 38%, #1a1c1a 0%, #0a0b0a 72%)' }}
        onClick={onClose}
      />

      {/* Solid dark strips pinned to the top and bottom edges: Safari tints its status bar and toolbar from
          what sits there, and a translucent layer would let the white page show through. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bg-[#0a0b0a]" style={{ height: 'calc(env(safe-area-inset-top, 0px) + 28px)' }} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 28px)', height: 36, background: 'linear-gradient(#0a0b0a, transparent)' }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 bg-[#0a0b0a]" style={{ height: 200 }} />

      <button
        type="button"
        onClick={onClose}
        aria-label={t('Close')}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
      >
        <Icon name="x" size={20} />
      </button>

      <div
        className="absolute inset-x-0 top-0 flex flex-col items-center justify-center overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,env(safe-area-inset-top))]"
        style={{ height: '100dvh' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {heading && <h2 className="pass-rise mb-3 text-center font-display text-xl font-semibold text-white">{heading}</h2>}
        <div className="pass-drop w-full max-w-[24rem]">
          <CxPass pass={pass} />
        </div>
        <div className="pass-rise pass-rise--late mt-4 flex w-full max-w-[24rem] gap-2.5">
          <button
            type="button"
            onClick={() => void share()}
            style={{ backgroundColor: '#ffffff', color: '#0a0b0a' }}
            className="inline-flex h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl text-[15px] font-bold transition-transform active:scale-[0.97]"
          >
            <Icon name="share" size={19} /> {t('Share')}
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            aria-live="polite"
            className={`inline-flex h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl border text-[15px] font-semibold backdrop-blur-md transition-all active:scale-[0.97] ${
              copied ? 'border-white/30 bg-white/15 text-white' : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
            }`}
          >
            <Icon name={copied ? 'check' : 'paperclip'} size={19} /> {copied ? t('Copied') : t('Copy link')}
          </button>
        </div>
        {start && (
          <button
            type="button"
            onClick={start.onClick}
            className="mt-2.5 inline-flex h-14 w-full max-w-[24rem] items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 text-[15px] font-semibold text-white backdrop-blur-md transition-transform active:scale-[0.97]"
          >
            {start.label} <Icon name="arrowRight" size={17} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
