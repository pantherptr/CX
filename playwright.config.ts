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
  // a loaded machine can stall one page now and then; one retry keeps the run honest without hiding real bugs
  retries: 1,
  workers: process.env.CI ? 2 : 3,
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
    // The production build served by `vite preview`: no cold compile per page, no hot-reload noise.
    : { command: 'npx vite build && npx vite preview --port 4173 --strictPort', url: baseURL, reuseExistingServer: true, timeout: 180_000 },
});
