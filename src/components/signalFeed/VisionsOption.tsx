import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { useAuth } from '../../lib/auth';
import { useLocale } from '../../lib/i18n';
import { fetchPostVisionFlags, fetchVisionsEnabled, setPostVision } from '../../lib/data/visions';

/** The Visions choice a composer carries: off by default, only offered to
 *  someone who switched Visions on, and only for a post that has a photo or
 *  video. `apply` is called right after the post itself was saved. */
export function useVisionChoice(editingId?: string) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [enabled, setEnabled] = useState(false);
  const [isVision, setIsVision] = useState(false);
  const [visionOnly, setVisionOnly] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    fetchVisionsEnabled(uid).then((on) => { if (!cancelled) setEnabled(on); });
    return () => { cancelled = true; };
  }, [uid]);

  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    fetchPostVisionFlags([editingId]).then((m) => {
      const f = m.get(editingId);
      if (!cancelled && f) {
        setIsVision(true);
        setVisionOnly(f.visionOnly);
      }
    });
    return () => { cancelled = true; };
  }, [editingId]);

  const apply = async (postId: string, hasMedia: boolean): Promise<void> => {
    if (!enabled) return;
    const want = hasMedia && isVision;
    // Nothing chosen on a brand-new post → leave it a normal post.
    if (!want && !editingId) return;
    await setPostVision(postId, want, want && visionOnly);
  };

  /** True when the post being saved should stay out of the public feed. */
  const hidesFromFeed = (hasMedia: boolean) => enabled && hasMedia && isVision && visionOnly;

  return { enabled, isVision, setIsVision, visionOnly, setVisionOnly, apply, hidesFromFeed };
}

export type VisionChoice = ReturnType<typeof useVisionChoice>;

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-accent-bright' : 'bg-line-strong'}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-hair transition-transform duration-200 ${on ? 'translate-x-4' : ''}`} />
    </button>
  );
}

/** "Publish in Signal ✓ / Also add to Visions [toggle] / Visions only". */
export function VisionsOption({ choice, hasMedia }: { choice: VisionChoice; hasMedia: boolean }) {
  const { t } = useLocale();
  if (!choice.enabled || !hasMedia) return null;
  const { isVision, setIsVision, visionOnly, setVisionOnly } = choice;
  return (
    <div className="mt-3 rounded-2xl border border-line bg-panel/60 px-3.5 py-1.5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className={`text-detail font-medium ${isVision && visionOnly ? 'text-faint' : 'text-ink'}`}>{t('Publish in Signal')}</span>
        {isVision && visionOnly ? (
          <span className="grid h-6 w-6 place-items-center text-faint"><Icon name="minus" size={16} /></span>
        ) : (
          <span className="grid h-6 w-6 place-items-center text-accent-700"><Icon name="check" size={16} strokeWidth={3} /></span>
        )}
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3 border-t border-line">
        <span className="text-detail font-medium text-ink">{t('Also add to Visions')}</span>
        <Switch on={isVision} onChange={(v) => { setIsVision(v); if (!v) setVisionOnly(false); }} label={t('Also add to Visions')} />
      </div>
      {isVision && (
        <div className="flex min-h-11 items-center justify-between gap-3 border-t border-line">
          <span className="text-detail font-medium text-ink">{t('Only in Visions')}</span>
          <Switch on={visionOnly} onChange={setVisionOnly} label={t('Only in Visions')} />
        </div>
      )}
    </div>
  );
}
