import { test, expect, Page } from '@playwright/test';
import { ADMIN, STAFF, day, login, openScreen, waitSaved } from './helpers';

async function createBooking(page: Page, bookingId: string, renter: string) {
  await openScreen(page, 'Reservations');
  await page.getByRole('button', { name: 'New reservation' }).click();
  const form = page.getByRole('dialog', { name: 'New reservation' });

  // 1. Dates & branch
  const dates = form.getByLabel(/^Date/);
  await dates.nth(0).fill(day(2));
  await dates.nth(1).fill(day(5));
  await form.getByLabel('Location').selectOption({ index: 1 });
  await form.getByLabel('Source').selectOption({ index: 1 });
  await form.getByLabel(/^Booking ID/).fill(bookingId);
  await form.getByRole('button', { name: 'Next' }).click();

  // 2. Vehicle
  await form.getByLabel(/Car model|Or type another model/).fill('Toyota Corolla');
  await form.getByRole('button', { name: 'Next' }).click();

  // 3. Customer
  await form.getByLabel(/^Renter name/).fill(renter);
  await form.getByRole('button', { name: 'Next' }).click();

  // 4. Extras & price
  await form.getByLabel(/^Base amount/).fill('120');
  await form.getByRole('button', { name: 'Next' }).click();

  // 5. Review
  await expect(form).toContainText(bookingId);
  await form.getByRole('button', { name: 'Create reservation' }).click();
  await expect(form).toHaveCount(0);
}

test('a new booking is saved on the server and still there after a reload', async ({ page }) => {
  await login(page, ADMIN);
  await createBooking(page, 'E2E-1001', 'John Doe');
  await expect(page.getByText('John Doe').first()).toBeVisible();
  await waitSaved(page);

  await page.reload();
  await openScreen(page, 'Reservations');
  await page.getByPlaceholder(/Search name, booking no/).fill('E2E-1001');
  await expect(page.getByText('John Doe').first()).toBeVisible({ timeout: 15_000 });
});

test('two people working at the same time never lose each other\'s bookings', async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const staff = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(admin, ADMIN);
  await login(staff, STAFF);
  // Both enter a booking at the same moment.
  await Promise.all([createBooking(admin, 'E2E-TWO-A', 'Alice Admin'), createBooking(staff, 'E2E-TWO-B', 'Bob Staff')]);
  await Promise.all([waitSaved(admin), waitSaved(staff)]);
  await admin.waitForTimeout(3000);
  // Each one, after a reload, sees both bookings.
  for (const page of [admin, staff]) {
    await page.reload();
    await openScreen(page, 'Reservations');
    for (const name of ['Alice Admin', 'Bob Staff']) {
      await page.getByPlaceholder(/Search name, booking no/).fill(name);
      await expect(page.getByText(name).first(), `${name} is kept`).toBeVisible({ timeout: 15_000 });
    }
  }
  await admin.context().close();
  await staff.context().close();
});

test('editing a booking keeps the change', async ({ page }) => {
  await login(page, ADMIN);
  await createBooking(page, 'E2E-EDIT-1', 'Edith Edit');
  await waitSaved(page);
  await page.getByPlaceholder(/Search name, booking no/).fill('E2E-EDIT-1');
  await page.getByText('Edith Edit').first().click();
  const edit = page.getByRole('button', { name: /^Edit/ }).first();
  await edit.click();
  const form = page.getByRole('dialog', { name: 'Edit reservation' });
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: /Customer/ }).first().click();
  await form.getByLabel(/^Phone/).fill('+962791112222');
  await form.getByRole('button', { name: /Save changes|^Save$/ }).first().click();
  await expect(form).toHaveCount(0);
  await waitSaved(page);
  await page.waitForTimeout(2500);
  await page.reload();
  await openScreen(page, 'Reservations');
  await page.getByPlaceholder(/Search name, booking no/).fill('E2E-EDIT-1');
  await page.getByText('Edith Edit').first().click();
  await expect(page.getByText('+962791112222').first()).toBeVisible();
});
