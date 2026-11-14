// End-to-end click-through on PostgreSQL after rehearsal.cjs (server from run.sh on 8393 with MULTI_SUPPLIER=true). Screenshots in ./ui
const { chromium } = require('playwright');
const crypto = require('crypto'), fs = require('fs');
const API = 'http://localhost:8393', PW = 'rehearsal-pass-12345', OUT = __dirname + '/ui';
const Y = new Date().getFullYear() + 1;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`); };
const j = async (method, path, tok, body, xml) => { const r = await fetch(API + path, { method, headers: xml ? { 'Content-Type': 'application/xml', ...xml } : { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body ? (xml ? body : JSON.stringify(body)) : undefined }); const t = await r.text(); let b = t; try { b = JSON.parse(t); } catch { /* text */ } return { s: r.status, b, t }; };
const fillLogin = async (page, email) => {
  for (let i = 0; i < 20; i++) {
    await page.locator('#username-input').fill(email); await page.locator('#password-input').fill(PW);
    if (await page.locator('#username-input').inputValue() === email) break; await sleep(300);
  }
  await page.locator('button[type=submit]').click();
};
const shot = async (page, n) => { await sleep(700); await page.screenshot({ path: `${OUT}/${n}.png` }); };
(async () => {
  const b = await chromium.launch();
  const adminCtx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const admin = await adminCtx.newPage();
  // A. Admin portal
  await admin.goto(API + '/admin'); await admin.locator('#username-input').waitFor(); await sleep(1000);
  await fillLogin(admin, 'e2e-admin@example.test');
  await admin.getByTestId('platform-overview').waitFor({ timeout: 30000 }); await sleep(1500);
  check('A. admin portal opens with the platform overview', await admin.getByText('Active suppliers').isVisible());
  await shot(admin, '01-portal-overview');
  // B. New supplier through the wizard
  for (let i = 0; i < 10; i++) { await admin.getByRole('button', { name: 'New supplier' }).first().click(); if (await admin.getByTestId('new-supplier').isVisible()) break; await sleep(500); }
  await admin.locator('#ns-name').fill('Aqaba Coast Rentals');
  await admin.getByTestId('slug-status').filter({ hasText: 'Available' }).waitFor({ timeout: 10000 });
  const slug = await admin.getByTestId('slug-input').inputValue();
  check('B. sign-in address suggested from the name and available', slug === 'aqaba-coast-rentals', slug);
  await shot(admin, '02-wizard-address');
  await admin.getByRole('button', { name: 'Continue' }).click();
  await admin.getByTestId('plan-FULL').click(); await admin.getByRole('button', { name: 'Continue' }).click();
  await admin.locator('#ns-cn').fill('Huda Zoubi'); await admin.locator('#ns-ce').fill('huda@aqaba.example'); await admin.getByRole('button', { name: 'Continue' }).click();
  await admin.locator('#ns-on').fill('Huda Zoubi'); await admin.locator('#ns-oe').fill('owner@aqaba.example'); await admin.getByRole('button', { name: 'Continue' }).click();
  await admin.getByRole('button', { name: 'Create supplier' }).click();
  await admin.getByTestId('supplier-created').waitFor({ timeout: 20000 });
  const invite = await admin.getByTestId('invitation-link').inputValue();
  check('B. supplier created, its address and invitation link shown', (await admin.getByTestId('signin-url').innerText()).includes('/s/aqaba-coast-rentals') && invite.includes('/set-password?token='));
  await shot(admin, '03-wizard-created');
  // C. Owner chooses a password through the invitation
  const ownerCtx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const owner = await ownerCtx.newPage();
  await owner.goto(API + new URL(invite).pathname + new URL(invite).search); await owner.getByTestId('set-password').waitFor();
  await owner.locator('#sp-pw').fill(PW); await owner.locator('#sp-again').fill(PW); await owner.getByRole('button', { name: 'Set password' }).click();
  await owner.getByText('Your password is set').waitFor();
  check('C. owner set a password through the invitation link', true);
  // D. Branded sign-in at the supplier's own address
  await owner.goto(API + '/s/aqaba-coast-rentals'); await owner.getByTestId('login-brand').waitFor(); await sleep(1500);
  check('D. own sign-in page shows the supplier name, not NCT', (await owner.getByTestId('login-brand').innerText()).includes('Aqaba Coast Rentals'));
  await fillLogin(owner, 'owner@aqaba.example');
  await owner.locator('aside').first().waitFor({ timeout: 30000 }); await sleep(3000);
  check('D. owner lands in their own workspace', (await owner.locator('aside').first().innerText()).includes('Aqaba Coast Rentals'));
  await shot(owner, '04-owner-workspace');
  // E. Branding in Company Details (through the screen)
  await owner.locator('aside nav').getByText('Company Details', { exact: true }).last().click(); await owner.getByTestId('branding-panel').waitFor();
  await owner.getByRole('button', { name: 'Colour #b45309' }).click();
  await owner.getByPlaceholder('e.g. Staff sign-in · Amman and Aqaba').fill('Aqaba staff sign-in');
  await owner.getByRole('button', { name: 'Save changes' }).first().click(); await sleep(3500);
  const br = await j('GET', '/auth/branding?code=aqaba-coast-rentals');
  check('E. branding saved and shown on the sign-in page', br.b.brandColor === '#b45309' && br.b.signInTagline === 'Aqaba staff sign-in', JSON.stringify(br.b));
  // F. Fleet and a broker channel (the same calls the screens make)
  const ownerTok = await owner.evaluate(() => localStorage.getItem('token'));
  const key = 'aqaba-live-key-123';
  const ch = [{ id: 'agg-aqaba', name: 'Desert Trips', channelCode: 'AQT', vendorCode: 'ACR', locationCode: 'AMM', currency: 'USD', status: 'active',
    feedKeyHash: crypto.createHash('sha256').update(key).digest('hex'), connectionDetails: { environment: 'production' },
    bookingRules: { rateLimitPerMinute: 500, freeCancellationHours: 48, locations: [{ code: 'AMM', name: 'Airport' }] }, extras: [], currentRatePlans: [],
    ratePlanHistory: [{ id: 'p', submittedAt: '2026-01-01T00:00:00Z', version: 1, ratePlans: [{ id: 'r', name: 'All year', startDate: `${Y}-01-01`, endDate: `${Y}-12-31`, sippRates: [{ id: 's', sippCode: 'IFAR', tiers: [{ id: 't', fromDay: 1, toDay: null, dailyPrice: 60 }] }] }] }] }];
  const fl = [{ id: 'w1', modelName: 'Toyota Land Cruiser', licensePlate: 'W-100', category: 'SUV', sippCode: 'IFAR', transmission: 'Automatic', securityDeposit: 400, excess: 800, registrationExpiry: '2030-01-01' }];
  const saved = await j('POST', '/api/state/patch', ownerTok, { ops: [{ op: 'set', key: 'fleet', value: fl }, { op: 'set', key: 'aggregators', value: ch }] });
  check('F. owner saved fleet and broker channel', saved.s === 200, String(saved.s));
  // G0. Live access starts switched off: brokers are refused until the platform switches it on.
  const avail0 = `<OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="E"><VehAvailRQCore><VehRentalCore PickUpDateTime="${Y}-06-01T10:00:00" ReturnDateTime="${Y}-06-05T10:00:00"><PickUpLocation LocationCode="AMM"/><ReturnLocation LocationCode="AMM"/></VehRentalCore><DriverType Age="35"/></VehAvailRQCore></OTA_VehAvailRateRQ>`;
  const before = await j('POST', '/ota/v1/AQT/OTA_VehAvailRate', null, avail0, { 'X-Api-Key': key });
  check('G0. before go-live, live broker calls are refused with a clear reason', before.t.includes('Live access is not enabled'));
  // G1. The platform admin switches live access on in the portal.
  await admin.getByRole('button', { name: /^Open Aqaba Coast/ }).click(); await admin.getByTestId('supplier-page').waitFor(); await sleep(800);
  await admin.locator('#sp-live').click(); await sleep(1500);
  check('G1. live access switched on in the portal', (await admin.locator('#sp-live').getAttribute('aria-checked')) === 'true');
  // G. Broker searches and books
  const avail = `<OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="E"><VehAvailRQCore><VehRentalCore PickUpDateTime="${Y}-06-01T10:00:00" ReturnDateTime="${Y}-06-05T10:00:00"><PickUpLocation LocationCode="AMM"/><ReturnLocation LocationCode="AMM"/></VehRentalCore><DriverType Age="35"/></VehAvailRQCore></OTA_VehAvailRateRQ>`;
  const s1 = await j('POST', '/ota/v1/AQT/OTA_VehAvailRate', null, avail, { 'X-Api-Key': key });
  const cars = [...s1.t.matchAll(/<VehMakeModel Name="([^"]+)"/g)].map(m => m[1]);
  check("G. broker gets only Aqaba Coast's car", cars.join() === 'Toyota Land Cruiser or similar', cars.join());
  check('G. answer names Aqaba Coast Rentals, never NCT', s1.t.includes('Aqaba Coast Rentals') && !/NCT|UR-Drive/.test(s1.t));
  const offer = (s1.t.match(/Type="16" ID="(OFF-[^"]+)"/) || [])[1];
  const res = `<OTA_VehResRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="B"><VehResRQCore><Customer><Primary BirthDate="1988-02-01"><PersonName><GivenName>Sara</GivenName><Surname>Haddad</Surname></PersonName><Telephone PhoneNumber="+962791111111"/><Email>sara@example.com</Email><Address><CountryName Code="JO"/></Address><Document DocID="JO777" DocType="4" DocIssueCountry="JO"/></Primary></Customer></VehResRQCore><VehResRQInfo><Reference Type="16" ID="${offer}"/><TPA_Extensions><BrokerReference>AQABA-REF-1</BrokerReference></TPA_Extensions></VehResRQInfo></OTA_VehResRQ>`;
  const bk = await j('POST', '/ota/v1/AQT/OTA_VehRes', null, res, { 'X-Api-Key': key });
  const rsv = (bk.t.match(/RSV-\d{4}-\d{6}/) || [])[0];
  check('G. broker booking confirmed', !!rsv, rsv);
  // H. The booking shows in the owner's OTA XML screen
  await owner.reload(); await owner.locator('aside').first().waitFor(); await sleep(2500);
  await owner.locator('aside nav').getByText('OTA XML', { exact: true }).last().click(); await sleep(2000);
  await owner.getByRole('button', { name: /^XML reservations/ }).first().click(); await sleep(2500);
  check("H. booking appears in the owner's XML reservations", (await owner.locator('main').innerText()).includes(rsv), rsv);
  await shot(owner, '05-owner-xml-reservations');
  // I. Another supplier does not see it
  const ddrTok = (await j('POST', '/auth/login', null, { email: 'owner@ddr.example', password: PW })).b.token;
  const ddrState = await j('GET', '/api/state', ddrTok);
  check('I. Desert Drive (another supplier) does not see the booking or the car', !ddrState.t.includes('AQABA-REF-1') && !ddrState.t.includes('Land Cruiser'));
  check('I. Desert Drive cannot open the Aqaba Coast channel', (await j('GET', '/api/channels/agg-aqaba/bookings', ddrTok)).s === 404);
  check("I. UR-Drive's admin does not see it either", !(await j('GET', '/api/state', await admin.evaluate(() => localStorage.getItem('token')))).t.includes('AQABA-REF-1'));
  // J. Support access from the portal (read-only, in a new tab)
  await admin.goto(API + '/admin/suppliers/acr'); await admin.getByTestId('supplier-page').waitFor({ timeout: 15000 }).catch(() => null);
  if (!(await admin.getByTestId('supplier-page').isVisible().catch(() => false))) {
    await admin.goto(API + '/admin/suppliers'); await admin.getByTestId('suppliers-page').waitFor(); await admin.getByText('Aqaba Coast Rentals').first().click(); await admin.getByTestId('supplier-page').waitFor();
  }
  await sleep(1000);
  await shot(admin, '06-portal-supplier');
  await admin.getByRole('button', { name: 'Support access' }).click(); await admin.locator('#su-reason').fill('End-to-end test of support access');
  const [tab] = await Promise.all([adminCtx.waitForEvent('page'), admin.getByRole('button', { name: 'Open support view' }).click()]);
  await tab.getByTestId('support-banner').waitFor({ timeout: 30000 }); await sleep(2500);
  check('J. support view opens read-only with its banner', (await tab.getByTestId('support-banner').innerText()).includes('read-only'));
  const tabTok = await tab.evaluate(() => sessionStorage.getItem('nct.supportToken'));
  check('J. support view cannot change anything', (await j('POST', '/api/state/patch', tabTok, { ops: [{ op: 'set', key: 'fleet', value: [] }] })).s === 403);
  await tab.screenshot({ path: `${OUT}/07-support-view.png` }); await tab.close();
  const ownerLog = await j('GET', '/api/activity?limit=100', ownerTok);
  check("J. support access written in the supplier's own activity log", ownerLog.t.includes('End-to-end test of support access'));
  // K. Change the sign-in address
  await admin.getByRole('button', { name: 'Change address' }).click(); await admin.locator('#ad-slug').fill('aqaba-coast');
  await admin.getByTestId('slug-status').filter({ hasText: 'Available' }).waitFor({ timeout: 10000 });
  await admin.getByRole('button', { name: 'Save address' }).click(); await sleep(1500);
  check('K. new address works, old one stops, short code works',
    (await j('GET', '/auth/branding?code=aqaba-coast')).s === 200 && (await j('GET', '/auth/branding?code=aqaba-coast-rentals')).s === 404 && (await j('GET', '/auth/branding?code=ACR')).s === 200);
  // L. Pause the supplier
  await admin.getByRole('button', { name: 'Pause' }).click(); await admin.locator('#st-reason').fill('End-to-end test pause'); await admin.getByRole('button', { name: 'Pause supplier' }).click(); await sleep(1500);
  check('L. paused: owner cannot sign in', (await j('POST', '/auth/login', null, { email: 'owner@aqaba.example', password: PW })).s === 403);
  check('L. paused: its broker is not answered', (await j('POST', '/ota/v1/AQT/OTA_VehAvailRate', null, avail, { 'X-Api-Key': key })).s === 401);
  await admin.getByRole('button', { name: 'Reactivate' }).click(); await admin.getByRole('button', { name: 'Reactivate' }).last().click(); await sleep(1500);
  check('L. reactivated: broker answered again', (await j('POST', '/ota/v1/AQT/OTA_VehAvailRate', null, avail, { 'X-Api-Key': key })).s === 200);
  // M. Platform activity log
  await admin.goto(API + '/admin/activity'); await admin.getByTestId('platform-activity').waitFor(); await sleep(1200);
  const log = await admin.locator('main').innerText();
  check('M. activity log shows creation, address change, support access and pause',
    log.includes('Aqaba Coast Rentals') && log.includes('/s/aqaba-coast-rentals → /s/aqaba-coast') && log.includes('support access') && log.includes('End-to-end test pause'));
  await shot(admin, '08-portal-activity');
  // UR-Drive Jordan's own workspace still normal
  const urd = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await urd.goto(API + '/'); await urd.locator('#username-input').waitFor(); await sleep(1000);
  check("N. UR-Drive's sign-in page unchanged (NCT Rental)", (await urd.locator('.lg-brand-name').innerText()).includes('NCT Rental'));
  await fillLogin(urd, 'clerk@urd.example'); await urd.locator('aside').first().waitFor({ timeout: 30000 }); await sleep(2500);
  check('N. UR-Drive staff work as before', (await urd.locator('aside').first().innerText()).includes('NCT Rental'));
  await shot(urd, '09-urd-workspace');
  await b.close();
  fs.writeFileSync(OUT + '/results.json', JSON.stringify(results, null, 1));
  console.log(`${results.length} checks, ${results.filter(r => !r.ok).length} failed`);
  process.exit(results.every(r => r.ok) ? 0 : 1);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
