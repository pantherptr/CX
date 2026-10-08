import type { Lang } from './i18n/countries';

/** General place names for the travel stamps — the city and its country,
 *  never anything more precise. Cities CX does not know are shown as typed. */
const PLACES: Record<string, { city: Partial<Record<Lang, string>>; country: Record<Lang, string> }> = {
  milan: { city: { it: 'Milano', es: 'Milán' }, country: { en: 'Italy', it: 'Italia', ro: 'Italia', es: 'Italia' } },
  milano: { city: { it: 'Milano', es: 'Milán' }, country: { en: 'Italy', it: 'Italia', ro: 'Italia', es: 'Italia' } },
  rome: { city: { it: 'Roma', ro: 'Roma', es: 'Roma' }, country: { en: 'Italy', it: 'Italia', ro: 'Italia', es: 'Italia' } },
  roma: { city: { it: 'Roma', ro: 'Roma', es: 'Roma' }, country: { en: 'Italy', it: 'Italia', ro: 'Italia', es: 'Italia' } },
  florence: { city: { it: 'Firenze', ro: 'Florența', es: 'Florencia' }, country: { en: 'Italy', it: 'Italia', ro: 'Italia', es: 'Italia' } },
  firenze: { city: { it: 'Firenze', ro: 'Florența', es: 'Florencia' }, country: { en: 'Italy', it: 'Italia', ro: 'Italia', es: 'Italia' } },
  paris: { city: { it: 'Parigi', ro: 'Paris', es: 'París' }, country: { en: 'France', it: 'Francia', ro: 'Franța', es: 'Francia' } },
  amsterdam: { city: { it: 'Amsterdam', es: 'Ámsterdam' }, country: { en: 'Netherlands', it: 'Paesi Bassi', ro: 'Țările de Jos', es: 'Países Bajos' } },
  munich: { city: { it: 'Monaco di Baviera', ro: 'München', es: 'Múnich' }, country: { en: 'Germany', it: 'Germania', ro: 'Germania', es: 'Alemania' } },
  barcelona: { city: { it: 'Barcellona' }, country: { en: 'Spain', it: 'Spagna', ro: 'Spania', es: 'España' } },
};

export function stampPlace(city: string, lang: Lang): { city: string; country: string | null } {
  const hit = PLACES[city.trim().toLowerCase()];
  if (!hit) return { city, country: null };
  return { city: hit.city[lang] ?? city, country: hit.country[lang] ?? hit.country.en };
}
