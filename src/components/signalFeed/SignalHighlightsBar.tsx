import { useState } from 'react';
import { useEmpireHighlights, highlightAsStory, deleteEmpireHighlight } from '../../lib/data/empireHighlights';
import { SignalStoryViewer } from './SignalStoryViewer';

/** Permanent Story Highlights — sits below the ephemeral Stories row,
 *  above the feed. Visually quieter than live Stories on purpose (a flat
 *  neutral ring, not the bright gradient "new" ring): these are curated
 *  reference collections (NEW CARS, OFFERS, EVENTS…), not time-sensitive.
 *  Collapses to nothing when there are none — same rule as every other
 *  optional Signal section. Reuses `SignalStoryViewer` via `highlightAsStory`
 *  rather than a second fullscreen component. */
export function SignalHighlightsBar({ canManage }: { canManage: boolean }) {
  const { highlights, refresh } = useEmpireHighlights();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!highlights || highlights.length === 0) return null;

  return (
    <>
      <div className="no-scrollbar mb-3 flex gap-3 overflow-x-auto pb-1">
        {highlights.map((h, i) => (
          <button key={h.id} onClick={() => setOpenIndex(i)} className="pressable flex shrink-0 flex-col items-center gap-1">
            <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-line-strong p-[2.5px]">
              <span className="h-full w-full overflow-hidden rounded-full border-2 border-surface bg-panel">
                {h.slides[0] && <img src={h.slides[0].mediaUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
              </span>
            </span>
            <span className="max-w-[60px] truncate text-[10.5px] font-medium text-ink-soft">{h.title}</span>
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <SignalStoryViewer
          stories={highlights.map(highlightAsStory)}
          startIndex={openIndex}
          canManage={canManage}
          onClose={() => setOpenIndex(null)}
          onStoryDeleted={refresh}
          onMarkViewed={() => {}}
          onDeleteStory={deleteEmpireHighlight}
          deleteConfirmMessage="Delete this Highlight? This cannot be undone."
        />
      )}
    </>
  );
}
