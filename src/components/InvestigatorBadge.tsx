import { agentFor } from '../lib/investigations';

/** The investigator on a case, as a badge number instead of a portrait: "N° 03" in a dark round tag with the CX green
 *  ring. The number is fixed for the case (agentFor), like the name. */
export function InvestigatorBadge({ caseId, size = 40, className = '' }: { caseId: string; size?: number; className?: string }) {
  const n = String(agentFor(caseId).index + 1).padStart(2, '0');
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 flex-col items-center justify-center rounded-full bg-[#0b0f0c] text-white ${className}`}
      style={{ width: size, height: size, boxShadow: `0 0 0 ${Math.max(1.5, size / 28)}px #0b0f0c, 0 0 0 ${Math.max(2.5, size / 18)}px #00d447` }}
    >
      <span className="font-bold uppercase leading-none tracking-[0.12em] text-[#00d447]" style={{ fontSize: size * 0.2 }}>N°</span>
      <span className="font-display font-black leading-none tracking-tight" style={{ fontSize: size * 0.4, marginTop: size * 0.02 }}>{n}</span>
    </span>
  );
}
