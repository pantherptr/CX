import { test } from '@playwright/test';

/**
 * Host + renter at the handover, with two real browsers side by side.
 *
 * Needs two TEST accounts and one booking that starts today, passed as environment variables — never
 * real customers, never in git:
 *
 *   E2E_HOST_EMAIL  E2E_HOST_PASSWORD  E2E_RENTER_EMAIL  E2E_RENTER_PASSWORD  E2E_BOOKING_ID
 *
 * Run:  E2E_BASE_URL=https://your-preview-url npm run test:e2e -- handover
 */
const ready = Boolean(
  process.env.E2E_HOST_EMAIL && process.env.E2E_HOST_PASSWORD && process.env.E2E_RENTER_EMAIL &&
    process.env.E2E_RENTER_PASSWORD && process.env.E2E_BOOKING_ID,
);

test.describe('handover journey', () => {
  test.skip(!ready, 'set the E2E_* variables to run the two-account handover test');

  test('renter sees the pickup step, host sees the handover step', async ({ browser }) => {
    const booking = process.env.E2E_BOOKING_ID!;

    const renterCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const renter = await renterCtx.newPage();
    await renter.goto('/login');
    await renter.getByRole('textbox', { name: /email/i }).fill(process.env.E2E_RENTER_EMAIL!);
    await renter.locator('input[type="password"]').fill(process.env.E2E_RENTER_PASSWORD!);
    await renter.getByRole('button', { name: /sign in|accedi/i }).click();
    await renter.goto(`/trips/${booking}`);
    await renter.getByText(/pick up the car|ritira l’auto/i).waitFor();

    const hostCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const host = await hostCtx.newPage();
    await host.goto('/login');
    await host.getByRole('textbox', { name: /email/i }).fill(process.env.E2E_HOST_EMAIL!);
    await host.locator('input[type="password"]').fill(process.env.E2E_HOST_PASSWORD!);
    await host.getByRole('button', { name: /sign in|accedi/i }).click();
    await host.goto('/host');
    await host.getByText(/hand over the car|consegna l’auto/i).first().waitFor();

    await renterCtx.close();
    await hostCtx.close();
  });
});
