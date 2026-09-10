import type { ActivityItem } from '../../lib/data/activity';
import { ActivityFeedItem } from './ActivityFeedItem';

/** The persistent notification center — real events (bookings, contracts,
 *  missions, finance) alongside flavor content (competitor news, event
 *  announcements), newest first. This is the one place "what happened"
 *  survives after a CelebrationMoment popup disappears. */
export function ActivityFeed({ feed }: { feed: ActivityItem[] }) {
  if (feed.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-noir-2 p-5 text-center">
        <p className="text-detail text-on-noir-muted">Nothing yet — assign a car to a district to get things moving.</p>
      </div>
    );
  }

  return (
    <div className="max-h-96 divide-y divide-white/6 overflow-y-auto rounded-2xl border border-white/10 bg-noir-2 px-4">
      {feed.slice(0, 20).map((item) => (
        <ActivityFeedItem key={item.id} item={item} />
      ))}
    </div>
  );
}
