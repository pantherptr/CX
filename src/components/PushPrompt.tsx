import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import { disableWebPush, enableWebPush, getWebPushState, type WebPushState } from '../lib/webPush';

/** "Get notified outside the site": one clear control for the browser / home-screen app. */
export function PushPrompt({ userId, variant = 'banner' }: { userId: string | undefined; variant?: 'banner' | 'row' }) {
  const { toast } = useApp();
  const [state, setState] = useState<WebPushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void getWebPushState().then(setState); }, [userId]);
  if (!userId || state === null || state === 'unsupported') return null;
  if (variant === 'banner' && (state === 'on' || state === 'unconfigured' || state === 'blocked')) return null;

  const turnOn = async () => {
    setBusy(true);
    const r = await enableWebPush();
    setBusy(false);
    setState(r.state);
    if (r.state === 'on') toast({ title: 'Notifications are on', desc: 'You will hear from us even when the site is closed.', icon: 'bell' });
    else if (r.state === 'blocked') toast({ title: 'Blocked in your browser', desc: 'Allow notifications for this site in the browser settings.', icon: 'info' });
    else if (r.error) toast({ title: 'Could not turn them on', desc: r.error, icon: 'info' });
  };
  const turnOff = async () => {
    setBusy(true);
    await disableWebPush();
    setBusy(false);
    setState('off');
  };

  const copy: Record<WebPushState, { title: string; sub: string }> = {
    'unsupported': { title: '', sub: '' },
    'needs-install': {
      title: 'Add CX to your Home Screen',
      sub: 'On iPhone, notifications need the app on your Home Screen: tap Share → Add to Home Screen, then open it from there.',
    },
    'unconfigured': { title: 'Browser notifications', sub: 'Not available yet.' },
    'blocked': { title: 'Notifications are blocked', sub: 'Allow them for this site in your browser settings, then come back.' },
    'off': { title: 'Get notified on this device', sub: 'Messages, bookings, payments and verification — even when the site is closed.' },
    'on': { title: 'Notifications are on', sub: 'On this device, even when the site is closed.' },
  };
  const c = copy[state];

  if (variant === 'row') {
    return (
      <div className="flex items-start gap-3.5 px-4 py-3.5">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-panel text-ink"><Icon name="bell" size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-ink">{c.title}</p>
          <p className="mt-0.5 text-detail text-muted">{c.sub}</p>
        </div>
        {state === 'off' && <button onClick={turnOn} disabled={busy} className="btn btn-primary btn-sm shrink-0 disabled:opacity-60">{busy ? '…' : 'Turn on'}</button>}
        {state === 'on' && <button onClick={turnOff} disabled={busy} className="btn btn-secondary btn-sm shrink-0 disabled:opacity-60">Turn off</button>}
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl bg-gradient-to-br from-[#0b1a10] via-[#0f3a1d] to-accent p-4 text-white shadow-[0_16px_36px_-18px_rgba(0,133,54,0.7)]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15"><Icon name="bell" size={19} /></span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[16px] font-semibold leading-tight">{c.title}</p>
        <p className="mt-0.5 text-detail text-white/80">{c.sub}</p>
      </div>
      {state === 'off' && (
        <button onClick={turnOn} disabled={busy} className="shrink-0 rounded-full bg-white px-3.5 py-2 text-detail font-semibold text-ink active:scale-95 disabled:opacity-60">
          {busy ? '…' : 'Turn on'}
        </button>
      )}
    </div>
  );
}
