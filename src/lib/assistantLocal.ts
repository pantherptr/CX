import { faqs } from '../data/faqs';
import type { Car } from '../data/types';
import { matchCars, type DriveType, type Preferences, type Priority } from './carMatch';

/**
 * Kai's brain, with no AI service and no cost: it runs in the browser. Two things only —
 *   1. questions and problems → the closest answer in the site's own FAQ (word overlap, in four languages
 *      for the key words), and a person from the team when nothing fits;
 *   2. "find me a car" → the deterministic car matcher the site already had (carMatch.ts), fed with what
 *      the person wrote: city, budget, people, kind of trip.
 * It never invents a price, policy or car; what it cannot answer it hands to a person.
 */

/** What Kai actually did to get the answer — shown as the "think" trail in the chat. */
export interface ReplyTrace {
  kind: 'cars' | 'faq' | 'greeting' | 'person' | 'unknown';
  carsConsidered?: number;
  citiesConsidered?: number;
  city?: string | null;
  maxPrice?: number | null;
  people?: string | null;
  driveType?: DriveType | null;
  matches?: number;
  budgetRelaxed?: boolean;
  faqTopics?: number;
  topic?: string;
}

export interface LocalReply {
  text: string;
  cars?: string[]; // slugs
  offerHuman?: boolean;
  trace?: ReplyTrace;
}

// Foreign key words → the English word the FAQ uses (it / ro / es), so "annullare" finds "cancel".
const SYNONYMS: Record<string, string> = {
  annull: 'cancel', annulla: 'cancel', annullare: 'cancel', annullamento: 'cancel', cancelar: 'cancel', anula: 'cancel', anulare: 'cancel', cancelacion: 'cancel', cancelación: 'cancel',
  rimborso: 'refund', rimborsare: 'refund', rambursare: 'refund', reembolso: 'refund',
  cauzione: 'deposit', deposito: 'deposit', garanzia: 'deposit', garantie: 'deposit', garantía: 'deposit',
  pagamento: 'payment', pagare: 'pay', pagato: 'pay', plata: 'payment', plati: 'pay', pago: 'payment', pagar: 'pay',
  verify: 'verification', verified: 'verification', verifying: 'verification', verifica: 'verification', verificare: 'verification', verificarea: 'verification', verificacion: 'verification', verificación: 'verification',
  patente: 'licence', permis: 'licence', licencia: 'licence', carnet: 'licence',
  identita: 'identity', identità: 'identity', identitate: 'identity', identidad: 'identity',
  consegna: 'pickup', ritiro: 'pickup', ritirare: 'pickup', predare: 'pickup', ridicare: 'pickup', recogida: 'pickup', entrega: 'pickup',
  riconsegna: 'return', rientro: 'return', returnare: 'return', devolucion: 'return', devolución: 'return',
  danno: 'damage', danni: 'damage', daune: 'damage', dano: 'damage', daño: 'damage',
  incidente: 'accident', accident: 'accident', accidente: 'accident',
  assicurazione: 'insurance', asigurare: 'insurance', seguro: 'insurance',
  prenotazione: 'booking', prenotare: 'booking', rezervare: 'booking', reserva: 'booking', reservar: 'booking',
  prezzo: 'price', costo: 'price', pret: 'price', preț: 'price', precio: 'price',
  host: 'host', proprietario: 'host', gazda: 'host', anfitrion: 'host', anfitrión: 'host',
  ritardo: 'late', intarziere: 'late', întârziere: 'late', retraso: 'late',
  benzina: 'fuel', carburante: 'fuel', combustibil: 'fuel', combustible: 'fuel',
  chiave: 'key', chiavi: 'key', cheie: 'key', llave: 'key',
  guida: 'driver', conducente: 'driver', sofer: 'driver', șofer: 'driver', conductor: 'driver',
  bambino: 'child', bambini: 'child', copil: 'child', niño: 'child', nino: 'child',
};
const STOP = new Set(['the', 'a', 'an', 'i', 'my', 'is', 'are', 'to', 'of', 'and', 'or', 'do', 'does', 'how', 'what', 'can', 'for', 'in', 'on', 'it', 'me', 'we', 'you', 'your', 'with', 'if', 'at', 'be', 'will', 'there', 'this', 'that', 'have', 'has', 'need', 'want', 'il', 'la', 'le', 'di', 'e', 'un', 'una', 'che', 'per', 'come', 'mi', 'ho', 'el', 'los', 'las', 'de', 'y', 'un', 'una', 'cu', 'si', 'și', 'la']);

