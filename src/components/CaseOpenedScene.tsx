import { InvestigationsMark } from './InvestigationsMark';
import { INVESTIGATIONS, agentFor } from '../lib/investigations';
import { useLocale } from '../lib/i18n';

/**
 * "Case opened", as a scene instead of a card: no frame, no box. A feathered pool of night with rain and fog,
 * the investigator on the left coming out of the dark, the CX car rising on the right with its reflection on
 * the wet ground, the title floating in the space between. Everything dissolves at the edges (masks), so it
 * reads as part of the chat rather than a rectangle in it.
 */
export function CaseOpenedScene({ seed, className = '' }: { seed: string; className?: string }) {
  const { t } = useLocale();
  const agent = agentFor(seed).src;
  const feather: React.CSSProperties = {
    WebkitMaskImage: 'radial-gradient(ellipse 50% 50% at 50% 50%, #000 48%, transparent 100%)',
    maskImage: 'radial-gradient(ellipse 50% 50% at 50% 50%, #000 48%, transparent 100%)',
  };
  return (
    <div data-theme="dark" className={`cx-scene relative isolate w-full select-none text-white ${className}`} style={{ height: 250 }} role="img" aria-label={`${t('Case opened')}. ${t('An investigator has your case')}`}>
      {/* the night: feathered at every edge */}
      <div aria-hidden className="absolute inset-0 -z-10" style={feather}>
        <div className="absolute inset-0 bg-[#010302]" />
        <div className="absolute -bottom-10 -left-8 h-48 w-56 rounded-full bg-[#00d447]/35 blur-3xl" />
        <div className="absolute -bottom-12 -right-6 h-44 w-64 rounded-full bg-[#00ff66]/30 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-24 w-72 -translate-x-1/2 rounded-full bg-[#00a63a]/20 blur-3xl" />
        {/* rain */}
        <div className="cx-scene-rain absolute inset-0 opacity-60" />
        {/* fog drifting through */}
        <div className="cx-scene-fog absolute -left-10 bottom-6 h-24 w-[70%] rounded-full bg-white/10 blur-2xl" />
        <div className="cx-scene-fog2 absolute -right-10 bottom-14 h-20 w-[60%] rounded-full bg-[#9dffc0]/10 blur-2xl" />
        {/* hazard tape, only as litter on the ground */}
        <div
          className="absolute bottom-5 left-[6%] h-2 w-[34%] -rotate-[4deg] opacity-45"
          style={{ backgroundImage: 'repeating-linear-gradient(-45deg,#f4c400 0 9px,#0a0a0a 9px 18px)', WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 25%,#000 70%,transparent)', maskImage: 'linear-gradient(90deg,transparent,#000 25%,#000 70%,transparent)' }}
        />
        <div
          className="absolute bottom-9 right-[8%] h-1.5 w-[22%] rotate-[3deg] opacity-35"
          style={{ backgroundImage: 'repeating-linear-gradient(-45deg,#f4c400 0 7px,#0a0a0a 7px 14px)', WebkitMaskImage: 'linear-gradient(90deg,#000,transparent)', maskImage: 'linear-gradient(90deg,#000,transparent)' }}
        />
        {/* sparks */}
        {[ ['18%', '58%', '0s'], ['27%', '72%', '1.1s'], ['74%', '66%', '.6s'], ['82%', '80%', '1.7s'] ].map(([l, tp, d], i) => (
          <span key={i} className="cx-scene-spark absolute h-[3px] w-[3px] rounded-full bg-[#b9ffd0]" style={{ left: l, top: tp, animationDelay: d }} />
        ))}
      </div>

      {/* the investigator: black background screened away, edges dissolved */}
      <img
        src={agent}
        alt=""
        className="cx-scene-agent absolute bottom-0 left-[2%] h-[80%] w-auto max-w-[50%] object-cover object-top"
        style={{
          filter: 'contrast(1.45) brightness(1.05)',
          WebkitMaskImage: 'radial-gradient(ellipse 44% 46% at 50% 46%, #000 30%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 44% 46% at 50% 46%, #000 30%, transparent 100%)',
        }}
      />

      {/* the car, with its reflection on the wet ground */}
      <div className="cx-scene-car absolute bottom-3 right-[3%] w-[48%]">
        <img src={INVESTIGATIONS.car} alt="" className="relative z-10 w-full drop-shadow-[0_0_22px_rgba(0,255,102,0.55)]" />
        <img
          src={INVESTIGATIONS.car}
          alt=""
          aria-hidden
          className="absolute left-0 top-full w-full opacity-20 blur-[1.5px]"
          style={{
            transform: 'scaleY(-1)',
            WebkitMaskImage: 'linear-gradient(0deg,#000,transparent 28%)',
            maskImage: 'linear-gradient(0deg,#000,transparent 28%)',
          }}
        />
      </div>

      {/* the words, floating in the open space */}
      <div className="pointer-events-none absolute inset-x-0 top-[26px] flex flex-col items-center px-6 text-center">
        <p className="text-[23px] font-black uppercase leading-none tracking-[0.1em] text-white [text-shadow:0_0_18px_rgba(0,255,102,0.55),0_2px_0_rgba(0,0,0,0.6)] sm:text-[28px]">
          {t('Case opened')}
        </p>
        <p className="mt-2 text-[13px] font-medium text-white/80 [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">{t('An investigator has your case')}</p>
        <InvestigationsMark tone="light" size="sm" className="mt-2.5" />
      </div>
    </div>
  );
}
