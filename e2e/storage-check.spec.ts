import { test, expect } from '@playwright/test';
import { ADMIN, STAFF, PASSWORD, login, openScreen } from './helpers';

test('an administrator sees the data storage check in Company Details', async ({ page }) => {
  await login(page, ADMIN);
  await openScreen(page, 'Company Details');
  const panel = page.locator('section').filter({ hasText: 'Data storage check' }).last();
  await expect(panel).toBeVisible();
  const headline = panel.getByTestId('storage-headline');
  if ((process.env.STORAGE_MODE || 'document') === 'document') {
    await expect(headline).toContainText('Not switched on');
  } else {
    await expect(headline).toContainText('Everything matches');
    await expect(panel.getByText('Bookings', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Show' }).last().click();
  }
});

test('staff without administrator rights get no storage check from the server', async ({ page }) => {
  const signIn = await page.request.post('/auth/login', { data: { email: STAFF, password: PASSWORD() } });
  expect(signIn.status()).toBe(200);
  const res = await page.request.get('/api/admin/storage/check', {
    headers: { Authorization: `Bearer ${(await signIn.json()).token}` },
  });
  expect(res.status()).toBe(403);
});
