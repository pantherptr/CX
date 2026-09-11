/** Sound-ready seam for the Empire game shell — every HUD/nav/claim call
 *  site plays sounds through this hook rather than touching Audio() or a
 *  library directly, so real ambient/UI/reward sound can be wired in later
 *  by filling in this one function without touching any call site. No
 *  audio assets exist yet, so this is intentionally a no-op today. */
export type GameSoundKey = 'tab_switch' | 'claim' | 'exit' | 'enter' | 'notify';

export function useGameSound() {
  return {
    play: (_key: GameSoundKey) => {},
  };
}
