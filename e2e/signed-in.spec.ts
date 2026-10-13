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
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole('button', { name: /sign in|accedi/i }).first().click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20_000 });
}

test.describe('signed in', () => {
  test.skip(!email || !password, 'set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run the signed-in tests');
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('SIGNAL opens dark and shows a feed or its empty state, never the signed-out page', async ({ page }) => {
    await signIn(page);
    await page.goto('/signal');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // the signed-out landing has these buttons; a signed-in person must never see them
    await page.waitForTimeout(2500);
    await expect(page.getByRole('link', { name: /create account/i })).toHaveCount(0);
    await expect(page.locator('article, [aria-busy="true"], text=/just getting started|No posts yet/i').first()).toBeVisible({ timeout: 15_000 });
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
    await page.waitForTimeout(2500);
    const link = page.locator('a[href*="/profile/"]').first();
    if ((await link.count()) === 0) test.skip(true, 'no post with an author in this feed yet');
    await page.evaluate(() => window.scrollTo(0, 400));
    const before = await page.evaluate(() => window.scrollY);
    await link.click();
    await expect(page).toHaveURL(/\/profile\//);
    await page.goBack();
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThanOrEqual(Math.min(before, 200));
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
