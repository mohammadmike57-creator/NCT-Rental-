import { test, expect } from '@playwright/test';
import { ADMIN, login, openScreen } from './helpers';

test('an administrator creates a staff account and the new person signs in', async ({ page }) => {
  await login(page, ADMIN);
  await openScreen(page, 'User & Staff Management');
  await page.getByRole('button', { name: 'Add staff member' }).first().click();
  const form = page.locator('body');
  await form.getByPlaceholder('e.g. Sara Haddad').fill('Lina Test');
  await form.getByPlaceholder('name@company.com').fill('lina.test@example.test');
  await form.getByPlaceholder('e.g. Reservations agent').fill('Reservations agent');
  await page.getByRole('tab', { name: 'Password' }).or(page.getByText('Password', { exact: true })).first().click();
  await page.waitForTimeout(300);
  const pw = form.locator('input[type=password], input[autocomplete=new-password]');
  await pw.first().fill('Lina-Start-2026!');
  if (await pw.count() > 1) await pw.nth(1).fill('Lina-Start-2026!');
  await form.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/Login created for Lina Test/)).toBeVisible();
  await expect(page.getByText('lina.test@example.test').first()).toBeVisible();

  // The new person signs in with the password the administrator set.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await login(page, 'lina.test@example.test', 'Lina-Start-2026!');
  await expect(page.locator('aside')).toContainText('Lina Test');
  await expect(page.locator('aside').getByText('User & Staff Management', { exact: true })).toHaveCount(0);
});
