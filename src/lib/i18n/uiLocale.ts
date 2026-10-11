/**
 * The BCP-47 tag dates and numbers should be formatted in: follows the language the visitor chose
 * (<html lang> is kept in sync by LocaleProvider). Used wherever a date / number is formatted outside
 * a component with access to useLocale().
 */
const TAGS: Record<string, string> = { en: 'en-GB', it: 'it-IT', ro: 'ro-RO', es: 'es-ES' };

export const uiLocale = (): string => {
  if (typeof document === 'undefined') return 'en-GB';
  return TAGS[document.documentElement.lang] ?? 'en-GB';
};
