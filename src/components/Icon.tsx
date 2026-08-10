import type { CSSProperties, ReactElement } from 'react';

export type IconName =
  | 'search' | 'calendar' | 'pin' | 'star' | 'heart' | 'chevronDown'
  | 'chevronRight' | 'chevronLeft' | 'arrowRight' | 'arrowUpRight' | 'menu'
  | 'x' | 'check' | 'checkCircle' | 'shield' | 'users' | 'seat' | 'door'
  | 'gauge' | 'gas' | 'gear' | 'bolt' | 'sun' | 'flame' | 'gem' | 'mountain'
  | 'leaf' | 'car' | 'key' | 'wallet' | 'grid' | 'trips' | 'message' | 'bell'
  | 'settings' | 'user' | 'logout' | 'plus' | 'sliders' | 'sort' | 'clock'
  | 'phone' | 'camera' | 'upload' | 'card' | 'lock' | 'sparkles' | 'headset'
  | 'compass' | 'trending' | 'euro' | 'reviews' | 'send' | 'paperclip'
  | 'chart' | 'cars' | 'route' | 'globe' | 'instant' | 'snowflake' | 'music'
  | 'twitter' | 'instagram' | 'linkedin' | 'apple' | 'info' | 'verified';

const P: Record<IconName, ReactElement> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>,
  pin: <><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  heart: <path d="M12 20s-7-4.4-9.3-8.5C1 8 2.8 4.5 6.2 4.5c2 0 3.3 1.2 3.8 2.3.5-1.1 1.8-2.3 3.8-2.3 3.4 0 5.2 3.5 3.5 7C19 15.6 12 20 12 20Z" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
  arrowUpRight: <path d="M7 17 17 7m0 0H8m9 0v9" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m4 12 5 5L20 6" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5L15.5 9.5" /></>,
  shield: <><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" /><path d="M16 5.2A3.2 3.2 0 0 1 16 11m2.5 9c-.3-2-1.2-3.6-2.6-4.5" /></>,
  seat: <path d="M6 4v8a2 2 0 0 0 2 2h6m4 6-2-4a2 2 0 0 0-2-1.2H8L6 20" />,
  door: <><rect x="6" y="3.5" width="12" height="17" rx="2" /><path d="M14.5 12h.01" /></>,
  gauge: <><path d="M4 15a8 8 0 1 1 16 0" /><path d="m12 15 4-4" /><circle cx="12" cy="15" r="1" /></>,
  gas: <><rect x="4" y="4" width="9" height="16" rx="2" /><path d="M4 11h9" /><path d="M15 8l2.5 2.5V17a2 2 0 0 1-4 0" /></>,
  gear: <><path d="M6 5v14M18 5v14M6 12h12" /><circle cx="6" cy="5" r="1.6" /><circle cx="18" cy="5" r="1.6" /><circle cx="6" cy="19" r="1.6" /></>,
  bolt: <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8Z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4 12H2m20 0h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>,
  flame: <path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.6.8-2.8 1.5-3.5C9 10 9 12 10 12.5 10.5 9 12 6 12 3Z" />,
  gem: <path d="M6 3h12l3 5-9 13L3 8l3-5Z M3 8h18M9 3 7 8l5 13 5-13-2-5" />,
  mountain: <path d="M3 20 10 6l4 7 2-3 5 10H3Z" />,
  leaf: <path d="M5 19C4 12 9 4 20 4c0 11-8 16-15 15Zm3-3 8-8" />,
  car: <><path d="M4 13l1.6-4.2A3 3 0 0 1 8.4 7h7.2a3 3 0 0 1 2.8 1.8L20 13v5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H7.5v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z" /><path d="M4 13h16" /><circle cx="7.5" cy="16" r="0.6" /><circle cx="16.5" cy="16" r="0.6" /></>,
  key: <><circle cx="8" cy="8" r="4" /><path d="m11 11 8 8m-3-3 2-2m-4-2 2-2" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M16 14h2" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  trips: <><path d="M4 7h16M4 7l2-3h12l2 3M4 7v11a1 1 0 0 0 1 1h1M20 7v11a1 1 0 0 1-1 1h-1M8 19h8M9 11h6" /></>,
  message: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.5 1.5 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.5 1.5 0 0 0-2.5.6 1.5 1.5 0 0 0-1 1.4V22a2 2 0 0 1-4 0v-.1a1.5 1.5 0 0 0-2.6-1 1.5 1.5 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.5 1.5 0 0 0-.6-2.5 1.5 1.5 0 0 0-1.4-1H2a2 2 0 0 1 0-4h.1a1.5 1.5 0 0 0 1-2.6 1.5 1.5 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.5 1.5 0 0 0 2.5-.6V2a2 2 0 0 1 4 0v.1a1.5 1.5 0 0 0 2.6 1 1.5 1.5 0 0 0 1.7.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.5 1.5 0 0 0 .6 2.5H22a2 2 0 0 1 0 4h-.1a1.5 1.5 0 0 0-1.4 1Z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c1-4 4.5-6 8-6s7 2 8 6" /></>,
  logout: <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 12h9m0 0-3-3m3 3-3 3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  sliders: <path d="M4 8h10M18 8h2M4 16h4M12 16h8M14 6v4M8 14v4" />,
  sort: <path d="M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  phone: <path d="M5 4h3l1.5 4-2 1.5a12 12 0 0 0 5 5l1.5-2 4 1.5V19a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1Z" />,
  camera: <><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.2" /></>,
  upload: <path d="M12 16V4m0 0-4 4m4-4 4 4M5 20h14" />,
  card: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h4" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  sparkles: <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3ZM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />,
  headset: <><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="3" y="13" width="4" height="6" rx="1.5" /><rect x="17" y="13" width="4" height="6" rx="1.5" /><path d="M20 19a4 4 0 0 1-4 3h-3" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  trending: <path d="M3 17 9 11l4 4 8-8m0 0h-5m5 0v5" />,
  euro: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5A4 4 0 0 0 9 11m6.5 4.5A4 4 0 0 1 9 13M6.5 10.5h6M6.5 13.5h5" /></>,
  reviews: <path d="M12 15.5 7 18l1-5.4L4 8.8l5.5-.7L12 3l2.5 5.1 5.5.7-4 3.8L17 18l-5-2.5Z" />,
  send: <path d="M4 12 20 4l-4 16-4-6-8-2Zm8 2 8-10" />,
  paperclip: <path d="M8 12l6.5-6.5a3 3 0 0 1 4.2 4.2L9 19.5a5 5 0 0 1-7-7L11.5 3" />,
  chart: <path d="M4 20V4M4 20h16M8 16v-4m4 4V8m4 8v-6" />,
  cars: <><path d="M5 12l1.2-3.2A2.5 2.5 0 0 1 8.7 7h6.6a2.5 2.5 0 0 1 2.5 1.8L19 12v4h-2v-1.5H7V16H5v-4Z" /><path d="M5 12h14" /></>,
  route: <><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H14a3.5 3.5 0 0 0 0-7H10a3.5 3.5 0 0 1 0-7h5.5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9S14.5 18.5 12 21C9.5 18.5 8.5 15 8.5 12S9.5 5.5 12 3Z" /></>,
  instant: <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8Z" />,
  snowflake: <path d="M12 2v20M4 7l16 10M20 7 4 17M12 5l2.5-2M12 5 9.5 3M12 19l2.5 2M12 19l-2.5 2" />,
  music: <><circle cx="7" cy="17" r="2.5" /><circle cx="18" cy="15" r="2.5" /><path d="M9.5 17V6l11-2v11" /></>,
  twitter: <path d="M4 4l7 8.5M20 20l-7-8.5m0 0L4 20m9-8.5L20 4" />,
  instagram: <><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3.5" /><circle cx="17" cy="7" r="0.6" /></>,
  linkedin: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 17v-7" /></>,
  apple: <path d="M16 13c0 3 2 4 2 4s-1.5 3-3.5 3c-1 0-1.5-.6-2.5-.6s-1.6.6-2.6.6C7 20 5 16 5 12.5 5 9 7 8 9 8c1 0 1.8.7 2.5.7S13 8 14.5 8c1 0 2.4.5 3 1.7-2.5 1.3-1.5 3.3-1.5 3.3ZM14 5c-.3 1.6-1.7 2.6-3 2.5-.2-1.4 1-2.9 3-2.5Z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>,
  verified: <><path d="m12 2 2.4 1.8 3-.2 1 2.8 2.6 1.5-1 2.8 1 2.8-2.6 1.5-1 2.8-3-.2L12 22l-2.4-1.8-3 .2-1-2.8L3 16.3l1-2.8-1-2.8 2.6-1.5 1-2.8 3 .2L12 2Z" /><path d="m8.5 12 2.5 2.5L15.5 10" /></>,
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
  fill?: boolean;
}

const FILLED: IconName[] = ['star', 'heart', 'bolt', 'instant', 'flame', 'apple'];

export function Icon({ name, size = 20, className, style, strokeWidth = 1.6, fill }: IconProps) {
  const isFilled = fill ?? FILLED.includes(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isFilled ? 'currentColor' : 'none'}
      stroke={isFilled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}
