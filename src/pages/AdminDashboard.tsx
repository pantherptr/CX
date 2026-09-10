import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/primitives';
import { useAuth } from '../lib/auth';
import { VerificationsPanel, UsersPanel, BookingsPanel, CarsPanel, EmpirePanel } from '../components/admin/panels';

type Tab = 'verifications' | 'users' | 'bookings' | 'cars' | 'empire';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'verifications', label: 'Verifications', icon: 'shield' },
  { id: 'users', label: 'Users', icon: 'users' },
  { id: 'bookings', label: 'Bookings', icon: 'trips' },
  { id: 'cars', label: 'Cars', icon: 'cars' },
  { id: 'empire', label: 'Empire', icon: 'trophy' },
];

export default function AdminDashboard() {
  const { signOut, profile } = useAuth();
  const [tab, setTab] = useState<Tab>('verifications');

  const handleSignOut = async () => {
    await signOut();
    window.location.assign('/');
  };

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 flex min-h-16 items-center gap-4 border-b border-line bg-surface/90 px-5 pt-safe backdrop-blur-xl">
        <Logo variant="symbol" />
        <div>
          <p className="font-display text-body font-semibold text-ink">Admin</p>
          <p className="text-caption text-muted">{profile?.full_name || 'Signed in'}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/" className="btn btn-secondary btn-sm">Back to site</Link>
          <button onClick={handleSignOut} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-panel" aria-label="Sign out">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </header>

      <div className="container-page py-6">
        <nav className="mb-6 flex gap-1.5 overflow-x-auto rounded-xl border border-line bg-panel/60 p-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-detail font-medium transition-colors ${
                tab === t.id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white'
              }`}
            >
              <Icon name={t.icon} size={16} /> {t.label}
            </button>
          ))}
        </nav>

        {tab === 'verifications' && <VerificationsPanel />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'bookings' && <BookingsPanel />}
        {tab === 'cars' && <CarsPanel />}
        {tab === 'empire' && <EmpirePanel />}
      </div>
    </div>
  );
}
