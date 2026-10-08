import { useSyncExternalStore } from 'react';

/** How an Owner/Admin's repeated taps stack: `single` adds one per tap,
 *  `double` adds as many as they already have (1, 2, 4, 8…). Per device. */
export type TeamTapMode = 'single' | 'double';

const KEY = 'cx-team-tap-mode';
const listeners = new Set<() => void>();

function read(): TeamTapMode {
  try {
    return localStorage.getItem(KEY) === 'double' ? 'double' : 'single';
  } catch {
    return 'single';
  }
}

let current: TeamTapMode = read();

export function setTeamTapMode(mode: TeamTapMode) {
  current = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private mode — lasts for this visit */
  }
  listeners.forEach((l) => l());
}

export const getTeamTapMode = () => current;

export function useTeamTapMode(): TeamTapMode {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current,
    () => 'single' as TeamTapMode,
  );
}

/** How many to add on this tap, given how many the person already has —
 *  doubling is the Owner's alone; an Admin always adds one. */
export function tapAmount(have: number, isOwner: boolean, mode: TeamTapMode = current): number {
  return isOwner && mode === 'double' ? Math.max(1, have) : 1;
}