const stem = (w: string) => w.replace(/(ing|ed|es|s)$/i, '');
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => SYNONYMS[w] ?? w)
    .map(stem);
}

const FAQ_TOKENS = faqs.map((f) => ({ f, set: new Set(tokens(`${f.q} ${f.q} ${f.a}`)), qset: new Set(tokens(f.q)) }));

// How many FAQ entries mention each word: a rare word ("verification") says more about what is being
// asked than a common one ("work"), so matches are weighted by it.
const DOC_FREQ = new Map<string, number>();
for (const item of FAQ_TOKENS) for (const w of item.set) DOC_FREQ.set(w, (DOC_FREQ.get(w) ?? 0) + 1);
const idf = (w: string) => Math.log(1 + FAQ_TOKENS.length / (DOC_FREQ.get(w) ?? 0.5));

function bestFaq(query: string): { q: string; a: string; score: number } | null {
  const qt = tokens(query);
  if (qt.length === 0) return null;
  const weights = qt.map(idf);
  const total = weights.reduce((x, y) => x + y, 0);
  const denom = total + total / qt.length; // same shape as before: (matches) / (words + 1), now weighted
  let best: { q: string; a: string; score: number } | null = null;
  for (const item of FAQ_TOKENS) {
    let hit = 0;
    qt.forEach((w, i) => {
      if (item.set.has(w)) hit += weights[i];
      if (item.qset.has(w)) hit += weights[i];
    });
    const score = hit / denom;
    if (!best || score > best.score) best = { q: item.f.q, a: item.f.a, score };
  }
  return best && best.score >= 0.34 ? best : null;
}

const HUMAN = /\b(person|human|agent|operator|someone|support|team|persona|operatore|umano|assistenza|persoană|persoana|operator|ayuda humana|equipo|soporte)\b/i;
const CAR_INTENT = /\b(car|cars|auto|macchina|macchine|mașină|masina|mașini|coche|coches|suv|rent|noleggi|noleggiare|inchiri|închiri|alquil|find|trova|cerco|caut|busco|recommend|consigli|suggest|weekend|trip|viaggio|vacanza|vacanta|vacaciones|drive|guidare)/i;

