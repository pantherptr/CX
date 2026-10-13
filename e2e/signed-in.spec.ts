import { expect, test, type Page } from '@playwright/test';

/**
 * The signed-in journey on a phone: SIGNAL, a profile, scroll memory, the composer, Reels, theme.
 *
 * Needs ONE test account (a throw-away one, never a real person's), passed as environment variables and
 * kept out of git — for example in a local, git-ignored `.env.e2e.local` that you `source` first:
 *
 *   E2E_TEST_EMAIL=...   E2E_TEST_PASSWORD=...
 *
 * Skipped when they are not set.
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('cx-country', 'GB');
    sessionStorage.setItem('cx-splashed', '1');
  });
  await page.goto('/login');
  // The form is controlled: a value typed before the page has finished starting up is wiped. Type it again
  // until it sticks.
  const em = page.locator('#email');
  const pw = page.locator('#password');
  await em.waitFor();
  await expect(async () => {
    await em.fill(email!);
    expect((await em.inputValue()) === email, 'email field kept its value').toBe(true);
  }).toPass({ timeout: 12_000 });
  await expect(async () => {
    await pw.fill(password!);
    expect((await pw.inputValue()) === password, 'password field kept its value').toBe(true);
  }).toPass({ timeout: 12_000 });
  await page.getByRole('button', { name: /sign in|accedi/i }).first().click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20_000 });
}

test.describe('signed in', () => {
  // one account, one sign-in at a time: parallel sign-ins of the same account get in each other's way
  test.describe.configure({ mode: 'serial' });
  test.skip(!email || !password, 'set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run the signed-in tests');
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('SIGNAL opens dark and shows a feed or its empty state, never the signed-out page', async ({ page }) => {
    await signIn(page);
    await page.goto('/signal');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // the signed-out landing has these buttons; a signed-in person must never see them
    await page.waitForTimeout(2500);
    await expect(page.getByRole('link', { name: /create account/i })).toHaveCount(0);
    await expect(page.locator('article').or(page.getByText(/just getting started|No posts yet/i)).first()).toBeVisible({ timeout: 15_000 });
  });

  test('theme: the site keeps its own theme when you leave SIGNAL', async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => localStorage.setItem('cx-theme', 'light'));
    await page.goto('/signal');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.goto('/browse');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('a profile opens, and going back returns to where you were', async ({ page }) => {
    await signIn(page);
    await page.goto('/signal/community');
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => window.scrollY);
    if (before < 300) test.skip(true, 'the feed is too short to scroll');
    // tap an author link that is on screen right now (never one Playwright would have to scroll to)
    const tapped = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('article a[href*="/profile/"]'));
      const vis = links.find((a) => {
        const r = a.getBoundingClientRect();
        return r.top > 120 && r.bottom < window.innerHeight - 120 && r.width > 0;
      });
      vis?.click();
      return Boolean(vis);
    });
    if (!tapped) test.skip(true, 'no author link on screen');
    await expect(page).toHaveURL(/\/profile\//);
    await page.waitForTimeout(800);
    await page.goBack();
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before), `scroll before ${before}, after ${after}`).toBeLessThan(40);
  });

  test('Reels page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page);
    await page.goto('/signal/reels');
    await page.waitForTimeout(3000);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
