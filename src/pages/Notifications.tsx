import { DashboardShell } from '../components/DashboardShell';
import { Icon } from '../components/Icon';

/**
 * No notification-generating events exist yet (bookings, host messages,
 * etc. are still mock — see Track B). Rather than fabricate example
 * notifications for a real signed-in account, this shows an honest empty
 * state; the moment real events exist, this becomes a real feed with the
 * same layout.
 */
export default function Notifications() {
  return (
    <DashboardShell variant="customer" active="Notifications">
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Notifications</h1>
        <p className="mt-1 text-[14px] text-muted">
          Booking updates, messages and account activity will show up here.
        </p>

        <div className="animate-fade-up mt-8 flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-20 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-muted">
            <Icon name="bell" size={26} />
          </span>
          <h2 className="mt-2 font-display text-xl font-semibold text-ink">You're all caught up</h2>
          <p className="max-w-sm text-[14px] text-muted">
            No notifications yet. Book a trip or list a car and we'll let you know the moment
            something needs your attention.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
