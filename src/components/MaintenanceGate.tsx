import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Logo } from './primitives';
import { useAuth } from '../lib/auth';
import { usePlatformSettings } from '../lib/data/platform';

/**
 * Site-wide enforcement for supabase/migrations/0022_owner_master_control.sql's
 * platform_settings row. Two independent things, both real:
 *
 *  - maintenance_mode: takes over the ENTIRE app for everyone except the
 *    Owner, who always needs to be able to get back in to turn it back
 *    off. This is a client-side gate for UX (showing the right screen
 *    instantly) — the actual data stays protected by RLS regardless of
 *    whether this component even ran, same boundary philosophy as
 *    OwnerRoute/AdminRoute.
 *  - announcement: a dismissible banner, shown to everyone, that doesn't
 *    block anything.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = usePlatformSettings();
  const [dismissed, setDismissed] = useState(false);

  // Never gate before we actually know who's asking — an Owner refreshing
  // mid-maintenance must not flash the maintenance screen first.
  if (authLoading || settingsLoading) return <>{children}</>;

  if (settings?.maintenanceMode && !profile?.is_owner) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-noir px-6 text-center text-white">
        <Logo variant="symbol" />
        <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-accent-bright">
          <Icon name="settings" size={26} />
        </span>
        <div className="max-w-md">
          <h1 className="font-display text-2xl font-semibold">We'll be right back</h1>
          <p className="mt-2 text-body text-white/70">{settings.maintenanceMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {settings?.announcementActive && settings.announcementMessage && !dismissed && (
        <div className="relative flex items-center justify-center gap-2 bg-noir px-10 py-2.5 text-center text-detail font-medium text-white">
          <Icon name="sparkles" size={14} className="text-accent-bright" />
          {settings.announcementMessage}
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss announcement"
            className="absolute right-3 grid h-6 w-6 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      {children}
    </>
  );
}
