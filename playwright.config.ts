import { defineConfig } from '@playwright/test';

/**
 * End-to-end checks for CX. `npm run test:e2e` starts the dev server by itself (or reuses one already
 * running) and drives it with a real browser: phone and desktop, light and dark.
 *
 * Point it at another address with E2E_BASE_URL (for example a Vercel preview URL).
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npx vite --port 4173 --strictPort', url: baseURL, reuseExistingServer: true, timeout: 60_000 },
});
