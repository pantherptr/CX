import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { fetchEmpireStoryInsights, type EmpireStoryInsights } from '../../lib/data/empireStories';
import { MotionSheet } from '../motionKit';

/** The creator's "Story Insights" panel — two aggregate numbers, nothing
 *  else. Deliberately does not, and structurally cannot, show a viewer
 *  list: `fetchEmpireStoryInsights` only ever returns `{ views,
 *  respects }` (see fetch_empire_story_insights's own comment), so there
 *  is no "Seen by" data in this component's reach to begin with — no
 *  client-side filtering standing between the creator and viewer
 *  identities, because that data was never fetched. */
export function SignalStoryInsights({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const requestClose = () => setClosing(true);
  const [data, setData] = useState<EmpireStoryInsights | 'error' | null>(null);

  useEffect(() => {
    fetchEmpireStoryInsights(storyId).then(setData).catch(() => setData('error'));
  }, [storyId]);

  return (
    <MotionSheet
      open={!closing}
      onClose={requestClose}
      onExitComplete={onClose}
      panelClassName="rounded-t-2xl bg-surface sm:max-w-sm sm:rounded-2xl"
    >
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <Icon name="chart" size={18} className="text-ink-soft" />
        <span className="font-display font-semibold text-ink">Story Insights</span>
        <button onClick={requestClose} aria-label="Close" className="pressable ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
          <Icon name="x" size={19} />
        </button>
      </div>

      <div className="p-5">
        {data === null ? (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="skeleton h-24 rounded-xl" />
            <div className="skeleton h-24 rounded-xl" />
          </div>
        ) : data === 'error' ? (
          <p className="py-6 text-center text-detail text-muted">Couldn't load Story insights right now.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-line bg-panel p-4 text-center">
              <Icon name="eye" size={20} className="mx-auto text-ink-soft" />
              <p className="mt-1.5 text-[22px] font-bold leading-none tabular-nums text-ink">{data.views.toLocaleString()}</p>
              <p className="mt-1 text-caption text-muted">Views</p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-4 text-center">
              <Icon name="like" size={20} className="mx-auto text-ink-soft" />
              <p className="mt-1.5 text-[22px] font-bold leading-none tabular-nums text-ink">{data.respects.toLocaleString()}</p>
              <p className="mt-1 text-caption text-muted">Respects</p>
            </div>
          </div>
        )}
      </div>
    </MotionSheet>
  );
}
