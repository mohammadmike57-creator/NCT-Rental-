import { test, expect, Page } from '@playwright/test';
import { ADMIN, STAFF, login } from './helpers';

/** Opens every screen in the side menu and checks none of them fails. */
async function openEveryScreen(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.dismiss());
  const names = await page.locator('aside nav').evaluate(nav =>
    [...nav.querySelectorAll('a, button')].map(x => (x as HTMLElement).innerText.trim().split('\n')[0]));
  // Section headings (CORE OPERATIONS, REPORTS…) are written in capitals; "OTA XML" is both a heading and a screen.
  const headings = new Set(['CORE OPERATIONS', 'REPORTS', 'FINANCIALS & INCIDENTS', 'DATA MANAGEMENT', 'ADMINISTRATION']);
  // This entry opens a form instead of a screen.
  const screens = [...new Set(names.filter(n => n && !headings.has(n) && n !== 'Agreement for Unlisted Reservation' && !/^Collapse/.test(n)))];
  expect(screens.length).toBeGreaterThan(3);
  for (const name of screens) {
    await page.locator('aside nav').getByText(name, { exact: true }).last().click();
    await expect(page.getByText('This screen could not be shown'), `screen "${name}"`).toHaveCount(0);
    await expect(page.locator('main, [role=main]').first()).toBeVisible();
  }
  expect(errors, 'no errors in the browser').toEqual([]);
  return screens;
}

test('every screen opens for an administrator', async ({ page }) => {
  await login(page, ADMIN);
  const screens = await openEveryScreen(page);
  expect(screens).toEqual(expect.arrayContaining(['Home', 'Reservations', 'Agreement', 'Yearly Summary', 'Accounting', 'Traffic Tickets',
    'Vehicle Damages', 'OTA XML', 'User & Staff Management', 'Fleet Management', 'Company Details', 'Activity Log']));
});

test('every screen a staff member has opens', async ({ page }) => {
  await login(page, STAFF);
  await openEveryScreen(page);
});

test('the app works on a phone', async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await phone.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#username-input').fill(ADMIN);
  await page.locator('#password-input').fill(process.env.E2E_PASSWORD as string);
  await page.locator('button[type=submit]').click();
  await expect(page.getByText(/Dashboard|Reservations/).first()).toBeVisible({ timeout: 20_000 });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, 'no sideways scrolling on a phone').toBeLessThanOrEqual(392);
  expect(errors).toEqual([]);
  await phone.close();
});
