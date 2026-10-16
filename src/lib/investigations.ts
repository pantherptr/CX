/** CX Investigations: the desk that handles cases opened from X. Its art lives in /brand/investigations. */
export const INVESTIGATIONS = {
  name: 'CX Investigations',
  car: '/brand/investigations/car.webp',
  agents: '/brand/investigations/agents.webp',
  logo: '/brand/investigations/logo.webp',
} as const;

/** The fourteen investigators half-body portraits, /brand/investigations/inv-00 … inv-13. */
export const INVESTIGATORS: { name: string; src: string }[] = [
  'Dante', 'Nova', 'Atlas', 'Cassian', 'Aurora', 'Maverick', 'Vittoria',
  'Zane', 'Rocco', 'Selene', 'Draco', 'Lyra', 'Gabriel', 'Enea',
].map((name, i) => ({ name, src: `/brand/investigations/inv-${String(i).padStart(2, '0')}.webp` }));

/** The investigator of a case: picked at random once, and always the same for the same conversation. */
export function agentFor(conversationId: string): { src: string; name: string; index: number } {
  let h = 2166136261;
  for (let i = 0; i < conversationId.length; i++) h = Math.imul(h ^ conversationId.charCodeAt(i), 16777619) >>> 0;
  const index = h % INVESTIGATORS.length;
  return { ...INVESTIGATORS[index], index };
}
