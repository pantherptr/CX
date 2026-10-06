/**
 * Keeps contact details and off-platform payments out of chats and public
 * text. Phone numbers, emails, links, messaging apps and "pay me outside
 * the app" are what let a booking leave CX; a trip arranged elsewhere has
 * no protection, no refund and no support.
 *
 * This is the friendly front door (the form says why it was stopped).
 * migration 0070 repeats the idea in the database and hides what it
 * finds, so a modified client can't skip it.
 */
export const CONTACT_WARNING =
  'For your safety, keep contact details and payments inside CX. Phone numbers, emails, links and requests to pay outside the app can’t be shared.';

const EMAIL = /[a-z0-9._%+-]+\s*(?:@|\(\s*at\s*\)|\[\s*at\s*\])\s*[a-z0-9-]+(?:\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\])\s*[a-z0-9-]+)*\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\])\s*[a-z]{2,}/i;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:com|it|ro|es|net|org|io|me|app|ly|eu|co|info|biz)\b/i;
const APPS = /\b(?:whats\s?app|telegram|viber|wechat|snapchat|messenger|iban|paypal|revolut|bizum|satispay|postepay|venmo|western\s+union)\b|\bwa\.me\b/i;
const OFF_PLATFORM =
  /\bpay(?:ing)?\s+(?:me\s+|you\s+)?(?:outside|off\s*(?:the\s*)?app|directly|in\s+cash|by\s+cash)|\b(?:outside|off)\s+(?:of\s+)?(?:the\s+)?(?:app|platform|cx)\b|\bpag\w*\s+(?:in\s+|con\s+)?(?:contanti|cash|bonifico|diretto|direttamente)|\b(?:fuori|senza)\s+(?:dall['’]?\s*|da\s+)?(?:app|piattaforma|cx)\b|\bplat\w*\s+(?:cash|direct|numerar)|\b(?:în|in)\s+afara\s+(?:aplica\w+|platform\w+)|\bfuera\s+de\s+(?:la\s+)?(?:app|aplicaci\w+|plataforma)|\bpag\w*\s+(?:en\s+efectivo|directo|directamente)/i;
// Eight or more digits in a row, allowing the usual separators.
const PHONE = /(?:\+|00)?\d(?:[\s().\-_/]{0,2}\d){7,}/;
// Dates like 12/10/2026 or 2026-10-07 aren't phone numbers.
const DATE = /(?<![\d/.-])(?:\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2}))(?![\d/.-])/g;

export type ContactKind = 'phone' | 'email' | 'link' | 'app' | 'payment';

export function findContactInfo(text: string | null | undefined): ContactKind[] {
  if (!text) return [];
  const found: ContactKind[] = [];
  if (EMAIL.test(text)) found.push('email');
  if (LINK.test(text.replace(EMAIL, ' '))) found.push('link');
  if (PHONE.test(text.replace(DATE, ' '))) found.push('phone');
  if (APPS.test(text)) found.push('app');
  if (OFF_PLATFORM.test(text)) found.push('payment');
  return found;
}

export const hasContactInfo = (text: string | null | undefined): boolean => findContactInfo(text).length > 0;
