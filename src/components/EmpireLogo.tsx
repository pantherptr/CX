/** The one official EMPIRE crest image, rendered at whatever size a nav
 *  surface needs — always the same file, same proportions (object-contain,
 *  height-driven), never cropped or redrawn differently per surface. */
export function EmpireLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/empire-logo.png"
      alt=""
      className={`shrink-0 object-contain ${className}`}
      style={{ height: size, width: 'auto' }}
    />
  );
}
