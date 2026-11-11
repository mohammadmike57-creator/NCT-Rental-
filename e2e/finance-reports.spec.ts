import { test, expect, Page } from '@playwright/test';
import { ADMIN, day, enterSecurityKey, login, openScreen, savedOnServer, tokenOf } from './helpers';

async function addExpense(page: Page, amount: string, description: string) {
  await openScreen(page, 'Accounting');
  await page.getByRole('button', { name: 'Add expense' }).first().click();
  await enterSecurityKey(page);
  // The box titled "Add Expense" (the smallest element holding its title and its fields).
  const form = page.getByText('Add Expense', { exact: true }).locator('xpath=ancestor::*[.//textarea][1]');
  await form.getByPlaceholder('0.00').fill(amount);
  await form.locator('select').selectOption({ index: 2 });
  await form.locator('textarea').fill(description);
  await savedOnServer(page, 'expenses', () => form.getByRole('button', { name: 'Save Expense' }).click());
  await page.reload();
  await openScreen(page, 'Accounting');
  await expect(page.getByText(description).first()).toBeVisible();
}

test('an administrator records an expense', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await login(page, ADMIN);
  await addExpense(page, '45', 'E2E car wash (admin)');
});

test('an accountant who can open Accounting records an expense, and it is kept', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await login(page, ADMIN);
  const res = await page.request.post('/api/admin/users', {
    headers: { Authorization: `Bearer ${await tokenOf(page)}`, 'Content-Type': 'application/json' },
    data: { fullName: 'Rana Accountant', email: 'rana.acc@example.test', username: 'rana.acc', password: 'Rana-Start-2026!',
      permissions: ['VIEW_HOME_DASHBOARD', 'VIEW_FINANCIALS_ACCOUNTING'], webAppAccess: true, status: 'ACTIVE' },
  });
  expect(res.ok(), await res.text()).toBe(true);
  await page.evaluate(() => localStorage.clear());
  await login(page, 'rana.acc@example.test', 'Rana-Start-2026!');
  await addExpense(page, '30', 'E2E fuel receipt (accountant)');
  await expect(page.getByText('Change not saved')).toHaveCount(0);
});

test('a vehicle damage report is recorded against a booking', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await login(page, ADMIN);
  const start = new Date(day(-5) + 'T10:00:00');
  await page.request.post('/api/state/patch', {
    headers: { Authorization: `Bearer ${await tokenOf(page)}`, 'Content-Type': 'application/json' },
    data: { ops: [{ op: 'upsertReservation', year: start.getFullYear(), month: start.toLocaleString('en-US', { month: 'long' }), reservation: {
      id: 'res-e2e-dmg', bookingId: 'E2E-DMG-1', personName: 'Sam Lee', startDate: `${day(-5)}T10:00`, endDate: `${day(-2)}T10:00`,
      carModel: 'Toyota Corolla', licensePlate: '12-34567', amount: 120, baseAmount: 120, source: 'Website', status: 'CONFIRMED' } }] },
  });
  await page.reload();
  await openScreen(page, 'Vehicle Damages');
  await page.getByRole('button', { name: 'Add damage report' }).first().click();
  if (await page.getByRole('dialog').filter({ hasText: 'Security Check' }).count()) await enterSecurityKey(page);
  const form = page.getByRole('dialog').last();
  await form.getByPlaceholder('Enter booking ID').fill('E2E-DMG-1');
  await form.getByPlaceholder('0.00').fill('120');
  await form.getByPlaceholder(/Large scratch/).fill('E2E scratch on rear bumper');
  await savedOnServer(page, 'vehicleDamages', () => form.getByRole('button', { name: 'Add damage report' }).click());
  await page.reload();
  await openScreen(page, 'Vehicle Damages');
  await expect(page.getByText('E2E-DMG-1').first()).toBeVisible();
  await expect(page.getByText('E2E scratch on rear bumper').first()).toBeVisible();
});

test('reports download as PDF', async ({ page }) => {
  await login(page, ADMIN);
  await openScreen(page, 'Yearly Summary');
  const [summary] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export summary' }).click()]);
  expect(summary.suggestedFilename()).toMatch(/^summary_\d{4}_\w+\.pdf$/);
  await openScreen(page, 'Source Performance');
  const [source] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export/ }).first().click()]);
  expect(source.suggestedFilename()).toMatch(/^source_performance_.*\.pdf$/);
});
