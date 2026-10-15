import { useId } from 'react';

/**
 * The CX wordmark: the letters C and X (they follow the text colour: dark on light pages, light on dark ones)
 * with the CX bat above the join in polished green metal. Traced from the supplied artwork, so it is exactly that drawing, as
 * vectors that stay crisp at any size.
 *
 * viewBox 334 480 588 293.
 */
export function CxWordmark({ className = '', title = 'CX' }: { className?: string; title?: string }) {
  const gid = `cx-bat-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg viewBox="334 480 588 293" role="img" aria-label={title} className={className} fill="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5af59a" />
          <stop offset="0.35" stopColor="#12d85a" />
          <stop offset="0.6" stopColor="#0fb84a" />
          <stop offset="1" stopColor="#2fe673" />
        </linearGradient>
      </defs>
      <path fill="currentColor" fillRule="evenodd" d="M917.0 559.0 L822.0 559.0 L570.3 767.7 L655.0 767.7 L734.3 702.7 L739.0 705.7 L796.0 767.7 L879.7 767.7 L785.7 666.7 L784.0 663.3Z M380.7 595.7 L360.0 619.3 L351.0 635.0 L344.7 650.7 L340.7 671.3 L341.0 689.3 L344.7 705.3 L356.3 728.7 L366.7 740.3 L377.3 749.3 L403.0 762.3 L415.3 765.7 L433.7 768.0 L536.3 768.0 L600.0 719.3 L441.3 719.3 L427.0 716.3 L419.7 713.0 L412.3 708.0 L402.7 696.3 L398.0 685.0 L397.0 669.7 L399.7 656.3 L405.0 644.7 L412.0 634.7 L425.0 622.7 L440.7 613.7 L461.3 608.3 L635.0 608.0 L578.0 559.0 L467.7 559.0 L451.0 561.0 L434.3 565.0 L416.3 572.0 L401.3 580.0Z" />
      <path fill={`url(#${gid})`} fillRule="evenodd" d="M783.3 545.3 L741.0 488.3 L703.3 509.7 L696.3 486.3 L683.7 505.0 L682.0 504.7 L670.3 486.7 L669.0 486.7 L662.3 509.7 L625.3 488.3 L584.0 540.0 L587.3 541.3 L606.3 541.3 L624.3 557.3 L645.7 542.3 L682.7 591.7 L720.3 542.3 L740.7 557.3 L759.3 541.3 L774.0 542.0Z" />
    </svg>
  );
}
