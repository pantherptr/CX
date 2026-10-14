import { expect, test, type Page } from '@playwright/test';

/**
 * Sheets and calendars. A sheet that crashes the moment it opens, or opens inside the page (and scrolls
 * away with it), or lets the page scroll behind it, is invisible to "does the page load" checks — these
 * open the real thing and use it.
 */
async function open(page: Page, route: string) {
  await page.addInitScript(() => {
    localStorage.setItem('cx-theme', 'light');
    localStorage.setItem('cx-country', 'GB');
    sessionStorage.setItem('cx-splashed', '1');
  });
  await page.goto(route);
  await page.waitForLoadState('load');
  await page.locator('#root h1, #root main').first().waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(600);
}

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|supabase|placeholder|net::ERR|404/i.test(m.text())) errors.push(m.text());
  });
  return errors;
}

test('home: the date sheet opens at the bottom of the screen, picks a range and applies it', async ({ page }) => {
  const errors = watch(page);
  await open(page, '/');
  const field = page.locator('button[aria-haspopup="dialog"]').first();
  await field.scrollIntoViewIfNeeded();
  const before = (await field.innerText()).replace(/\s+/g, ' ');
  await field.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // it sits on the screen (not inside the page, scrolled away): its bottom edge is the viewport's bottom on a phone
  const box = await dialog.boundingBox();
  const vh = page.viewportSize()!.height;
  expect(box, 'dialog has a box').not.toBeNull();
  expect(box!.y + box!.height, 'the sheet is anchored to the screen').toBeLessThanOrEqual(vh + 1);
  expect(box!.y, 'the sheet is not above the screen').toBeGreaterThanOrEqual(-1);

  // quick ranges are there, and tapping one fills both pills
  await dialog.getByRole('button', { name: /This weekend/i }).click();
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeEnabled();

  // pick two days by hand: a new pick-up shows at once and the return is cleared until chosen
  const days = dialog.locator('.grid-cols-7 button:not([disabled])');
  const n = await days.count();
  expect(n).toBeGreaterThan(6);
  await days.nth(Math.max(0, n - 8)).click();
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await days.nth(n - 3).click();
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();

  const after = (await field.innerText()).replace(/\s+/g, ' ');
  expect(after, 'the field shows the new dates').not.toEqual(before);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('home: the page behind a sheet stays put and comes back where it was', async ({ page }) => {
  await open(page, '/');
  const field = page.locator('button[aria-haspopup="dialog"]').first();
  await field.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await field.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // where the page was when the sheet took over: the pinned body keeps it as a negative `top`
  const y = Math.abs(parseFloat(await page.evaluate(() => document.body.style.top || '0')));
  // the body is pinned while the sheet is open
  await expect(page.locator('body')).toHaveCSS('position', 'fixed');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
  const y2 = await page.evaluate(() => Math.round(window.scrollY));
  // restored (a few px of layout drift is fine; the bug was landing back at the very top)
  expect(Math.abs(y2 - y), 'scroll position is restored').toBeLessThanOrEqual(40);
});

test('car page: the booking sheet and its calendar work', async ({ page, isMobile }) => {
  const errors = watch(page);
  await open(page, '/browse');
  const link = page.locator('a[href^="/cars/"]').first();
  test.skip((await link.count()) === 0, 'no cars to open (no data in this environment)');
  const href = await link.getAttribute('href');
  await open(page, href!);

  // phone: "Reserve" opens the sheet; desktop: the card is in the page
  if (isMobile) {
    await page.getByRole('button', { name: /Reserve/i }).locator('visible=true').first().click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
  }
  const dates = page.getByRole('button', { name: /Pick-up/i }).filter({ hasText: /Return/i }).first();
  await dates.click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet).toBeVisible();

  const free = sheet.locator('button[aria-label^="20"]:not([disabled])');
  const count = await free.count();
  test.skip(count < 4, 'not enough free days to pick a range');
  await free.nth(0).click();
  // mid-selection: the old range is not "ready" and Apply is off
  await expect(sheet.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await free.nth(2).click();
  await expect(sheet.getByRole('button', { name: 'Apply' })).toBeEnabled();
  expect(errors, errors.join('\n')).toEqual([]);
});
