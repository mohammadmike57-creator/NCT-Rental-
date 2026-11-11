import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { ADMIN, day, login, openScreen, tokenOf } from './helpers';

/**
 * A broker connects over OTA XML: the channel is created in the console, rates are published,
 * an API key is made on the API keys screen, and the broker searches, books, changes and cancels.
 * Brokers only ever see the brand UR-Drive Jordan.
 */
const OTA = 'http://www.opentravel.org/OTA/2003/05';
const at = (n: number, time = '10:00') => `${day(n)}T${time}:00`;

async function staffState(page: Page) {
  return (await page.request.get('/api/state', { headers: { Authorization: `Bearer ${await tokenOf(page)}` } })).json();
}
async function setSection(page: Page, key: string, value: unknown) {
  const r = await page.request.post('/api/state/patch', {
    headers: { Authorization: `Bearer ${await tokenOf(page)}`, 'Content-Type': 'application/json' },
    data: { ops: [{ op: 'set', key, value }] },
  });
  expect(r.status()).toBe(200);
}
async function updateChannel(page: Page, fn: (a: any) => void) {
  const s = await staffState(page);
  const aggs = s.aggregators;
  fn(aggs.find((a: any) => a.channelCode === 'TBR'));
  await setSection(page, 'aggregators', aggs);
}
const ota = async (req: APIRequestContext, key: string, msg: string, body: string, extra: Record<string, string> = {}) => {
  const r = await req.post(`/ota/v1/TBR/${msg}`, { headers: { 'Content-Type': 'application/xml', 'X-Api-Key': key, ...extra }, data: body });
  return { status: r.status(), body: await r.text() };
};
const avail = (pu: string, ret: string, from = 'AMM') => `<OTA_VehAvailRateRQ xmlns="${OTA}" EchoToken="A"><VehAvailRQCore>
  <VehRentalCore PickUpDateTime="${pu}" ReturnDateTime="${ret}"><PickUpLocation LocationCode="${from}"/><ReturnLocation LocationCode="${from}"/></VehRentalCore>
  <DriverType Age="35"/></VehAvailRQCore></OTA_VehAvailRateRQ>`;
const vehRes = (offer: string, ref: string) => `<OTA_VehResRQ xmlns="${OTA}" EchoToken="R"><VehResRQCore>
  <Customer><Primary BirthDate="1990-05-01"><PersonName><GivenName>John</GivenName><Surname>Doe</Surname></PersonName>
  <Telephone PhoneNumber="+962790000000"/><Email>john@example.com</Email><Address><CountryName Code="JO"/></Address>
  <Document DocID="JO123456" DocType="4" DocIssueCountry="JO"/></Primary></Customer>
  </VehResRQCore><VehResRQInfo><Reference Type="16" ID="${offer}"/><TPA_Extensions><BrokerReference>${ref}</BrokerReference></TPA_Extensions></VehResRQInfo></OTA_VehResRQ>`;
const offerFor = (xml: string, group: string) => {
  const block = xml.split('<VehAvail>').slice(1).find(x => x.includes(`Code="${group}"`));
  if (!block) return null;
  return {
    offer: (/Type="16" ID="(OFF-[^"]+)"/.exec(block) || [])[1],
    total: (/EstimatedTotalAmount="([^"]+)"/.exec(block) || [])[1],
    count: Number((/<Availability Count="(\d+)"/.exec(block) || [])[1] || 0),
  };
};
const allBookings = (s: any) => Object.values(s.reservations || {}).flatMap((y: any) => Object.values(y).flat()) as any[];

