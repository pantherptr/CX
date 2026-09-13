import type { StoryBgStyle, StoryTextAlign, StoryTextSize } from '../../lib/data/empireStories';

/** The one shared renderer for a text Story slide — used live in the
 *  composer's editor/preview and in the fullscreen viewer, so the two
 *  can never drift apart. A small fixed palette (five presets: solid
 *  noir/green/gold, plus two subtle two-stop gradients toward green and
 *  gold) rather than a free color picker — "do not create hundreds of
 *  options" from the brief, and every option is an existing CX Rent
 *  brand color, never arbitrary. */
export const STORY_BG_STYLES: { value: StoryBgStyle; label: string; className: string }[] = [
  { value: 'noir', label: 'Noir', className: 'bg-noir' },
  { value: 'accent', label: 'Signal', className: 'bg-accent' },
  { value: 'gold', label: 'Gold', className: 'bg-[#8a6d1f]' },
  { value: 'gradient-signal', label: 'Signal Fade', className: 'bg-gradient-to-br from-noir to-accent-700' },
  { value: 'gradient-gold', label: 'Gold Fade', className: 'bg-gradient-to-br from-noir to-[#5f4a12]' },
];

const ALIGN_CLASS: Record<StoryTextAlign, string> = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
};

const SIZE_CLASS: Record<StoryTextSize, string> = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl',
};

export function StoryTextSlide({
  content,
  align,
  size,
  bg,
  className = '',
}: {
  content: string;
  align?: StoryTextAlign | null;
  size?: StoryTextSize | null;
  bg?: StoryBgStyle | null;
  className?: string;
}) {
  const bgDef = STORY_BG_STYLES.find((b) => b.value === bg) ?? STORY_BG_STYLES[0];
  return (
    <div className={`flex h-full w-full flex-col justify-center gap-2 p-8 ${bgDef.className} ${ALIGN_CLASS[align ?? 'center']} ${className}`}>
      <p className={`whitespace-pre-wrap break-words font-display font-semibold leading-tight text-white ${SIZE_CLASS[size ?? 'md']}`}>
        {content || ' '}
      </p>
    </div>
  );
}
