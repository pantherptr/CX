import { SceneFrame } from './SceneFrame';

/**
 * "Find your car": CX's own poster (a phone over a lit 3D Milan). The logo on the phone is the site's current wordmark,
 * laid over the picture, and the green lines of the poster are brought to life: light runs along the routes, the
 * chosen parcel pulses and the map pins glow. Drawn in the picture's own coordinates, so it scales with it.
 */
const CX_LETTERS = 'M917.0 559.0 L822.0 559.0 L570.3 767.7 L655.0 767.7 L734.3 702.7 L739.0 705.7 L796.0 767.7 L879.7 767.7 L785.7 666.7 L784.0 663.3Z M380.7 595.7 L360.0 619.3 L351.0 635.0 L344.7 650.7 L340.7 671.3 L341.0 689.3 L344.7 705.3 L356.3 728.7 L366.7 740.3 L377.3 749.3 L403.0 762.3 L415.3 765.7 L433.7 768.0 L536.3 768.0 L600.0 719.3 L441.3 719.3 L427.0 716.3 L419.7 713.0 L412.3 708.0 L402.7 696.3 L398.0 685.0 L397.0 669.7 L399.7 656.3 L405.0 644.7 L412.0 634.7 L425.0 622.7 L440.7 613.7 L461.3 608.3 L635.0 608.0 L578.0 559.0 L467.7 559.0 L451.0 561.0 L434.3 565.0 L416.3 572.0 L401.3 580.0Z';
const CX_BAT = 'M783.3 545.3 L741.0 488.3 L703.3 509.7 L696.3 486.3 L683.7 505.0 L682.0 504.7 L670.3 486.7 L669.0 486.7 L662.3 509.7 L625.3 488.3 L584.0 540.0 L587.3 541.3 L606.3 541.3 L624.3 557.3 L645.7 542.3 L682.7 591.7 L720.3 542.3 L740.7 557.3 L759.3 541.3 L774.0 542.0Z';

export function FindPoster() {
  return (
    <SceneFrame>
      <svg viewBox="0 0 1024 1536" preserveAspectRatio="xMidYMid meet" className="block h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="fp-bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1536">
            <stop offset="0" stopColor="#06150e" /><stop offset="1" stopColor="#0a1a12" />
          </linearGradient>
          <filter id="fp-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect x="-3000" y="-3000" width="7000" height="7600" fill="url(#fp-bg)" />
        <image href="/home/find-1024.webp" x="0" y="0" width="1024" height="1536" />

        {/* the site's wordmark replaces the logo on the phone */}
        <rect x="462" y="160" width="124" height="62" rx="14" fill="#080b0a" />
        <svg x="474" y="166" width="100" height="50" viewBox="334 480 588 293" color="#ffffff">
          <path fill="currentColor" fillRule="evenodd" d={CX_LETTERS} />
          <path fill="#2fe673" fillRule="evenodd" d={CX_BAT} />
        </svg>

        {/* green routes of the poster, alive */}
        <g fill="none" strokeLinecap="round" filter="url(#fp-glow)">
          <path className="fp-run" d="M0 1002 L218 930" stroke="#4dff8a" strokeWidth="5" />
          <path className="fp-run fp-run-2" d="M0 1232 L218 1196" stroke="#4dff8a" strokeWidth="5" />
          <path className="fp-run fp-run-3" d="M816 1122 L1024 1160" stroke="#4dff8a" strokeWidth="5" />
          <path className="fp-run fp-run-4" d="M846 1214 L1024 1282" stroke="#4dff8a" strokeWidth="5" />
          {/* the parcel around the chosen car */}
          <path className="fp-parcel" d="M344 640 L388 600 L470 626 L470 654 L424 688 Z" stroke="#4dff8a" strokeWidth="5" strokeLinejoin="round" />
        </g>
        {/* map pins glow */}
        {[[176, 812], [908, 1010]].map(([x, y], i) => (
          <circle key={i} className="fp-pulse" cx={x} cy={y} r="26" fill="#2fe673" style={{ animationDelay: `${i * 0.9}s` }} />
        ))}
        <circle className="fp-pulse" cx="437" cy="548" r="46" fill="#2fe673" style={{ animationDelay: '0.4s' }} />
      </svg>
    </SceneFrame>
  );
}
