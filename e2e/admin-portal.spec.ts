import { test, expect } from '@playwright/test';
import { ADMIN, PASSWORD, STAFF } from './helpers';

async function signIn(page: import('@playwright/test').Page, path: string, email: string) {
  await page.goto(path);
  await expect(async () => {
    await page.locator('#username-input').fill(email);
    await page.locator('#password-input').fill(PASSWORD());
    await expect(page.locator('#username-input')).toHaveValue(email, { timeout: 500 });
  }).toPass({ timeout: 15_000 });
  await page.locator('button[type=submit]').click();
}

test('Admin portal: create an OTA XML-only supplier with the wizard, the owner sets a password and lands on OTA XML, then the supplier is paused', async ({ page, browser }) => {
  await signIn(page, '/admin', ADMIN);
  await expect(page.getByTestId('platform-overview')).toBeVisible({ timeout: 30_000 });

  // Wizard: company → package (OTA XML only) → contacts → owner (invitation) → review → create.
  await expect(async () => {
    await page.getByRole('button', { name: 'New supplier' }).first().click();
    await expect(page.getByTestId('new-supplier')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.locator('#ns-name').fill('Canyon Cars Portal Test');
  await expect(page.locator('#ns-code')).toHaveValue('CCPT');
  // The sign-in address is suggested from the name and checked on the server.
  await expect(page.getByTestId('slug-input')).toHaveValue('canyon-cars-portal-test');
  await page.getByTestId('slug-input').fill('admin');
  await expect(page.getByTestId('slug-status')).toContainText('reserved');
  await page.getByTestId('slug-input').fill('canyon-cars');
  await expect(page.getByTestId('slug-status')).toContainText('Available');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('plan-XML').click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText("owner's name");   // checked before moving on
  await page.locator('#ns-on').fill('Carla Owner');
  await page.locator('#ns-oe').fill('owner@canyon.example.test');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('new-supplier')).toContainText('OTA XML only');
  await page.getByRole('button', { name: 'Create supplier' }).click();
  await expect(page.getByTestId('supplier-created')).toContainText('Canyon Cars Portal Test is ready');
  await expect(page.getByTestId('signin-url')).toContainText('/s/canyon-cars');
  const link = await page.getByTestId('invitation-link').inputValue();
  expect(link).toContain('/set-password?token=');

  // The owner opens the link, chooses a password and signs in: an OTA XML-only workspace.
  const owner = await (await browser.newContext()).newPage();
  await owner.goto(new URL(link).pathname + new URL(link).search);
  await expect(owner.getByTestId('set-password')).toContainText('Canyon Cars Portal Test');
  await owner.locator('#sp-pw').fill(PASSWORD());
  await owner.locator('#sp-again').fill(PASSWORD());
  await owner.getByRole('button', { name: 'Set password' }).click();
  await expect(owner.getByText('Your password is set')).toBeVisible();
  await signIn(owner, '/s/canyon-cars', 'owner@canyon.example.test');
  await expect(owner.getByText('Channel Manager')).toBeVisible({ timeout: 20_000 });
  await expect(owner.locator('aside').first()).not.toContainText('Reservations');
  await expect(owner.locator('aside').first()).not.toContainText('Accounting');

  // Back in the portal: open the supplier and pause it with a reason.
  await page.getByRole('button', { name: /^Open Canyon Cars/ }).click();
  await expect(page.getByTestId('supplier-page')).toContainText('owner@canyon.example.test');
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.locator('#st-reason').fill('Portal test');
  await page.getByRole('button', { name: 'Pause supplier' }).click();
  await expect(page.getByTestId('supplier-page')).toContainText('Paused');
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByTestId('supplier-page')).toContainText('Portal test');

  // The paused supplier's owner can no longer sign in.
  const again = await (await browser.newContext()).newPage();
  await signIn(again, '/', 'owner@canyon.example.test');
  await expect(again.getByText(/paused/i)).toBeVisible({ timeout: 15_000 });
});

test('Admin portal: someone who is not a platform admin sees no portal', async ({ page }) => {
  await signIn(page, '/admin', STAFF);
  await expect(page.getByTestId('portal-denied')).toBeVisible({ timeout: 30_000 });
});
