import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Accessibility scan of the public pages (WCAG A/AA rules). Fails on "critical" problems; prints the rest. */
const ROUTES = ['/', '/browse', '/login', '/signup', '/how-it-works', '/help', '/about', '/signal'];

for (const route of ROUTES) {
  test(`a11y ${route}`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'scanned once, on the phone layout');
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      localStorage.setItem('cx-theme', 'light');
      localStorage.setItem('cx-signal-theme', 'light');
      localStorage.setItem('cx-country', 'GB');
      sessionStorage.setItem('cx-splashed', '1');
    });
    await page.goto(route);
    await page.waitForLoadState('load');
    await page.waitForTimeout(1500);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const lines = results.violations.map((v) => `${v.impact}  ${v.id}  (${v.nodes.length})  ${v.help}`);
    if (lines.length) console.log(`[a11y ${route}]\n  ${lines.join('\n  ')}`);
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical.map((v) => v.id), 'critical accessibility problems').toEqual([]);
  });
}
