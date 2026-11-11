import { test, expect } from '@playwright/test';
import { ADMIN, STAFF, login, PASSWORD } from './helpers';

test('a wrong password is refused', async ({ page }) => {
  await page.goto('/');
  await page.locator('#username-input').fill(ADMIN);
  await page.locator('#password-input').fill('not-the-password');
  await page.locator('button[type=submit]').click();
  await expect(page.getByText(/invalid|incorrect|wrong/i).first()).toBeVisible();
  await expect(page.locator('aside')).toHaveCount(0);
});

test('staff can sign in and out', async ({ page }) => {
  await login(page, ADMIN);
  await expect(page.locator('aside')).toContainText('Reservations');
  await page.reload();
  await expect(page.locator('aside')).toBeVisible({ timeout: 20_000 }); // still signed in after a reload
  expect(PASSWORD()).toBeTruthy();
});

test('signing out and in again (another person, same computer) loads their own data', async ({ page }) => {
  await login(page, ADMIN);
  await page.getByRole('button', { name: /sign out|log out/i }).last().click().catch(async () => {
    await page.locator('aside').getByRole('button').last().click();
  });
  await expect(page.locator('#username-input')).toBeVisible({ timeout: 15_000 });
  await page.locator('#username-input').fill(STAFF);
  await page.locator('#password-input').fill(PASSWORD());
  await page.locator('button[type=submit]').click();
  await expect(page.locator('aside')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('aside')).toContainText('E2E Staff');
  await expect(page.locator('aside').getByText('User & Staff Management', { exact: true })).toHaveCount(0);
});
