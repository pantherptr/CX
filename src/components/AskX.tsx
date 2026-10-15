import { lazy, Suspense } from 'react';

// The assistant's chat is a big module; the buttons that open it load it only when they are on screen.
const Launcher = lazy(() => import('./Concierge').then((m) => ({ default: m.AskXLaunchers })));

/** Round X button for headers. */
export function AskXIcon({ className = '' }: { className?: string }) {
  return (
    <Suspense fallback={<span className={`h-10 w-10 ${className}`} />}>
      <Launcher variant="icon" className={className} />
    </Suspense>
  );
}

/** A full-width "Ask X" row, for the top of the messages list. */
export function AskXRow({ className = '' }: { className?: string }) {
  return (
    <Suspense fallback={<span className={`block h-[68px] ${className}`} />}>
      <Launcher variant="row" className={className} />
    </Suspense>
  );
}
