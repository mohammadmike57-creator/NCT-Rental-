import { test, expect, Page, Locator } from '@playwright/test';
import { ADMIN, day, login, openScreen, tokenOf } from './helpers';

/** Draws a short line on a signature pad, like a finger or mouse would. */
async function sign(page: Page, pad: Locator) {
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 15, box.y + box.height / 2 + (i % 2 ? 12 : -12));
  await page.mouse.up();
}

const agreement = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Rental agreement' }).last();
const next = (page: Page) => agreement(page).getByRole('button', { name: /^Next/ });

test('a full check-out and check-in, with a traffic violation that reaches the Traffic Tickets register', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await login(page, ADMIN);
  const start = new Date(day(0) + 'T10:00:00');
  const res = await page.request.post('/api/state/patch', {
    headers: { Authorization: `Bearer ${await tokenOf(page)}`, 'Content-Type': 'application/json' },
    data: { ops: [{ op: 'upsertReservation', year: start.getFullYear(), month: start.toLocaleString('en-US', { month: 'long' }), reservation: {
      id: 'res-e2e-flow', bookingId: 'E2E-FLOW-1', personName: 'Jane Roe', contactNumber: '+962790000000',
      startDate: `${day(0)}T10:00`, endDate: `${day(3)}T10:00`, carModel: 'Toyota Corolla', amount: 150, baseAmount: 150,
      source: 'Website', locationName: 'Amman', status: 'CONFIRMED',
    } }] },
  });
  expect(res.status()).toBe(200);
  await page.reload();
  await openScreen(page, 'Reservations');
  await page.getByPlaceholder(/Search name, booking no/).fill('E2E-FLOW-1');
  await page.getByRole('button', { name: /Check out/ }).first().click();
  const a = agreement(page);
  await expect(a).toBeVisible();

  // 1. Customer
  await a.getByPlaceholder('name@example.com').fill('jane.roe@example.com');
  await next(page).click();
  // 2. Vehicle: the plate of the car handed over
  await a.getByPlaceholder(/plate number/i).fill('12-34567');
  await next(page).click();
  // 3. Inspection checklist: confirm every item
  for (const item of ['Spare Tire', 'Jack & Tools', 'Windows & Windshield', 'Headlights', 'Turn Signals', 'AC / Heater', 'Audio System', 'Mirrors', 'Interior Cleanliness']) {
    await a.getByRole('button', { name: new RegExp(item.replace(/[/&]/g, '.')) }).first().click();
  }
  await next(page).click();
  // 4. Damage: none
  await next(page).click();
  // 5. Fuel & mileage
  await a.getByRole('button', { name: 'Fuel 8 of 8' }).click();
  await a.getByPlaceholder('Starting reading').fill('12000');
  await next(page).click();
  // 6. Charges & payment (prepaid: nothing to collect)
  await next(page).click();
  // 7. Signatures
  await a.getByPlaceholder('Enter name').fill('Sara Agent');
  // A signed pad turns into the saved signature, so the next free pad is always the first canvas.
  await sign(page, a.locator('canvas').first()); // renter
  await expect(a.getByText('1 of 2 signed')).toBeVisible();
  await sign(page, a.locator('canvas').first()); // company representative
  // Every step is complete before the car is handed over.
  await expect(a.getByText('7/7')).toBeVisible();
  await page.screenshot({ path: 'test-results/checkout-before-complete.png' });
  await a.getByRole('button', { name: /Complete check-out/ }).click();
  await expect(page.getByText(/Check-out complete/).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/checkout-complete.png' });

  // The payment receipt downloads as a PDF.
  const [receipt] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Payment receipt/ }).click()]);
  expect(receipt.suggestedFilename()).toBe('receipt-E2E-FLOW-1.pdf');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /On rent\s*1/ }).first()).toBeVisible();

  // ---- Check-in ----
  await page.getByRole('button', { name: /Check in/ }).first().click();
  const c = agreement(page);
  await expect(c).toBeVisible();
  await c.getByText('Final return', { exact: true }).click();
  // 1. Return details (email already known)
  await next(page).click();
  // 2. Inspection: everything is as at pick-up
  for (const item of ['Spare Tire', 'Jack & Tools', 'Windows & Windshield', 'Headlights', 'Turn Signals', 'AC / Heater', 'Audio System', 'Mirrors', 'Interior Cleanliness']) {
    await c.getByRole('button', { name: new RegExp(item.replace(/[/&]/g, '.')) }).first().click();
  }
  await next(page).click();
  // 3. Damage: none new
  await next(page).click();
  // 4. Fuel & mileage
  await c.getByRole('button', { name: 'Fuel 6 of 8' }).click();
  await c.getByPlaceholder('Returning reading').fill('12450');
  await next(page).click();
  // 5. Return charges: a traffic violation found during the rental
  await c.getByRole('button', { name: '+ Traffic violation' }).click();
  await c.getByPlaceholder(/Speeding 92/).fill('Speeding 92 km/h in 60 zone - Airport Road');
  await c.getByPlaceholder('0.000').first().fill('30');
  await c.locator('input[type=date]').last().fill(day(1));
  await c.getByPlaceholder('Ticket / violation number').fill('TV-E2E-881');
  // Paid at the counter, by card, and the customer signs for the charge.
  await c.getByRole('button', { name: /Paid now/ }).click();
  await c.locator('select').filter({ has: page.locator('option', { hasText: 'Payment method…' }) }).selectOption({ index: 1 });
  await sign(page, c.locator('canvas').first());
  await expect(c.getByText(/Return charges.*Complete/).first()).toBeVisible();
  await next(page).click();
  // 6. Signatures
  await c.getByPlaceholder('Enter name').fill('Omar Agent');
  await sign(page, c.locator('canvas').first());
  await sign(page, c.locator('canvas').first());
  await expect(c.getByText('6/6')).toBeVisible();
  await c.getByRole('button', { name: /Complete check-in/ }).click();
  await expect(page.getByText(/Check-in complete/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  // The booking is closed, and the violation is in the Traffic Tickets register — also after a reload.
  await page.reload();
  await openScreen(page, 'Reservations');
  await page.getByPlaceholder(/Search name, booking no/).fill('E2E-FLOW-1');
  await expect(page.getByRole('button', { name: /Closed\s*1/ }).first()).toBeVisible();
  await openScreen(page, 'Traffic Tickets');
  await expect(page.getByText('E2E-FLOW-1').first()).toBeVisible();
  await expect(page.getByText(/Speeding 92 km\/h/).first()).toBeVisible();
});
