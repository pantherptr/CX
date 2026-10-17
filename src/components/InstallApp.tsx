import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import QRCode from 'qrcode';
import { Icon } from './Icon';
import { Modal } from './primitives';
import { useLocale } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { openInstallSheet, snoozeInstallInvite, useInstall } from '../lib/installApp';

const ShareGlyph = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 15V3" /><path d="m8 7 4-4 4 4" /><path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
  </svg>
);
const PlusSquare = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
);

function Step({ n, icon, title, desc }: { n: number; icon: React.ReactNode; title: string; desc?: string }) {
  return (
    <li className="flex items-center gap-4 py-3.5">
      <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-050 text-accent-700">
        {icon}
        <span className="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">{n}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        {desc && <span className="block text-caption text-muted">{desc}</span>}
      </span>
    </li>
  );
}

function QrCode() {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(window.location.origin, { margin: 1, width: 360, color: { dark: '#0a0d0b', light: '#ffffff' } }).then(setSrc).catch(() => {});
  }, []);
  return src ? <img src={src} alt="" width={168} height={168} className="h-[168px] w-[168px] rounded-2xl border border-line bg-white p-2" /> : <span className="skeleton block h-[168px] w-[168px] rounded-2xl" />;
}

/** The "Get the app" sheet: one tap where the browser allows it, otherwise the few steps for the phone. */
export function InstallSheet() {
  const { t } = useLocale();
  const { platform, nativePrompt, install, installed } = useInstall();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const fn = () => setOpen(true);
    window.addEventListener('cx:install', fn);
    return () => window.removeEventListener('cx:install', fn);
  }, []);

  const doInstall = async () => {
    const r = await install();
    if (r === 'accepted') setOpen(false);
  };

  return (
    <Modal open={open} onClose={() => setOpen(false)} labelledBy="install-title">
      <div className="px-5 pb-6 pt-2">
        <p className="eyebrow">{t('Get the app')}</p>
        <h2 id="install-title" className="mt-1 font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-ink">{t('CX on your Home Screen')}</h2>
        <p className="mt-1.5 text-body text-ink-soft">{t('Opens like an app, full screen, with notifications for your messages and trips. No store, no download.')}</p>

        {installed ? (
          <p className="mt-5 rounded-2xl bg-accent-050 px-4 py-3 text-body font-medium text-accent-700">{t('CX is already on this device.')}</p>
        ) : platform === 'ios' ? (
          <>
            <ol className="mt-4 divide-y divide-line">
              <Step n={1} icon={<ShareGlyph />} title={t('Tap Share in Safari’s bar')} desc={t('The square with the arrow, at the bottom.')} />
              <Step n={2} icon={<PlusSquare />} title={t('Choose “Add to Home Screen”')} desc={t('Scroll down the list if you do not see it.')} />
              <Step n={3} icon={<Icon name="check" size={22} strokeWidth={2.4} />} title={t('Open CX from your Home Screen')} desc={t('Notifications work from there.')} />
            </ol>
            <p className="mt-2 text-caption text-muted">{t('On iPhone this only works in Safari. If you are in another app, open this page in Safari first.')}</p>
          </>
        ) : platform === 'android' ? (
          nativePrompt ? (
            <button onClick={() => void doInstall()} className="btn btn-accent-bright btn-lg mt-5 w-full">{t('Install CX')}</button>
          ) : (
            <ol className="mt-4 divide-y divide-line">
              <Step n={1} icon={<Icon name="moreHorizontal" size={22} />} title={t('Open the browser menu')} desc={t('The three dots, top right.')} />
              <Step n={2} icon={<PlusSquare />} title={t('Tap “Install app” or “Add to Home screen”')} />
            </ol>
          )
        ) : (
          <div className="mt-5 flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <QrCode />
            <div>
              <p className="text-[15px] font-semibold text-ink">{t('Open it on your phone')}</p>
              <p className="mt-1 text-detail text-muted">{t('Point your phone’s camera at the code, then follow the steps to add CX to the Home Screen.')}</p>
              {nativePrompt && <button onClick={() => void doInstall()} className="btn btn-secondary btn-sm mt-3">{t('Or install on this computer')}</button>}
            </div>
          </div>
        )}
        <button onClick={() => setOpen(false)} className="btn btn-secondary btn-lg mt-5 w-full">{t('Close')}</button>
      </div>
    </Modal>
  );
}

const INVITE_PATHS = ['/', '/list-your-car', '/about', '/how-it-works', '/help'];

/** A small invitation for returning visitors on a phone (public pages only), closed with the X for two weeks. */
export function InstallBanner() {
  const { t } = useLocale();
  const { pathname } = useLocation();
  const { session } = useAuth();
  const { shouldInvite, platform, nativePrompt, install } = useInstall();
  const [shown, setShown] = useState(false);
  const [gone, setGone] = useState(false);
  const timer = useRef<number | null>(null);

  const eligible = shouldInvite && platform !== 'desktop' && !gone && (INVITE_PATHS.includes(pathname) || pathname.startsWith('/cars/'));
  useEffect(() => {
    if (!eligible) { setShown(false); return; }
    timer.current = window.setTimeout(() => setShown(true), 6000);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [eligible, pathname]);

  if (!eligible || !shown) return null;
  const close = () => { snoozeInstallInvite(14); setGone(true); };
  const go = async () => {
    if (platform === 'android' && nativePrompt) {
      const r = await install();
      if (r === 'accepted') { setGone(true); return; }
    }
    openInstallSheet();
  };
  return (
    <div
      role="dialog"
      aria-label={t('Get the app')}
      className="fixed inset-x-3 z-40 animate-[sheet-in_.35s_cubic-bezier(.2,.8,.2,1)_both] sm:hidden"
      style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${session ? '5.4rem' : '0.75rem'})` }}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 pr-2 shadow-pop backdrop-blur">
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight text-ink">{t('Get the CX app')}</p>
          <p className="truncate text-caption text-muted">{t('One tap from your Home Screen.')}</p>
        </div>
        <button onClick={() => void go()} className="btn btn-accent-bright btn-sm shrink-0">{platform === 'android' && nativePrompt ? t('Install') : t('How')}</button>
        <button onClick={close} aria-label={t('Close')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-faint active:bg-panel"><Icon name="x" size={16} /></button>
      </div>
    </div>
  );
}
