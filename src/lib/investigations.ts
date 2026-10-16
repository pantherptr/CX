/** CX Investigations: the desk that handles cases opened from X. Its art lives in /brand/investigations. */
export const INVESTIGATIONS = {
  name: 'CX Investigations',
  car: '/brand/investigations/car.webp',
  agents: '/brand/investigations/agents.webp',
  logo: '/brand/investigations/logo.webp',
  agentM: '/brand/investigations/agent-m.webp',
  agentF: '/brand/investigations/agent-f.webp',
} as const;

/** One of the two investigators, always the same one for the same conversation. */
export function agentFor(conversationId: string): { src: string; name: string } {
  let h = 0;
  for (let i = 0; i < conversationId.length; i++) h = (h * 31 + conversationId.charCodeAt(i)) >>> 0;
  return h % 2 === 0 ? { src: INVESTIGATIONS.agentM, name: 'Investigator' } : { src: INVESTIGATIONS.agentF, name: 'Investigator' };
}
