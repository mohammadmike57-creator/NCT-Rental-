import { test, expect, Page } from '@playwright/test';
import { ADMIN, enterSecurityKey, login, openScreen, savedOnServer } from './helpers';

/** Reloads the page and opens the screen again: what shows now came from the server. */
async function fromServer(page: Page, screen: string) {
  await page.reload();
  await expect(page.locator('aside')).toBeVisible({ timeout: 20_000 });
  await openScreen(page, screen);
}

test.describe('administrator settings are saved on the server', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.accept());
    await login(page, ADMIN);
  });

  test('fleet: add a car', async ({ page }) => {
    await openScreen(page, 'Fleet Management');
    await page.getByRole('button', { name: 'Add vehicle' }).first().click();
    const form = page.getByRole('dialog').last();
    await form.getByLabel(/^Model/).fill('Kia Sportage E2E');
    await form.getByLabel(/^License plate/).fill('E2E-777');
    await form.getByLabel(/^Category/).selectOption({ index: 2 });
    await form.getByLabel(/^Transmission/).selectOption({ index: 1 });
    await savedOnServer(page, 'fleet', () => form.getByRole('button', { name: 'Add vehicle' }).click());
    await expect(page.getByText('Kia Sportage E2E').first()).toBeVisible();
    await fromServer(page, 'Fleet Management');
    await expect(page.getByText('Kia Sportage E2E').first()).toBeVisible();
    await expect(page.getByText('E2E-777').first()).toBeVisible();
  });

  test('locations: add a branch', async ({ page }) => {
    await openScreen(page, 'Manage Locations');
    await page.getByPlaceholder('e.g. Airport Office').fill('E2E Airport Office');
    await page.getByPlaceholder(/Queen Alia/).fill('Queen Alia Intl Airport, Arrivals');
    await page.getByRole('button', { name: 'Add location' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await savedOnServer(page, 'rentalLocations', () => enterSecurityKey(page));
    await fromServer(page, 'Manage Locations');
    await expect(page.locator('input[value="E2E Airport Office"]').first()).toBeVisible();
    await expect(page.getByText('4 configured')).toBeVisible(); // added once, not twice
  });

  test('sources: add a booking source', async ({ page }) => {
    await openScreen(page, 'Website Sources');
    await page.getByPlaceholder('e.g. Corporate Partner').fill('E2E Corporate');
    await page.locator('select').filter({ has: page.locator('option', { hasText: 'Both' }) }).first().selectOption({ label: 'Prepaid' });
    await savedOnServer(page, 'sources', () => page.getByRole('button', { name: 'Add source' }).click());
    await fromServer(page, 'Website Sources');
    await expect(page.getByText('E2E Corporate').first()).toBeVisible();
  });

  test('extras: add an extra with its price', async ({ page }) => {
    await openScreen(page, 'Manage Extras');
    await page.getByPlaceholder('e.g. Full Insurance').fill('E2E Roof Box');
    await page.getByPlaceholder('0.00').first().fill('9.5');
    await page.getByRole('button', { name: 'Add extra' }).click();
    await savedOnServer(page, 'availableExtras', () => page.getByRole('button', { name: 'Save changes' }).click());
    await fromServer(page, 'Manage Extras');
    await expect(page.locator('input[value="E2E Roof Box"]').first()).toBeVisible();
    await expect(page.getByText('6 configured')).toBeVisible(); // added once, not twice
  });

  test('company details: change the support hours', async ({ page }) => {
    await openScreen(page, 'Company Details');
    const hours = page.getByLabel('Support hours');
    await hours.fill('Daily, 7:00 AM – 11:00 PM (E2E)');
    // The Save button of the card the field is in.
    await savedOnServer(page, 'companyDetails', () => page.getByRole('button', { name: 'Save changes' }).first().click());
    await fromServer(page, 'Company Details');
    await expect(page.getByLabel('Support hours')).toHaveValue('Daily, 7:00 AM – 11:00 PM (E2E)');
    // The other details are kept: saving one card never empties the rest.
    await expect(page.getByLabel('Company name')).toHaveValue('UR-Drive Jordan');
    await expect(page.getByLabel('Sub name')).not.toHaveValue('');
    await expect(page.getByLabel('Address')).not.toHaveValue('');
  });
});
