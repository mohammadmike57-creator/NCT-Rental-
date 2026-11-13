import { test, expect, Page, Locator } from '@playwright/test';
import { ADMIN, day, login, openScreen, tokenOf, waitSaved } from './helpers';

/**
 * A whole working day in one go, in the order staff and a broker really do it:
 * a reservation entered at the desk → check-out with signatures → check-in with a return charge →
 * closed, in the reports → a broker connects and books over OTA XML → the booking and the broker's
 * traffic (with what the broker sends) show in the console. A screenshot is kept for every step.
 */
const SHOTS = 'test-results/full-flow';
let shot = 0;
const snap = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${String(++shot).padStart(2, '0')}-${name}.png`, fullPage: false });

async function sign(page: Page, pad: Locator) {
  for (let attempt = 1; ; attempt++) {
    try {
      await expect(pad).toBeVisible();
      await pad.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const box = await pad.boundingBox();
      if (!box) throw new Error('signature pad is not attached');
      await page.mouse.move(box.x + 30, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 15, box.y + box.height / 2 + (i % 2 ? 12 : -12));
      await page.mouse.up();
      return;
    } catch (e) {
      if (attempt >= 3 || !/not attached|detached/i.test(String(e))) throw e;
    }
  }
}
const agreement = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Rental agreement' }).last();
const next = (page: Page) => agreement(page).getByRole('button', { name: /^Next/ });
const CHECKLIST = ['Spare Tire', 'Jack & Tools', 'Windows & Windshield', 'Headlights', 'Turn Signals', 'AC / Heater', 'Audio System', 'Mirrors', 'Interior Cleanliness'];
const OTA = 'http://www.opentravel.org/OTA/2003/05';
const at = (n: number) => `${day(n)}T10:00:00`;

async function state(page: Page) {
  return (await page.request.get('/api/state', { headers: { Authorization: `Bearer ${await tokenOf(page)}` } })).json();
}
async function setSection(page: Page, key: string, value: unknown) {
  const r = await page.request.post('/api/state/patch', {
    headers: { Authorization: `Bearer ${await tokenOf(page)}`, 'Content-Type': 'application/json' },
    data: { ops: [{ op: 'set', key, value }] },
  });
  expect(r.status()).toBe(200);
}

test('a whole working day: desk reservation, check-out, check-in, reports, broker booking over XML', async ({ page, request }) => {
  test.setTimeout(240_000);
  page.on('dialog', d => d.accept());

  // ---- Setup the company already has: cars, branches, sources ----
  await login(page, ADMIN);
  await setSection(page, 'rentalLocations', [{ id: 'l1', name: 'Airport Office', address: 'Queen Alia Airport' }]);
  await setSection(page, 'fleet', [1, 2, 3].map(i => ({ id: `c${i}`, modelName: 'Toyota Corolla', licensePlate: `12-3456${i}`, category: 'Economy', sippCode: 'EDAR',
    transmission: 'Automatic', securityDeposit: 200, excess: 500, registrationExpiry: '2030-01-01' })));
  await setSection(page, 'sources', [{ id: 's1', name: 'Website', paymentType: 'Prepaid' }]);
  await page.reload();
  await expect(page.locator('aside')).toBeVisible();
  await snap(page, 'signed-in-home');

  // ---- 1. A reservation entered at the desk, through the form ----
  await openScreen(page, 'Reservations');
  await page.getByRole('button', { name: 'New reservation' }).click();
  const form = page.getByRole('dialog', { name: 'New reservation' });
  const dates = form.getByLabel(/^Date/);
  await dates.nth(0).fill(day(0));
  await dates.nth(1).fill(day(3));
  await form.getByLabel('Location').selectOption({ index: 1 });
  await form.getByLabel('Source').selectOption({ index: 1 });
  await form.getByLabel(/^Booking ID/).fill('FLOW-1001');
  await form.getByRole('button', { name: 'Next' }).click();
  await form.getByLabel(/Car model|Or type another model/).fill('Toyota Corolla');
  await form.getByRole('button', { name: 'Next' }).click();
  await form.getByLabel(/^Renter name/).fill('John Doe');
  await form.getByRole('button', { name: 'Next' }).click();
  await form.getByLabel(/^Base amount/).fill('150');
  await form.getByRole('button', { name: 'Next' }).click();
  await expect(form).toContainText('FLOW-1001');
  await snap(page, 'new-reservation-review');
  await form.getByRole('button', { name: 'Create reservation' }).click();
  await expect(form).toHaveCount(0);
  await waitSaved(page);
  await page.reload();
  await openScreen(page, 'Reservations');
  await page.getByPlaceholder(/Search name, booking no/).fill('FLOW-1001');
  await expect(page.getByText('John Doe').first(), 'the reservation is on the server').toBeVisible({ timeout: 15_000 });
  await snap(page, 'reservation-saved');

  // ---- 2. Check-out: the customer takes the car ----
  await page.getByRole('button', { name: /Check out/ }).first().click();
  const a = agreement(page);
  await expect(a).toBeVisible();
  await a.getByPlaceholder('name@example.com').fill('john.doe@example.com');
  await next(page).click();
  await a.getByPlaceholder(/plate number/i).fill('12-34561');
  await next(page).click();
  for (const item of CHECKLIST) await a.getByRole('button', { name: new RegExp(item.replace(/[/&]/g, '.')) }).first().click();
  await snap(page, 'checkout-inspection');
  await next(page).click();
  await next(page).click();                                   // no existing damage
  await a.getByRole('button', { name: 'Fuel 8 of 8' }).click();
  await a.getByPlaceholder('Starting reading').fill('20000');
  await next(page).click();
  await next(page).click();                                   // prepaid: nothing to collect
  await a.getByPlaceholder('Enter name').fill('Sara Agent');
  await sign(page, a.locator('canvas').first());
  await expect(a.getByText('1 of 2 signed')).toBeVisible();
  await sign(page, a.locator('canvas').first());
  await expect(a.getByText('7/7')).toBeVisible();
  await snap(page, 'checkout-signed');
  await a.getByRole('button', { name: /Complete check-out/ }).click();
  await expect(page.getByText(/Check-out complete/).first()).toBeVisible();
  await snap(page, 'checkout-complete');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /On rent\s*1/ }).first()).toBeVisible();

  // ---- 3. Check-in: the car comes back with less fuel and a fuel charge ----
  await page.getByRole('button', { name: /Check in/ }).first().click();
  const c = agreement(page);
  await expect(c).toBeVisible();
  await c.getByText('Final return', { exact: true }).click();
  await next(page).click();
  for (const item of CHECKLIST) await c.getByRole('button', { name: new RegExp(item.replace(/[/&]/g, '.')) }).first().click();
  await next(page).click();
  await next(page).click();                                   // no new damage
  await c.getByRole('button', { name: 'Fuel 6 of 8' }).click();
  await c.getByPlaceholder('Returning reading').fill('20380');
  await next(page).click();
  await c.getByRole('button', { name: '+ Traffic violation' }).click();
  await c.getByPlaceholder(/Speeding 92/).fill('Speeding 92 km/h in 60 zone - Airport Road');
  await c.getByPlaceholder('0.000').first().fill('30');
  await c.locator('input[type=date]').last().fill(day(1));
  await c.getByPlaceholder('Ticket / violation number').fill('TV-FLOW-1');
  await c.getByRole('button', { name: /Paid now/ }).click();
  await c.locator('select').filter({ has: page.locator('option', { hasText: 'Payment method…' }) }).selectOption({ index: 1 });
  await sign(page, c.locator('canvas').first());
  await expect(c.getByText(/Return charges.*Complete/).first()).toBeVisible();
  await snap(page, 'checkin-charges');
  await next(page).click();
  await c.getByPlaceholder('Enter name').fill('Omar Agent');
  await sign(page, c.locator('canvas').first());
  await expect(c.getByText('1 of 2 signed')).toBeVisible();
  await sign(page, c.locator('canvas').last());
  await expect(c.getByText('6/6')).toBeVisible();
  await c.getByRole('button', { name: /Complete check-in/ }).click();
  await expect(page.getByText(/Check-in complete/).first()).toBeVisible();
  await snap(page, 'checkin-complete');
  await page.getByRole('button', { name: 'Done' }).click();

  // ---- 4. Closed, kept on the server, and in the registers and reports ----
  await page.reload();
  await openScreen(page, 'Reservations');
  await page.getByPlaceholder(/Search name, booking no/).fill('FLOW-1001');
  await expect(page.getByRole('button', { name: /Closed\s*1/ }).first()).toBeVisible();
  await snap(page, 'reservation-closed');
  const saved = Object.values((await state(page)).reservations || {}).flatMap((y: any) => Object.values(y).flat()).find((r: any) => r.bookingId === 'FLOW-1001') as any;
  expect(saved.voucherSubmitted && saved.dropOffCompleted, 'check-out and check-in are stored').toBeTruthy();
  expect(saved.pickupRenterSignature && saved.dropOffRenterSignature, 'both signatures are stored').toBeTruthy();
  expect(Number(saved.dropOffKmIn)).toBe(20380);
  await openScreen(page, 'Traffic Tickets');
  await expect(page.getByText('FLOW-1001').first(), 'the violation reached the Traffic Tickets register').toBeVisible();
  await snap(page, 'traffic-tickets');
  await openScreen(page, 'Yearly Summary');
  await expect(page.getByText('This screen could not be shown')).toHaveCount(0);
  await snap(page, 'yearly-summary');

  // ---- 5. A broker connects and books over OTA XML ----
  await openScreen(page, 'OTA XML');
  await page.getByRole('button', { name: 'Add channel' }).first().click();
  await page.getByPlaceholder('Channel name, e.g. Rentalcars').fill('Flow Broker');
  await page.getByPlaceholder(/Code \(optional\)/).fill('FLW');
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await expect.poll(async () => (await state(page)).aggregators?.some((x: any) => x.channelCode === 'FLW')).toBe(true);
  const hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, { open: '00:00', close: '23:59' }]));
  const plan = { id: 'p1', name: 'Season', startDate: day(-5), endDate: day(200), sippRates: [{ id: 'r1', sippCode: 'EDAR', tiers: [{ id: 't1', fromDay: 1, toDay: null, dailyPrice: 40 }] }] };
  const aggs = (await state(page)).aggregators;
  Object.assign(aggs.find((x: any) => x.channelCode === 'FLW'), {
    currency: 'JOD', status: 'active', currentRatePlans: [plan],
    connectionDetails: { apiUrl: '', username: '', apiKey: '', environment: 'production' },   // live: bookings are real, not sandbox tests
    ratePlanHistory: [{ id: 'sub1', submittedAt: new Date().toISOString(), ratePlans: [plan], version: 1, publishedBy: 'E2E', currency: 'JOD' }],
    bookingRules: { freeCancellationHours: 48, minLeadHours: 2, minDriverAge: 21, maxRentalDays: 60,
      locations: [{ code: 'AMM', name: 'Airport Office', type: 'AIRPORT', pickup: true, dropOff: true, openingHours: hours }] },
  });
  await setSection(page, 'aggregators', aggs);
  await page.reload();
  await openScreen(page, 'OTA XML');
  await page.getByRole('button', { name: /^API keys/ }).first().click();
  // The live key of this broker (its row; other brokers may be listed too).
  await page.getByRole('row').filter({ hasText: 'Flow Broker' }).getByRole('button', { name: 'Create', exact: true }).first().click();
  await expect(page.getByText(/urd_[A-Za-z0-9_-]{20,}/).first()).toBeVisible();
  const key = /urd_[A-Za-z0-9_-]{20,}/.exec(await page.locator('body').innerText())![0];
  for (const b of await page.getByRole('button', { name: /^(Done|I have copied it)/ }).all()) if (await b.isVisible()) await b.click({ timeout: 2000 }).catch(() => {});
  await expect.poll(async () => !!(await state(page)).aggregators.find((x: any) => x.channelCode === 'FLW').feedKeyHash, { timeout: 15_000 }).toBe(true);

  const send = async (path: string, body: string, type = 'application/xml') => {
    const r = await request.post(path, { headers: { 'Content-Type': type, 'X-Api-Key': key }, data: body });
    return { status: r.status(), body: await r.text() };
  };
  const search = await send('/ota/2024A/FLW/OTA_VehAvailRate', `<OTA_VehAvailRateRQ xmlns="${OTA}" Version="2.000"><VehAvailRQCore>
    <VehRentalCore PickUpDateTime="${at(30)}" ReturnDateTime="${at(34)}"><PickUpLocation LocationCode="AMM"/><ReturnLocation LocationCode="AMM"/></VehRentalCore>
    <DriverType Age="35"/></VehAvailRQCore></OTA_VehAvailRateRQ>`);
  expect(search.status).toBe(200);
  expect(search.body).toContain('<Success/>');
  expect(search.body, 'brokers never see the NCT name').not.toMatch(/NCT/);
  const offer = /Type="16" ID="(OFF-[^"]+)"/.exec(search.body)![1];
  const book = await send('/ota/v1/FLW/soap', `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>
    <OTA_VehResRQ xmlns="${OTA}" Version="2.000"><VehResRQCore><Customer><Primary BirthDate="1990-05-01"><PersonName><GivenName>Jane</GivenName><Surname>Roe</Surname></PersonName>
    <Email>jane.roe@example.com</Email></Primary></Customer></VehResRQCore><VehResRQInfo><Reference Type="16" ID="${offer}"/>
    <TPA_Extensions><BrokerReference>FLW-REF-1</BrokerReference></TPA_Extensions></VehResRQInfo></OTA_VehResRQ></soap:Body></soap:Envelope>`, 'application/soap+xml');
  expect(book.status).toBe(200);
  const conf = /ID="(RSV-[^"]+)"/.exec(book.body)![1];
  expect(conf, 'the broker gets our reservation number').toBeTruthy();

  // ---- 6. The broker's booking and traffic in the console ----
  await page.reload();
  await openScreen(page, 'OTA XML');
  await page.getByRole('button', { name: /^XML reservations/ }).first().click();
  await expect(page.getByText('FLW-REF-1').first(), 'the broker booking is in XML reservations').toBeVisible();
  await snap(page, 'xml-reservations');
  await page.getByRole('button', { name: /^Channels/ }).first().click();
  await page.getByText('Flow Broker').first().click();
  await page.getByRole('button', { name: 'Traffic', exact: true }).first().click();
  const sends = page.getByTestId('broker-protocols');
  await expect(sends, 'the new panel shows what the broker sends').toBeVisible({ timeout: 15_000 });
  await expect(sends).toContainText('OTA 2024A · Version 2.000');
  await expect(sends).toContainText('OTA v1 · SOAP 1.2 · Version 2.000');
  await snap(page, 'traffic-what-the-broker-sends');
  await page.getByRole('button', { name: /^Connection/ }).first().click();
  await expect(page.getByLabel('OpenTravel release')).toBeVisible();
  await expect(page.getByLabel('SOAP version')).toBeVisible();
  await page.getByText('Schema check of broker requests').scrollIntoViewIfNeeded();
  await snap(page, 'connection-settings');

  // ---- 7. The developer page brokers read ----
  await page.goto('/ota/developers#xml-answers');
  await expect(page.getByRole('heading', { name: 'Sample answers' })).toBeVisible();
  await snap(page, 'developer-portal-samples');
});
