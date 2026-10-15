import { SignalS } from './SignalLogo';

/** SIGNAL's navigation "S" (the bottom-nav SIGNAL tab and the SIGNAL quick control): the same S as everywhere
 *  else — cut from the SIGNAL wordmark, flat vector, following the text colour with the green slash. */
export function CxsLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  return <SignalS size={size} className={className} animated />;
}
