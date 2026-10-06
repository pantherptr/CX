import type { GlobePlace } from '../../components/home/CityGlobe';

export type Lang = 'en' | 'it' | 'ro' | 'es';

export interface Country {
  code: string;
  /** Name in its own language — what the visitor recognises. */
  name: string;
  flag: string;
  /** Only countries with a live language can be entered; the rest are shown but locked. */
  lang?: Lang;
  /** [lng, lat] */
  coords: [number, number];
}

/** Italy, Romania and Spain are live. The rest are visible but locked until their language and fleet are ready. */
export const COUNTRIES: Country[] = [
  { code: 'IT', name: 'Italia', flag: '🇮🇹', lang: 'it', coords: [12.5, 42.0] },
  { code: 'RO', name: 'România', flag: '🇷🇴', lang: 'ro', coords: [25.0, 45.9] },
  { code: 'ES', name: 'España', flag: '🇪🇸', lang: 'es', coords: [-3.7, 40.2] },
  { code: 'FR', name: 'France', flag: '🇫🇷', coords: [2.3, 46.6] },
  { code: 'DE', name: 'Deutschland', flag: '🇩🇪', coords: [10.4, 51.1] },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', coords: [-2.0, 54.0] },
  { code: 'NL', name: 'Nederland', flag: '🇳🇱', coords: [5.3, 52.2] },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', coords: [-8.2, 39.6] },
  { code: 'GR', name: 'Ελλάδα', flag: '🇬🇷', coords: [22.0, 39.0] },
  { code: 'CH', name: 'Schweiz', flag: '🇨🇭', coords: [8.2, 46.8] },
  { code: 'AT', name: 'Österreich', flag: '🇦🇹', coords: [14.5, 47.6] },
  { code: 'BE', name: 'België', flag: '🇧🇪', coords: [4.5, 50.6] },
  { code: 'PL', name: 'Polska', flag: '🇵🇱', coords: [19.1, 52.1] },
  { code: 'SE', name: 'Sverige', flag: '🇸🇪', coords: [16.0, 62.0] },
  { code: 'US', name: 'United States', flag: '🇺🇸', coords: [-98.0, 39.0] },
  { code: 'AE', name: 'الإمارات', flag: '🇦🇪', coords: [54.4, 24.4] },
];

export const globePlaces: GlobePlace[] = COUNTRIES.map((c) => ({
  name: c.name,
  coords: c.coords,
  locked: !c.lang,
}));
