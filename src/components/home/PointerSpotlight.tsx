import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A soft green light behind its children that follows a finger or a cursor over the area: a bit smaller while it moves,
 * wider and breathing when everything is still (and it sits behind the subject, breathing, until someone touches it).
 * Scoped to its own box, not to the whole window. Static for people who have switched animations off.
 */
export function PointerSpotlight({ children, className = '' }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const idle = useRef<number | undefined>(undefined);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const el = box.current;
    if (!el || reduced) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      setMoving(true);
      window.clearTimeout(idle.current);
      idle.current = window.setTimeout(() => setMoving(false), 160);
    };
    const leave = () => { setPos(null); setMoving(false); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', move);
      el.removeEventListener('pointerleave', leave);
      window.clearTimeout(idle.current);
    };
  }, [reduced]);

  const size = moving ? 230 : 300;
  return (
    <div ref={box} className={`relative ${className}`} style={{ touchAction: 'pan-y' }}>
      <span
        aria-hidden
        className={`pointer-events-none absolute rounded-full transition-[left,top,width,height,opacity] duration-300 ease-out ${pos || reduced ? '' : 'cx-spot-breathe'}`}
        style={{
          left: pos ? pos.x : '50%',
          top: pos ? pos.y : '42%',
          width: size,
          height: size,
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(0,212,71,0.42) 0%, rgba(0,212,71,0.16) 42%, transparent 70%)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
