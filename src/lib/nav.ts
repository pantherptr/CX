import type { IconName } from '../components/Icon';

export interface NavItem {
  label: string;
  to: string;
  icon: IconName;
  badge?: number;
  /** Marks the CX Drive entry — rendered as a launcher button (opens the
   *  game modal) instead of a `NavLink`, since it has no route of its
   *  own. Kept as an explicit flag rather than matching on `label` so
   *  the special-cased render sites (DashboardShell, AppNavbar) don't
   *  depend on exact copy. */
  isDrive?: boolean;
}

/** Single source of truth for the authenticated app's driver-mode nav —
 *  used by both the dashboard sidebar (DashboardShell) and the compact
 *  app header's menu drawer (Navbar, on pages without a sidebar). */
export const customerNav = (unreadCount: number): NavItem[] => [
  { label: 'Overview', to: '/dashboard', icon: 'grid' },
  { label: 'Drive', to: '', icon: 'car', isDrive: true },
  { label: 'Browse Cars', to: '/browse', icon: 'search' },
  { label: 'My Trips', to: '/dashboard#trips', icon: 'trips' },
  { label: 'Saved Cars', to: '/dashboard#saved', icon: 'heart' },
  { label: 'Messages', to: '/messages', icon: 'message', badge: unreadCount || undefined },
  { label: 'Payments', to: '/settings#payments', icon: 'card' },
  { label: 'Rewards', to: '/dashboard#rewards', icon: 'gift' },
  { label: 'Profile', to: '/settings', icon: 'user' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
];

/** Host-mode nav — same sharing rationale as `customerNav`. */
export const hostNav = (unreadCount: number): NavItem[] => [
  { label: 'Overview', to: '/host', icon: 'grid' },
  { label: 'Drive', to: '', icon: 'car', isDrive: true },
  { label: 'My Cars', to: '/host#cars', icon: 'cars' },
  { label: 'Bookings', to: '/host#bookings', icon: 'trips' },
  { label: 'Calendar', to: '/host#calendar', icon: 'calendar' },
  { label: 'Messages', to: '/messages', icon: 'message', badge: unreadCount || undefined },
  { label: 'Earnings', to: '/host#earnings', icon: 'euro' },
  { label: 'Profile', to: '/settings', icon: 'user' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
];
