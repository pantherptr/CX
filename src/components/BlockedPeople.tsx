import { useEffect, useState } from 'react';
import { Img } from './motion';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import { useLocale } from '../lib/i18n';
import { fetchBlockedUsers, unblockUser, type BlockedUser } from '../lib/data/messages';

/** Settings → Security: the people you blocked, with a way back. Shows nothing when the list is empty. */
export function BlockedPeople() {
  const { t } = useLocale();
  const { toast } = useApp();
  const [list, setList] = useState<BlockedUser[] | null>(null);
  useEffect(() => { void fetchBlockedUsers().then(setList); }, []);
  if (!list || list.length === 0) return null;
  const unblock = async (b: BlockedUser) => {
    const { error } = await unblockUser(b.id);
    if (error) { toast({ title: t('Could not unblock'), desc: error, icon: 'shield' }); return; }
    setList((l) => (l ?? []).filter((x) => x.id !== b.id));
    toast({ title: t('{name} is unblocked', { name: b.name }), icon: 'check' });
  };
  return (
    <section className="mt-5">
      <h3 className="mb-2 px-1 text-[12px] font-semibold text-muted">{t('Blocked people')}</h3>
      <ul className="divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-surface">
        {list.map((b) => (
          <li key={b.id} className="flex items-center gap-3 px-4 py-3">
            {b.avatar ? (
              <Img src={b.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" fallback={<span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>} />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>
            )}
            <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">{b.name}</span>
            <button onClick={() => void unblock(b)} className="btn btn-secondary btn-sm shrink-0">{t('Unblock')}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