function parsePrefs(text: string, cities: string[]): Preferences {
  const low = text.toLowerCase();
  const city = cities.find((c) => low.includes(c.toLowerCase())) ?? null;
  const num = low.match(/(?:€\s*(\d{2,4})|(\d{2,4})\s*(?:€|eur|euro))/);
  const under = low.match(/(?:under|below|max|sotto|massimo|fino a|sub|până la|maximo|máximo|menos de)\s*(\d{2,4})/);
  const maxPrice = Number(num?.[1] ?? num?.[2] ?? under?.[1] ?? 0) || null;
  const people = low.match(/(\d)\s*(?:people|persons|passengers|persone|persoane|personas|pax|seats|posti)/);
  const n = people ? Number(people[1]) : /family|famiglia|familie|familia|kids|bambini|copii|niños/.test(low) ? 5 : null;
  let driveType: DriveType | null = null;
  const priorities: Priority[] = [];
  if (/luxury|lusso|lux|lujo|premium|elegant/.test(low)) { driveType = 'luxury'; priorities.push('luxury'); }
  else if (/sport|perform|fast|veloc|rapid|rápid|supercar|racing/.test(low)) { driveType = 'performance'; priorities.push('performance'); }
  else if (/business|work|lavoro|afaceri|trabajo|meeting/.test(low)) driveType = 'business';
  else if (/road ?trip|long|lungo|lung|largo|vacanza|vacanta|vacaciones|holiday|holidays/.test(low)) driveType = 'road-trip';
  else if (/weekend|week-end|fine settimana|sfarsit de saptamana|fin de semana/.test(low)) driveType = 'weekend';
  else if (/city|citta|città|oras|oraș|ciudad|urban|small|piccola|mica|pequeño/.test(low)) driveType = 'city';
  else if (/night|sera|notte|noapte|noche|date|special|speciale|wedding|matrimonio|nunta|boda/.test(low)) driveType = 'occasion';
  if (/space|spazio|spatiu|espacio|suv|family|famiglia/.test(low)) priorities.push('space');
  if (/cheap|economic|economico|ieftin|barato|save|risparm/.test(low)) priorities.push('efficiency');
  if (/comfort|comod|confort/.test(low)) priorities.push('comfort');
  const passengers = n === null ? null : n <= 2 ? '1-2' : n <= 4 ? '3-4' : '5+';
  return { driveType, priorities, passengers, budget: null, maxPricePerDay: maxPrice, city };
}

/** Reply to one message, locally and for free. `t` translates the fixed phrases; FAQ answers are the site's own text. */
export function localReply(
  text: string,
  cars: Car[],
  t: (s: string, v?: Record<string, string | number>) => string,
): LocalReply {
  const clean = text.trim();
  const low = clean.toLowerCase();

  if (HUMAN.test(low) && clean.length < 80) {
    return { text: t('Of course — I will connect you with a person from the CX team.'), offerHuman: true, trace: { kind: 'person' } };
  }
  if (/^(hi|hello|hey|ciao|salve|buongiorno|buonasera|salut|buna|bună|hola|buenas)\b/.test(low) && clean.length < 25) {
    return { text: t('Hello! Tell me what you need: a car for a trip, or help with something.'), trace: { kind: 'greeting' } };
  }

  const cities = Array.from(new Set(cars.map((c) => c.city)));
  const wantsCar = CAR_INTENT.test(low) || cities.some((c) => low.includes(c.toLowerCase()));
  const faq = bestFaq(clean);

  // A question that clearly matches the FAQ wins over a car search (unless they named a city / said "find").
  if (faq && faq.score >= 0.5 && !/\b(find|trova|cerco|caut|busco|recommend|consigli)\b/.test(low)) {
    return { text: t(faq.a), trace: { kind: 'faq', faqTopics: faqs.length, topic: faq.q } };
  }

  if (wantsCar && cars.length > 0) {
    const prefs = parsePrefs(clean, cities);
    const { results, budgetExcludedAll } = matchCars(cars, prefs);
    const top = results.slice(0, 3);
    if (top.length > 0) {
      const where = prefs.city ? t(' in {city}', { city: prefs.city }) : '';
      const intro = budgetExcludedAll
        ? t('Nothing fits that budget exactly, but these are the closest options{where}:', { where })
        : t('Here are some options{where}:', { where });
      return {
        text: intro,
        cars: top.map((r) => r.car.slug),
        trace: {
          kind: 'cars',
          carsConsidered: cars.length,
          citiesConsidered: cities.length,
          city: prefs.city,
          maxPrice: prefs.maxPricePerDay,
          people: prefs.passengers,
          driveType: prefs.driveType,
          matches: results.length,
          budgetRelaxed: budgetExcludedAll,
        },
      };
    }
  }

  if (faq) return { text: t(faq.a), trace: { kind: 'faq', faqTopics: faqs.length, topic: faq.q } };

  return {
    text: t("I'm not sure I can answer that well. A person from the CX team can — or tell me more and I will try again."),
    offerHuman: true,
    trace: { kind: 'unknown', faqTopics: faqs.length },
  };
}
