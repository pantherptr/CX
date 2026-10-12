import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';
import { Modal } from '../primitives';
import { useLocale } from '../../lib/i18n';
import type { EmpirePost } from '../../lib/data/empireFeed';

function Stat({ icon, label, value }: { icon: IconName; label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-panel text-ink-soft"><Icon name={icon} size={16} /></span>
      <p className="mt-2.5 font-display text-2xl font-semibold leading-none text-ink tabular-nums">{value}</p>
      <p className="mt-1 text-caption text-muted">{label}</p>
    </div>
  );
}

/** How one post is doing: the numbers the author is allowed to see, and what they mean together. */
export function SignalPostInsights({ post, open, onClose }: { post: EmpirePost; open: boolean; onClose: () => void }) {
  const { t } = useLocale();
  const actions = post.likeCount + post.saveCount + post.shareCount + post.commentCount;
  const rate = post.viewCount > 0 ? Math.min(100, Math.round((actions / post.viewCount) * 100)) : 0;
  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-5">
        <h2 className="font-display text-xl font-semibold text-ink">{t('Post insights')}</h2>
        <p className="mt-1 line-clamp-2 text-detail text-muted">{post.title || post.body}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat icon="eye" label={t('Views')} value={post.viewCount} />
          <Stat icon="like" label="Respect" value={post.likeCount} />
          <Stat icon="bookmark" label={t('Saves')} value={post.saveCount} />
          <Stat icon="share" label={t('Shares')} value={post.shareCount} />
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-accent-050 px-4 py-3">
          <span className="text-detail font-semibold text-accent-700">{t('Engagement')}</span>
          <span className="font-display text-xl font-semibold text-accent-700">{rate}%</span>
        </div>
        <p className="mt-2 px-1 text-caption text-faint">{t('Respect, saves, shares and comments, out of the people who saw it.')}</p>
        {post.vehicle && (
          <Link to={`/cars/${post.vehicle.slug}`} onClick={onClose} className="btn btn-secondary btn-block mt-4">
            <Icon name="car" size={16} /> {post.vehicle.make} {post.vehicle.model}
          </Link>
        )}
      </div>
    </Modal>
  );
}