test('a broker connects, searches, books, changes and cancels over OTA XML', async ({ page, request }) => {
  test.setTimeout(120_000);
  page.on('dialog', d => d.accept());
  await login(page, ADMIN);

  // The company's cars and branches.
  await setSection(page, 'rentalLocations', [{ id: 'l1', name: 'Airport Office', address: 'Queen Alia Airport' }, { id: 'l2', name: 'Aqaba Branch', address: 'Aqaba' }]);
  await setSection(page, 'fleet', [1, 2, 3].map(i => ({ id: `c${i}`, modelName: 'Kia Pegas', licensePlate: `10-100${i}`, category: 'Compact', sippCode: 'CDAR', transmission: 'Automatic', securityDeposit: 150, excess: 400, registrationExpiry: '2030-01-01' })));
  await page.reload();

  // 1. The channel is created in the OTA XML console.
  await openScreen(page, 'OTA XML');
  await page.getByRole('button', { name: 'Add channel' }).first().click();
  await page.getByPlaceholder('Channel name, e.g. Rentalcars').fill('Test Broker');
  await page.getByPlaceholder(/Code \(optional\)/).fill('TBR');
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await expect.poll(async () => (await staffState(page)).aggregators?.some((a: any) => a.channelCode === 'TBR')).toBe(true);
  const created = (await staffState(page)).aggregators.find((a: any) => a.channelCode === 'TBR');
  expect(created.status, 'a new channel starts in Testing').toBe('testing');

  // 2. Rates published (40/day for 1–2 days, 35/day for 3–6, 30/day from 7), branch rules, cancellation.
  const hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, { open: '00:00', close: '23:59' }]));
  const plan = { id: 'p1', name: 'This season', startDate: day(-5), endDate: day(200), sippRates: [
    { id: 'r1', sippCode: 'CDAR', tiers: [{ id: 't1', fromDay: 1, toDay: 2, dailyPrice: 40 }, { id: 't2', fromDay: 3, toDay: 6, dailyPrice: 35 }, { id: 't3', fromDay: 7, toDay: null, dailyPrice: 30 }] }] };
  await updateChannel(page, a => {
    a.currency = 'JOD';
    a.currentRatePlans = [plan];
    a.ratePlanHistory = [{ id: 'sub1', submittedAt: new Date().toISOString(), ratePlans: [plan], version: 1, publishedBy: 'E2E', currency: 'JOD' }];
    a.bookingRules = {
      freeCancellationHours: 48, lateCancellationFeePercent: 100, minLeadHours: 2, minDriverAge: 21, maxRentalDays: 60, graceMinutes: 120,
      locations: [{ code: 'AMM', name: 'Airport Office', type: 'AIRPORT', pickup: true, dropOff: true, openingHours: hours }],
      pricing: { taxPercent: 16, taxIncluded: true, taxName: 'Sales tax', unlimitedMileage: true },
    };
  });

  // 3. API key made on the API keys screen; shown once, only a fingerprint is stored.
  await page.reload();
  await openScreen(page, 'OTA XML');
  await page.getByRole('button', { name: /^API keys/ }).first().click();
  await page.getByRole('button', { name: /^Create/ }).first().click();
  await expect(page.getByText(/urd_[A-Za-z0-9_-]{20,}/).first()).toBeVisible();
  const key = /urd_[A-Za-z0-9_-]{20,}/.exec(await page.locator('body').innerText())![0];
  // The person confirms they copied it; the key is then active.
  for (const b of await page.getByRole('button', { name: /^(Done|I have copied it)/ }).all()) {
    if (await b.isVisible()) await b.click({ timeout: 2000 }).catch(() => {});
  }
  await expect.poll(async () => {
    const ch = (await staffState(page)).aggregators.find((a: any) => a.channelCode === 'TBR');
    return !!ch.feedKeyHash;
  }, { timeout: 15_000 }).toBe(true);
  expect(JSON.stringify(await staffState(page)), 'only a fingerprint is stored, never the key').not.toContain(key);

  // 4. The broker connects.
  let r = await ota(request, key, 'OTA_Ping', `<OTA_PingRQ xmlns="${OTA}"><EchoData>hello</EchoData></OTA_PingRQ>`);
  expect(r.status).toBe(200);
  expect(r.body).toContain('<Success/>');
  expect(r.body, 'brokers never see the NCT name').not.toMatch(/NCT/);
  expect((await ota(request, 'urd_wrong_key_0000000000000000', 'OTA_Ping', `<OTA_PingRQ xmlns="${OTA}"/>`)).status, 'a wrong key is refused').toBe(401);

  // 5. Go live, search: 3 days at 35/day = 105, three cars free.
  await updateChannel(page, a => { a.status = 'active'; a.connectionDetails = { ...(a.connectionDetails || {}), environment: 'production' }; });
  r = await ota(request, key, 'OTA_VehAvailRate', avail(at(20), at(23)));
  expect(r.status).toBe(200);
  const o = offerFor(r.body, 'CDAR')!;
  expect(o.total).toBe('105.00');
  expect(o.count).toBe(3);

  // 6. Book. The same retry gives the same booking, never a second one.
  r = await ota(request, key, 'OTA_VehRes', vehRes(o.offer, 'BRK-1'), { 'Idempotency-Key': 'e2e-1' });
  const conf = (/ID="(RSV-[^"]+)"/.exec(r.body) || [])[1];
  expect(r.body).toContain('CONFIRMED');
  expect(conf).toBeTruthy();
  expect((await ota(request, key, 'OTA_VehRes', vehRes(o.offer, 'BRK-1'), { 'Idempotency-Key': 'e2e-1' })).body).toContain(conf);
  let booked = allBookings(await staffState(page)).filter(b => b.bookingId === 'BRK-1');
  expect(booked.length, 'stored once').toBe(1);
  expect(Number(booked[0].amount)).toBe(105);
  expect(offerFor((await ota(request, key, 'OTA_VehAvailRate', avail(at(20), at(23)))).body, 'CDAR')!.count, 'one car fewer free').toBe(2);

  // 7. The booking shows in the console's XML reservations.
  await page.reload();
  await openScreen(page, 'OTA XML');
  await page.getByRole('button', { name: /^XML reservations/ }).first().click();
  await expect(page.getByText('BRK-1').first()).toBeVisible();

  // 8. Change to 7 days: 30 × 7 = 210; then cancel (free, more than 48 hours ahead).
  r = await ota(request, key, 'OTA_VehModify', `<OTA_VehModifyRQ xmlns="${OTA}"><VehModifyRQCore ModifyType="Modify"><UniqueID Type="14" ID="${conf}"/>
    <VehRentalCore PickUpDateTime="${at(20)}" ReturnDateTime="${at(27)}"/></VehModifyRQCore></OTA_VehModifyRQ>`);
  expect(r.status).toBe(200);
  expect(r.body).toContain('210.00');
  expect(Number(allBookings(await staffState(page)).find(b => b.bookingId === 'BRK-1').amount)).toBe(210);
  r = await ota(request, key, 'OTA_VehCancel', `<OTA_VehCancelRQ xmlns="${OTA}"><VehCancelRQCore CancelType="Cancel"><UniqueID Type="14" ID="${conf}"/>
    <PersonName><Surname>Doe</Surname></PersonName></VehCancelRQCore></OTA_VehCancelRQ>`);
  expect(r.status).toBe(200);
  expect(r.body).toMatch(/Cancelled|CANCELLED/);
  booked = allBookings(await staffState(page)).filter(b => b.bookingId === 'BRK-1');
  expect(booked.length, 'a cancelled booking is kept, never deleted').toBe(1);
  expect(booked[0].status).toMatch(/CANCEL/i);
  expect(offerFor((await ota(request, key, 'OTA_VehAvailRate', avail(at(20), at(23)))).body, 'CDAR')!.count, 'the car is free again').toBe(3);
});
