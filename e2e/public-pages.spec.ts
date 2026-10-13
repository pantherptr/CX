import { expect, test, type Page } from '@playwright/test';

/** Public pages: they load, nothing sticks out sideways, no errors in the console — light and dark. */
const ROUTES = ['/', '/browse', '/login', '/signup', '/how-it-works', '/help', '/about', '/list-your-car', '/compare', '/signal'];

async function open(page: Page, route: string, theme: 'light' | 'dark', country = 'GB') {
  await page.addInitScript(([t, c]) => {
    localStorage.setItem('cx-theme', t);
    localStorage.setItem('cx-signal-theme', t);
    localStorage.setItem('cx-country', c);
    sessionStorage.setItem('cx-splashed', '1');
  }, [theme, country]);
  await page.goto(route);
  // Not 'networkidle': pages with a map keep fetching tiles for a long time. Wait for the page itself.
  await page.waitForLoadState('load');
  await page.locator('#root h1, #root h2, #root main, #root form').first().waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

for (const theme of ['light', 'dark'] as const) {
  for (const route of ROUTES) {
    test(`${route} · ${theme}: loads, fits the screen, no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource|supabase|placeholder|net::ERR|404/i.test(m.text())) errors.push(m.text());
      });

      await open(page, route, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth, 'the page is wider than the screen').toBeLessThanOrEqual(innerWidth + 1);
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }
}

test('home: the headline stays on one line on desktop, whatever the language', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the one-line headline is the desktop layout');
  await open(page, '/', 'light', 'GB');
  const h1 = page.locator('h1').first();
  await expect(h1).toBeVisible();
  const lines = await h1.evaluate((el) => {
    const span = el.querySelector('[data-fit]') as HTMLElement | null;
    const h = (span ?? el).getBoundingClientRect().height;
    const fs = parseFloat(getComputedStyle(span ?? el).fontSize);
    return Math.round(h / (fs * 0.84 || 1));
  });
  expect(lines).toBeLessThanOrEqual(1);
});

test('home in Italian shows Italian copy', async ({ page }) => {
  await open(page, '/', 'light', 'IT');
  await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(/chiavi/i);
});

test('dark mode: page background is dark', async ({ page }) => {
  await open(page, '/browse', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r, g, b] = bg.match(/\d+/g)!.map(Number);
  expect(r + g + b).toBeLessThan(120);
});

test('SIGNAL gate (signed out) is dark even in the light theme: no white strip above it', async ({ page }) => {
  await open(page, '/signal', 'light');
  await expect(page.getByText(/official voice/i).first()).toBeVisible();
  const colours = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
    chrome: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '',
  }));
  for (const bg of [colours.html, colours.body]) {
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect(r + g + b, `background ${bg} is not dark`).toBeLessThan(120);
  }
  const hex = colours.chrome.replace('#', '');
  const sum = [0, 2, 4].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0);
  expect(sum, `status bar colour ${colours.chrome} is not dark`).toBeLessThan(120);
});

test('going back returns to where you were scrolled', async ({ page }) => {
  await open(page, '/about', 'light');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(300);
  const link = page.locator('a[href="/help"]').last();
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await expect(page).toHaveURL(/\/help/);
  await page.waitForTimeout(500);
  await page.goBack();
  await expect(page).toHaveURL(/\/about/);
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.scrollY);
  expect(after, `scrolled back to ${after}, was at ${before}`).toBeGreaterThan(before * 0.5);
});

test('SIGNAL opens dark the first time even when the site is light, and the site theme is kept', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cx-theme', 'light');
    localStorage.removeItem('cx-signal-theme');
    localStorage.setItem('cx-country', 'GB');
    sessionStorage.setItem('cx-splashed', '1');
  });
  await page.goto('/signal');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('cx-theme'))).toBe('light');
});

test('installed-app mode (?app=1): dragging from the left edge goes back one page', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a touch gesture');
  await open(page, '/about?app=1', 'light');
  await page.waitForTimeout(800);
  // any visible in-app link to another page (the layout of an installed app differs from the browser's)
  const next = page.locator('a[href="/login"]:visible, a[href="/signup"]:visible, a[href="/browse"]:visible, a[href="/how-it-works"]:visible').first();
  await next.click();
  await expect(page).not.toHaveURL(/\/about/);
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const fire = (type: string, x: number) => {
      const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 });
      document.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
    };
    fire('touchstart', 8);
    fire('touchmove', 60);
    fire('touchmove', 140);
    fire('touchend', 140);
  });
  await expect(page).toHaveURL(/\/about/, { timeout: 5000 });
});
