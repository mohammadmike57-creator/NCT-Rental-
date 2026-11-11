import { test, expect } from '@playwright/test';
import { ADMIN, day, login, openScreen, setSection } from './helpers';

test('editing a traffic ticket asks for the 0000 key', async ({ page }) => {
  await login(page, ADMIN);
  await setSection(page, 'trafficTickets', [
    { id: 'tt-e2e-1', bookingId: 'E2E-TT-1', ticketDate: day(-3), amount: 25, details: 'Speeding, Airport Road', status: 'NOT_COLLECTED' },
  ]);
  await page.reload();
  await openScreen(page, 'Traffic Tickets');
  await expect(page.getByText('E2E-TT-1').first()).toBeVisible({ timeout: 15_000 });

  const keyBox = page.getByRole('dialog').filter({ hasText: 'Security Check' });

  await page.getByRole('button', { name: 'Edit ticket' }).first().click();
  await keyBox.locator('input').fill('2024');
  await keyBox.locator('input').press('Enter');
  await expect(page.getByText('Invalid security key')).toBeVisible();

  await keyBox.locator('input').fill('0000');
  await keyBox.locator('input').press('Enter');
  await expect(keyBox).toHaveCount(0);
});
