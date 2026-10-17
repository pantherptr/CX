/** Per-page title, description, canonical address and "do not index" flag, set on every route change.
 *  index.html carries the home page's tags (what a link preview sees); the app updates them for the browser, the tab
 *  title and for crawlers that run scripts. */
const ORIGIN = 'https://cxworld.eu';
const BRAND = 'CX';

interface Meta { title: string; desc: string }

/** Pages that are only for signed-in people or have no value in search results. */
const PRIVATE = /^\/(dashboard|settings|messages|notifications|admin|owner|host|trips|book|login|signup|scan|dev|compare)(\/|$)/;

function setTag(selector: string, attr: 'content' | 'href', value: string, create?: () => HTMLElement) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el && create) { el = create(); document.head.appendChild(el); }
  el?.setAttribute(attr, value);
}

export function applyPageMeta(pathname: string, meta: Meta | null) {
  if (typeof document === 'undefined') return;
  const clean = pathname.replace(/\/+$/, '') || '/';
  const title = meta ? (meta.title === BRAND ? BRAND : `${meta.title} · ${BRAND}`) : document.title;
  if (meta) document.title = title;
  if (meta) {
    setTag('meta[name="description"]', 'content', meta.desc);
    setTag('meta[property="og:title"]', 'content', title);
    setTag('meta[property="og:description"]', 'content', meta.desc);
    setTag('meta[name="twitter:title"]', 'content', title);
    setTag('meta[name="twitter:description"]', 'content', meta.desc);
  }
  const url = `${ORIGIN}${clean === '/' ? '/' : clean}`;
  setTag('link[rel="canonical"]', 'href', url);
  setTag('meta[property="og:url"]', 'content', url);
  const noindex = PRIVATE.test(clean);
  const robots = document.head.querySelector('meta[name="robots"]');
  if (noindex) setTag('meta[name="robots"]', 'content', 'noindex, nofollow', () => { const m = document.createElement('meta'); m.setAttribute('name', 'robots'); return m; });
  else robots?.remove();
}

/** The titles of the fixed pages, in the visitor's language (`t` is the translator). */
export function staticMeta(pathname: string, t: (en: string) => string): Meta | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  switch (p) {
    case '/': return { title: BRAND, desc: t('Rent exceptional cars from local owners, wherever the road takes you.') };
    case '/browse': return { title: t('Browse cars'), desc: t('Premium cars from verified local hosts, on the map with their prices.') };
    case '/how-it-works': return { title: t('How it works'), desc: t('From search to your door in four steps: find a car, book in minutes, hit the road, or have it delivered.') };
    case '/about': return { title: t('About'), desc: t('CX began in Milan with a simple idea: renting a car should feel as premium as the cars themselves.') };
    case '/help': return { title: t('Help & Support'), desc: t('Answers about booking, pickup, your trip, billing and hosting.') };
    case '/list-your-car': return { title: t('List your car'), desc: t('Turn a parked car into income. You set the price, you decide how it is handed over.') };
    case '/terms': return { title: t('Terms of Service'), desc: t('The terms for renting and hosting on CX.') };
    case '/privacy': return { title: t('Privacy Policy'), desc: t('How CX handles your data.') };
    case '/cancellation-policy': return { title: t('Cancellation policy'), desc: t('How cancellations and refunds work on CX.') };
    case '/login': return { title: t('Sign in'), desc: t('Sign in to CX.') };
    case '/signup': return { title: t('Create account'), desc: t('Create your free CX account.') };
    default:
      if (p.startsWith('/signal')) return { title: 'SIGNAL', desc: t('The CX community: new cars, real stories and the people behind them.') };
      return null;
  }
}
