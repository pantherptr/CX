import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img } from '../motion';
import type { EmpireVehicleRef } from '../../lib/data/empireFeed';
import { findOrCreateConversation } from '../../lib/data/messages';
import { useCompare } from '../../lib/compareStore';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../lib/store';
import { compact } from '../../lib/format';
import { KeysCta } from './KeysCta';

/** The car a post is about, with the three things you'd want to do next: book
 *  it, add it to Compare, or write to its host — the chat opens inside CX with
 *  the car already attached, so the conversation (and the booking) stay here. */
export function SignalVehicleCard({ vehicle, authorId, isOwnPost }: { vehicle: EmpireVehicleRef; authorId: string; isOwnPost: boolean }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { toast } = useApp();
  const { isComparing, toggleCompare } = useCompare();
  const [opening, setOpening] = useState(false);
  const comparing = isComparing(vehicle.id);

  const messageHost = async () => {
    if (!session) {
      navigate('/login');
      return;
    }
    if (opening) return;
    setOpening(true);
    try {
      const id = await findOrCreateConversation(vehicle.id, session.user.id, authorId);
      navigate(`/messages?c=${id}`);
    } catch {
      toast({ title: 'Could not open the chat', desc: 'Check your connection and try again.', icon: 'info' });
    } finally {
      setOpening(false);
    }
  };

  const pill = 'pressable inline-flex min-h-10 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-[13px] font-semibold transition-colors';

  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-2xl border border-line bg-panel/60 sm:mx-5">
      <Link to={`/cars/${vehicle.slug}`} className="pressable flex items-center gap-3 p-3">
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface">
          {vehicle.imageUrl ? (
            <Img
              src={vehicle.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              fallback={<span className="grid h-full w-full place-items-center text-muted"><Icon name="car" size={20} /></span>}
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-muted"><Icon name="car" size={20} /></span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </span>
          <span className="block truncate text-caption text-muted">
            {vehicle.city} · €{compact(vehicle.pricePerDay)}/day
          </span>
        </span>
        <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
      </Link>
      <div className={`grid gap-2 border-t border-line p-2.5 ${isOwnPost ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <Link to={`/cars/${vehicle.slug}`} className={`${pill} bg-ink text-white hover:bg-ink/90`}>
          Book
        </Link>
        <button
          type="button"
          onClick={() => toggleCompare(vehicle.id)}
          aria-pressed={comparing}
          className={`${pill} border ${comparing ? 'border-accent bg-accent-050 text-accent-700' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'}`}
        >
          {comparing ? <Icon name="check" size={14} strokeWidth={3} /> : null}
          {comparing ? 'Comparing' : 'Compare'}
        </button>
        {!isOwnPost && (
          <button
            type="button"
            onClick={() => void messageHost()}
            disabled={opening}
            className={`${pill} border border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink disabled:opacity-60`}
          >
            <Icon name="message" size={15} />
            {opening ? '…' : 'Message host'}
          </button>
        )}
      </div>
      {!isOwnPost && (
        <div className="border-t border-line p-2.5">
          <KeysCta carId={vehicle.id} carSlug={vehicle.slug} className="w-full" />
        </div>
      )}
    </div>
  );
}
