import { test, expect } from '@playwright/test';
import { ADMIN, STAFF, login, setSection } from './helpers';

test('staff only see the screens they are allowed to use', async ({ page }) => {
  await login(page, STAFF);
  const menu = page.locator('aside');
  await expect(menu).toContainText('Reservations');
  await expect(menu).toContainText('Traffic Tickets');
  for (const hidden of ['User & Staff Management', 'Fleet Management', 'Accounting', 'OTA XML', 'Company Details']) {
    await expect(menu.getByText(hidden, { exact: true })).toHaveCount(0);
  }
});

test('the server refuses data changes the person has no permission for', async ({ page }) => {
  await login(page, STAFF);
  const res = await setSection(page, 'fleet', [{ id: 'x', modelName: 'Hacked car', licensePlate: 'XX-0000' }]);
  expect(res.status).toBe(200);
  expect(res.body.skipped).toContain('fleet');

  // An administrator's change to the same section is saved.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await login(page, ADMIN);
  const ok = await setSection(page, 'companyDetails', { name: 'UR-Drive Jordan', address: 'Airport Road, Amman' });
  expect(ok.body.skipped ?? []).not.toContain('companyDetails');
});

test('passwords are never sent to the browser', async ({ page }) => {
  await login(page, ADMIN);
  const state = await page.evaluate(async () => (await fetch('/api/state', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })).text());
  expect(state).not.toMatch(/"password"\s*:/);
  expect(state).not.toMatch(/"passwordHash"\s*:/);
});
