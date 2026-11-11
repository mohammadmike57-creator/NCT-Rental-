import { test, expect } from '@playwright/test';
import { ADMIN, login, openScreen, tokenOf } from './helpers';

test('the health check answers OK', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe('OK');
});

test('a screen crash reaches the administrator with a reference', async ({ page }) => {
  await login(page, ADMIN);
  const res = await page.request.post('/api/client-errors', {
    headers: { Authorization: `Bearer ${await tokenOf(page)}`, 'Content-Type': 'application/json' },
    data: { message: 'E2E test crash', stack: 'at test', screen: 'Reservations', url: '/', userAgent: 'e2e' },
  });
  expect(res.status()).toBe(200);
  const { reference } = await res.json();
  expect(reference).toMatch(/^ERR-[0-9A-Z]{6}$/);

  await openScreen(page, 'Activity Log');
  await page.getByRole('button', { name: 'System errors', exact: true }).click();
  await expect(page.getByText(reference).first()).toBeVisible({ timeout: 15_000 });
});
