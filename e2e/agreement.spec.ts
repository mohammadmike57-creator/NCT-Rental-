import { test, expect } from '@playwright/test';
import { ADMIN, day, login, openScreen, tokenOf } from './helpers';

test('a booking opens its check-out agreement', async ({ page }) => {
  await login(page, ADMIN);
  const start = new Date(day(0) + 'T10:00:00');
  const month = start.toLocaleString('en-US', { month: 'long' });
  const r = await page.request.post('/api/state/patch', {
    headers: { Authorization: `Bearer ${await tokenOf(page)}`, 'Content-Type': 'application/json' },
    data: { ops: [{ op: 'upsertReservation', year: start.getFullYear(), month, reservation: {
      id: 'res-e2e-agr', bookingId: 'E2E-AGR-1', personName: 'Jane Roe', startDate: `${day(0)}T10:00`, endDate: `${day(3)}T10:00`,
      carModel: 'Toyota Corolla', amount: 150, baseAmount: 150, source: 'Website', locationName: 'Amman', status: 'CONFIRMED',
    } }] },
  });
  expect(r.status()).toBe(200);

  await page.reload();
  await openScreen(page, 'Reservations');
  await page.getByPlaceholder(/Search name, booking no/).fill('E2E-AGR-1');
  const row = page.getByText('Jane Roe').first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Check out/ }).first().click();
  // The agreement screen: its title, the check-out steps and the customer's details.
  await expect(page.getByRole('heading', { name: /Rental agreement/ })).toBeVisible();
  for (const step of ['Customer & documents', 'Vehicle', 'Signatures']) {
    await expect(page.getByText(step, { exact: true }).first()).toBeVisible();
  }
  await expect(page.locator('input[value="Jane Roe"], :text("Jane Roe")').first()).toBeVisible();
});
