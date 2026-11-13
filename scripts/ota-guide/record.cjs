// Records the OTA XML video guide (OTA XML → Video guide) from the real system.
// It starts the built server on a throwaway in-memory database, fills it with sample brokers, rates,
// bookings and traffic, and records every chapter with captions, a visible pointer and title cards.
// Nothing touches real data.
//
//   npm run build && mvn -B package -DskipTests -Dexec.skip=true
//   node scripts/ota-guide/record.cjs target/backend-0.0.1-SNAPSHOT.jar public/guide/ota [chapter-id ...]
//
// Then copy the lengths it prints into components/channel/videoGuide.ts. Needs ffmpeg.
/* global document, window -- the functions passed to page.evaluate run inside the browser */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const JAR = process.argv[2];
const OUT = path.resolve(process.argv[3]);
const ONLY = process.argv.slice(4);
const PORT = 8391;
const BASE = `http://localhost:${PORT}`;
const PASSWORD = 'guide-pass-1234567890';
const ADMIN = 'e2e-admin@example.test';
const OTA = 'http://www.opentravel.org/OTA/2003/05';
const W = 1280, H = 720;
fs.mkdirSync(OUT, { recursive: true });

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const at = n => `${day(n)}T10:00:00`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const probe = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

// ---------------------------------------------------------------- server and sample data
async function waitUp() {
  for (let i = 0; i < 180; i++) { try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* not up yet */ } await sleep(1000); }
  throw new Error('server did not start');
}
async function token() {
  const r = await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ADMIN, password: PASSWORD }) })).json();
  return r.token || r.accessToken;
}
async function patch(tok, ops) {
  const r = await fetch(`${BASE}/api/state/patch`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ ops }) });
  if (!r.ok) throw new Error('patch ' + r.status);
}

async function seed(browser) {
  const tok = await token();
  const hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, { open: '08:00', close: '22:00' }]));
  const plan = (id, from, to, prices) => ({ id, name: id === 'p1' ? 'Winter season' : 'Summer season', startDate: from, endDate: to, sippRates: [
    { id: `${id}-e`, sippCode: 'EDAR', tiers: [{ id: 't1', fromDay: 1, toDay: 2, dailyPrice: prices[0] }, { id: 't2', fromDay: 3, toDay: 6, dailyPrice: prices[0] - 5 }, { id: 't3', fromDay: 7, toDay: null, dailyPrice: prices[0] - 10 }] },
    { id: `${id}-s`, sippCode: 'IFAR', tiers: [{ id: 't1', fromDay: 1, toDay: 2, dailyPrice: prices[1] }, { id: 't2', fromDay: 3, toDay: 6, dailyPrice: prices[1] - 8 }, { id: 't3', fromDay: 7, toDay: null, dailyPrice: prices[1] - 15 }] }] });
  const plans = [plan('p1', day(-10), day(120), [40, 70]), plan('p2', day(121), day(300), [48, 82])];
  const rules = {
    freeCancellationHours: 48, lateCancellationFeePercent: 100, minLeadHours: 2, minDriverAge: 21, maxRentalDays: 60, graceMinutes: 120, rateLimitPerMinute: 600,
    locations: [{ code: 'AMM', name: 'Amman Airport', type: 'AIRPORT', pickup: true, dropOff: true, openingHours: hours, address: 'Queen Alia International Airport' },
                { code: 'AQJ', name: 'Aqaba City', type: 'CITY', pickup: true, dropOff: true, openingHours: hours, address: 'King Hussein Street, Aqaba' }],
    pricing: { taxPercent: 16, taxIncluded: true, taxName: 'Sales tax', unlimitedMileage: true },
  };
  const channel = (id, name, code, status, env) => ({ id, name, channelCode: code, vendorCode: 'URD', vendorName: 'UR-Drive Jordan', locationCode: 'AMM', currency: 'USD', status, otaProfile: 'standard',
    connectionDetails: { apiUrl: 'https://xml.broker.example/ota', username: 'urdrive', apiKey: '', environment: env, timeoutSeconds: 30 },
    currentRatePlans: plans, ratePlanHistory: [{ id: `${id}-v1`, submittedAt: new Date(Date.now() - 86400000).toISOString(), ratePlans: plans, version: 1, publishedBy: 'Sara Agent', currency: 'USD' }],
    extras: [{ id: 'x-gps', name: 'GPS', price: 5 }, { id: 'x-seat', name: 'Child seat', price: 4 }], termsAndConditions: 'Driver must be 21 or older and hold a licence for at least one year. Free cancellation up to 48 hours before pick-up.',
    bookingRules: rules });
  await patch(tok, [
    { op: 'set', key: 'rentalLocations', value: [{ id: 'l1', name: 'Amman Airport', address: 'Queen Alia International Airport' }, { id: 'l2', name: 'Aqaba City', address: 'King Hussein Street' }] },
    { op: 'set', key: 'fleet', value: [
      ...[1, 2, 3].map(i => ({ id: `e${i}`, modelName: 'Toyota Corolla', licensePlate: `12-3456${i}`, category: 'Economy', sippCode: 'EDAR', transmission: 'Automatic', securityDeposit: 200, excess: 500, registrationExpiry: '2030-01-01' })),
      ...[1, 2].map(i => ({ id: `s${i}`, modelName: 'Kia Sportage', licensePlate: `22-4567${i}`, category: 'SUV', sippCode: 'IFAR', transmission: 'Automatic', securityDeposit: 300, excess: 700, registrationExpiry: '2030-01-01' }))] },
    { op: 'set', key: 'sources', value: [{ id: 'src1', name: 'Website', paymentType: 'Pay on Arrival' }] },
    { op: 'set', key: 'availableExtras', value: [{ id: 'x-gps', name: 'GPS', dailyPrice: 5, maxPerRental: 50 }, { id: 'x-seat', name: 'Child seat', dailyPrice: 4, maxPerRental: 40 }] },
    { op: 'set', key: 'aggregators', value: [channel('agg-sb', 'Sample Broker', 'SBK', 'active', 'production'), channel('agg-tb', 'Travel Partner', 'TRP', 'testing', 'sandbox')] },
    { op: 'set', key: 'stopSales', value: [{ id: 'ss1', name: 'Eid holiday', startDate: day(40), endDate: day(43), sippCodes: ['IFAR'], channelIds: [], reason: 'All SUVs kept for walk-in customers', createdAt: new Date().toISOString() }] },
  ]);
  // A live API key, made on the API keys screen as staff do it.
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await login(page);
  let key;
  try {
  await page.locator('aside nav').getByText('OTA XML', { exact: true }).last().click();
  await page.getByRole('button', { name: /^API keys/ }).first().click();
  await page.getByRole('row').filter({ hasText: 'Sample Broker' }).getByRole('button', { name: 'Create', exact: true }).first().click();
  await page.getByText(/urd_[A-Za-z0-9_-]{20,}/).first().waitFor();
  key = /urd_[A-Za-z0-9_-]{20,}/.exec(await page.locator('body').innerText())[0];
  await page.getByRole('button', { name: 'I have copied it' }).click();
  } catch (e) { await page.screenshot({ path: path.join(OUT, 'fail-seed.png') }); throw e; }
  await sleep(3000);
  await ctx.close();
  // Broker traffic: searches, bookings over XML and SOAP, a change, a cancellation and one mistake.
  const send = async (p, body, type = 'application/xml') => (await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': type, 'X-Api-Key': key }, body })).text();
  const search = (n, d) => `<OTA_VehAvailRateRQ xmlns="${OTA}" Version="2.000" EchoToken="S${n}"><POS><Source><RequestorID Type="22" ID="SBK"/></Source></POS><VehAvailRQCore>
    <VehRentalCore PickUpDateTime="${at(n)}" ReturnDateTime="${at(n + d)}"><PickUpLocation LocationCode="AMM"/><ReturnLocation LocationCode="AMM"/></VehRentalCore>
    <DriverType Age="35"/></VehAvailRQCore></OTA_VehAvailRateRQ>`;
  const book = (offer, ref, first, last) => `<OTA_VehResRQ xmlns="${OTA}" Version="2.000"><VehResRQCore><Customer><Primary BirthDate="1988-04-12"><PersonName><GivenName>${first}</GivenName><Surname>${last}</Surname></PersonName>
    <Email>${first.toLowerCase()}.${last.toLowerCase()}@example.com</Email></Primary></Customer></VehResRQCore><VehResRQInfo><Reference Type="16" ID="${offer}"/><TPA_Extensions><BrokerReference>${ref}</BrokerReference></TPA_Extensions></VehResRQInfo></OTA_VehResRQ>`;
  const people = [['John', 'Doe'], ['Jane', 'Roe'], ['Sam', 'Smith'], ['Maria', 'Garcia']];
  const confs = [];
  for (let i = 0; i < people.length; i++) {
    const rs = await send('/ota/2024A/SBK/OTA_VehAvailRate', search(10 + i * 6, 3 + i));
    const offer = (/Type="16" ID="(OFF-[^"]+)"/.exec(rs) || [])[1];
    const xml = book(offer, `SBK-${1001 + i}`, ...people[i]);
    const res = i % 2 ? await send('/ota/v1/SBK/soap', `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${xml}</soap:Body></soap:Envelope>`, 'text/xml')
                      : await send('/ota/2024A/SBK/OTA_VehRes', xml);
    confs.push((/ID="(RSV-[^"]+)"/.exec(res) || [])[1]);
  }
  await send('/ota/2024A/SBK/OTA_VehModify', `<OTA_VehModifyRQ xmlns="${OTA}" Version="2.000"><VehModifyRQCore ModifyType="Modify"><UniqueID Type="14" ID="${confs[0]}"/>
    <VehRentalCore PickUpDateTime="${at(10)}" ReturnDateTime="${at(15)}"/></VehModifyRQCore></OTA_VehModifyRQ>`);
  await send('/ota/2024A/SBK/OTA_VehCancel', `<OTA_VehCancelRQ xmlns="${OTA}" Version="2.000"><VehCancelRQCore CancelType="Cancel"><UniqueID Type="14" ID="${confs[3]}"/>
    <PersonName><Surname>Garcia</Surname></PersonName></VehCancelRQCore></OTA_VehCancelRQ>`);
  await send('/ota/2024A/SBK/OTA_VehLocDetail', `<OTA_VehLocDetailRQ xmlns="${OTA}"><Location LocationCode="ZZZ"/></OTA_VehLocDetailRQ>`);
  for (let i = 0; i < 6; i++) await send('/ota/2024A/SBK/OTA_VehAvailRate', search(20 + i, 2));
  return key;
}

// ---------------------------------------------------------------- recording helpers
async function login(page) {
  for (let i = 0; i < 3; i++) {
    await page.goto(BASE + '/');
    await page.locator('#username-input').waitFor();
    await sleep(1500);
    await page.locator('#username-input').fill(ADMIN);
    await page.locator('#password-input').fill(PASSWORD);
    await page.locator('button[type=submit]').click();
    if (await page.locator('aside').waitFor({ timeout: 15000 }).then(() => true, () => false)) { await sleep(1500); return; }
  }
  throw new Error('could not sign in');
}
const FONT = "'Inter','Segoe UI',system-ui,sans-serif";
const OVERLAY_CSS = `
#guide-cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:1060px;width:calc(100% - 110px);
  background:rgba(15,23,42,.95);color:#fff;border-radius:14px;padding:14px 22px 15px;font:500 19px/1.45 ${FONT};
  box-shadow:0 10px 40px rgba(0,0,0,.35);display:flex;gap:16px;align-items:flex-start;pointer-events:none}
#guide-cap b{flex:none;min-width:44px;height:30px;padding:0 8px;border-radius:8px;background:#4f46e5;color:#fff;font:700 14px/30px ${FONT};text-align:center}
#guide-cap small{display:block;color:#cbd5e1;font-size:15.5px;font-weight:400;margin-top:3px}
#guide-hl{position:fixed;z-index:2147483646;border:3px solid #f59e0b;border-radius:10px;box-shadow:0 0 0 9999px rgba(15,23,42,.28);pointer-events:none;transition:all .35s ease}
.guide-card{position:fixed;inset:0;z-index:2147483647;background:radial-gradient(900px 400px at 85% 0%,rgba(99,102,241,.35),transparent 60%),linear-gradient(135deg,#1e1b4b,#0f172a 65%);color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 110px;font-family:${FONT}}
.guide-card p{margin:0;color:#a5b4fc;font:700 15px/1 ${FONT};letter-spacing:.18em;text-transform:uppercase}
.guide-card h1{margin:18px 0 14px;font:700 50px/1.1 ${FONT};letter-spacing:-.02em}
.guide-card div{color:#cbd5e1;font:400 21px/1.5 ${FONT};max-width:920px}
.guide-card ol{margin:22px 0 0;padding:0;list-style:none;display:grid;gap:8px;color:#e2e8f0;font:500 18px/1.4 ${FONT}}
.guide-card ol li::before{content:"›";color:#818cf8;margin-right:10px}
#guide-cursor{position:fixed;left:0;top:0;z-index:2147483647;width:26px;height:26px;pointer-events:none;transform:translate(-3px,-2px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
.guide-ripple{position:fixed;z-index:2147483646;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #f59e0b;pointer-events:none;animation:guide-ripple .6s ease-out forwards}
@keyframes guide-ripple{to{transform:scale(3.6);opacity:0}}`;
// A visible pointer that follows the mouse and shows each click (videos have no system pointer).
const CURSOR_SCRIPT = `(() => {
  const add = () => {
    if (document.getElementById('guide-cursor') || !document.body) return;
    const c = document.createElement('div'); c.id = 'guide-cursor';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5l15.5 9.2-6.8 1.5 3.9 7.2-3 1.6-3.9-7.3-5.7 4.6z" fill="#fff" stroke="#0f172a" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.left = (window.__gx || -100) + 'px'; c.style.top = (window.__gy || -100) + 'px';
    document.body.appendChild(c);
  };
  document.addEventListener('mousemove', e => { window.__gx = e.clientX; window.__gy = e.clientY; add(); const c = document.getElementById('guide-cursor'); if (c) { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; } }, true);
  document.addEventListener('mousedown', e => { const r = document.createElement('div'); r.className = 'guide-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  if (document.readyState !== 'loading') add(); else document.addEventListener('DOMContentLoaded', add);
})();`;
async function overlay(page) {
  await page.evaluate(css => { if (!document.getElementById('guide-css')) { const s = document.createElement('style'); s.id = 'guide-css'; s.textContent = css; document.head.appendChild(s); } }, OVERLAY_CSS);
}
async function card(page, kicker, heading, text, list, ms) {
  await overlay(page);
  await page.evaluate(([k, h, t, l]) => {
    const d = document.createElement('div'); d.className = 'guide-card'; d.id = 'guide-card';
    d.innerHTML = '<p></p><h1></h1><div></div>';
    d.querySelector('p').textContent = k; d.querySelector('h1').textContent = h; d.querySelector('div').textContent = t;
    if (l && l.length) { const ol = document.createElement('ol'); l.forEach(x => { const li = document.createElement('li'); li.textContent = x; ol.appendChild(li); }); d.appendChild(ol); }
    document.body.appendChild(d);
  }, [kicker, heading, text, list || []]);
  await sleep(ms);
  await page.evaluate(() => document.getElementById('guide-card')?.remove());
}
let CH = 0, STEP = 0;
async function boxOf(page, target) {
  const locs = (Array.isArray(target) ? target : [target]).map(t => typeof t === 'string' ? page.getByText(t, { exact: true }).first() : t);
  try {
    await locs[0].waitFor({ timeout: 3000 });
    const vis = await locs[0].evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 70 && r.bottom <= window.innerHeight - 150; });
    if (!vis) { await locs[0].evaluate(el => el.scrollIntoView({ block: 'center' })); await sleep(350); }
    const boxes = (await Promise.all(locs.map(l => l.boundingBox()))).filter(Boolean);
    if (!boxes.length) return null;
    const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
    return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
  } catch { return null; }
}
/** Shows the next step's caption (and a highlight round `target`), long enough to read it. */
async function say(page, text, sub, target, ms) {
  await overlay(page);
  STEP++;
  const box = target ? await boxOf(page, target) : null;
  await page.evaluate(([step, text, sub, box]) => {
    let c = document.getElementById('guide-cap');
    if (!c) { c = document.createElement('div'); c.id = 'guide-cap'; document.body.appendChild(c); }
    c.innerHTML = '<b></b><span></span>';
    c.querySelector('b').textContent = step;
    c.querySelector('span').textContent = text;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; c.querySelector('span').appendChild(s); }
    let h = document.getElementById('guide-hl');
    if (box) {
      if (!h) { h = document.createElement('div'); h.id = 'guide-hl'; document.body.appendChild(h); }
      Object.assign(h.style, { left: `${box.x - 6}px`, top: `${box.y - 6}px`, width: `${box.width + 12}px`, height: `${box.height + 12}px` });
    } else if (h) h.remove();
  }, [`${CH}.${STEP}`, text, sub || '', box]);
  const words = (text + ' ' + (sub || '')).split(/\s+/).length;
  await sleep(ms || Math.max(4000, words * 340));
}
async function clear(page) { await page.evaluate(() => { document.getElementById('guide-cap')?.remove(); document.getElementById('guide-hl')?.remove(); }); }
/** Moves the visible pointer to an element and clicks it, like a person would. */
async function click(page, target) {
  const loc = typeof target === 'string' ? page.getByText(target, { exact: true }).first() : target;
  await loc.waitFor({ timeout: 10000 });
  await loc.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await sleep(300);
  await page.evaluate(() => document.getElementById('guide-hl')?.remove());
  const b = await loc.boundingBox();
  if (!b) { await loc.click(); return; }
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y, { steps: 22 });
  await sleep(250);
  await page.mouse.click(x, y);
  await sleep(700);
}
async function type(page, loc, text) {
  await click(page, loc);
  await loc.fill('');
  await page.keyboard.type(text, { delay: 55 });
  await sleep(400);
}
async function pointAt(page, loc) {
  const b = await boxOf(page, loc);
  if (b) await page.mouse.move(b.x + Math.min(b.width - 10, 40), b.y + b.height / 2, { steps: 18 });
}
const nav = page => page.locator('aside nav');
async function openOta(page) {
  await click(page, nav(page).getByText('OTA XML', { exact: true }).last());
  await sleep(900);
}
async function module(page, name) {
  await click(page, page.getByRole('button', { name: new RegExp('^' + name) }).first());
  await sleep(900);
}
const TAB_LABEL = { 'Publish History': 'Publish history', 'XML Feed': 'XML feed', 'Terms & Conditions': 'Terms' };
async function channelTab(page, broker, tab) {
  if (!(await page.getByRole('heading', { name: broker }).first().isVisible().catch(() => false))) {
    await module(page, 'Channels');
    await click(page, page.getByText(broker, { exact: true }).first());
    await sleep(700);
  }
  const label = TAB_LABEL[tab] || tab;
  await click(page, page.getByRole('button', { name: new RegExp('^' + label.replace(/[&]/g, '.')) }).first());
  await sleep(900);
  await page.evaluate(() => window.scrollTo(0, 0));
}
const btn = (page, name) => page.getByRole('button', { name: new RegExp('^' + name) }).first();
async function consoleSend(page, template) {
  await click(page, page.getByRole('navigation', { name: 'Message templates' }).getByRole('button', { name: new RegExp(template.replace(/[()&]/g, '.')) }).first());
  await sleep(600);
  await click(page, page.getByRole('button', { name: /^Send/ }).first());
  const status = page.getByText(/HTTP \d{3}/).first();
  await status.waitFor({ timeout: 15000 });
  await sleep(500);
  // The answer is what matters: bring it to the top of the screen.
  await status.evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); });
  await sleep(700);
  const b = await status.boundingBox();
  if (b) await page.mouse.move(b.x + 20, b.y + 140, { steps: 15 });
  await sleep(400);
}

// ---------------------------------------------------------------- the chapters
const CHAPTERS = [
  { id: '01-overview', title: 'The Channel Manager', text: 'Where you connect car-rental brokers, publish your prices to them and receive their bookings.',
    list: ['What OTA XML is', 'The status bar', 'The console menu', 'Channels: one per broker'], run: async page => {
    await openOta(page);
    await say(page, 'OTA XML is where you work with brokers: websites such as Rentalcars or DiscoverCars that sell your cars.', 'They connect to this system over OTA XML, the standard language of the travel industry.');
    await say(page, 'The status bar shows the health of every connection at a glance.', 'Broker updates, live channels, unpublished changes, blocking errors, stop sales and the last publish.',
      [page.locator('header').getByText('Broker updates', { exact: true }), page.locator('header').getByText('Last publish', { exact: true }).locator('xpath=..')]);
    await say(page, 'The menu opens the console pages: channels, dashboard, XML reservations, rate rules, API keys, bulk editor, stop sales, developer and this video guide.', null, page.getByRole('button', { name: /^Channels/ }).first().locator('xpath=..'));
    await say(page, 'Each broker is a channel. Pick one on the left to open its own pages.', 'Sample Broker is live; Travel Partner is still being tested.', page.locator('aside').filter({ hasText: 'Channels' }).first());
    await click(page, page.getByText('Travel Partner', { exact: true }).first());
    await say(page, 'A channel’s pages are grouped by job: Overview, Pricing, Connection, Operations and Publishing.', 'The next chapters go through each of them in order.', page.locator('aside').getByText('Publishing', { exact: true }).first().locator('xpath=ancestor::section[1]'));
    await pointAt(page, page.getByText('Jump to…').first());
    await say(page, '“Jump to…” (Ctrl K) finds any channel or page by typing its name.', null, page.getByText('Jump to…').first());
  } },
  { id: '02-new-broker', title: 'Connecting a new broker, step by step', text: 'From “Add channel” to a broker that is ready to go live, done live in the system.',
    list: ['Add the channel (copy the setup of an existing broker)', 'Check the setup steps', 'Review and publish the rates', 'Choose the XML layout', 'Create the API key', 'Run the certification test', 'Approve go-live'], run: async page => {
    await openOta(page);
    await say(page, 'Click “Add channel” to connect a new broker.', null, btn(page, 'Add channel'));
    await click(page, btn(page, 'Add channel'));
    const dlg = page.getByRole('dialog');
    await type(page, dlg.getByPlaceholder('Channel name, e.g. Rentalcars'), 'Gulf Cars Online');
    await say(page, 'Type the broker’s name. To save time, copy the setup of a broker you already have.', 'Branches, booking rules, extras, terms and the rates are copied. Keys and contacts never are.', dlg.getByLabel('Copy setup from'));
    await click(page, dlg.getByLabel('Copy setup from'));
    await dlg.getByLabel('Copy setup from').selectOption({ label: 'Sample Broker (SBK)' });
    await sleep(600);
    await type(page, dlg.getByPlaceholder(/Code \(optional\)/), 'GCO');
    await say(page, 'The channel code is the short name in the broker’s addresses, for example /ota/2024A/GCO/…', null, dlg.getByPlaceholder(/Code \(optional\)/));
    await click(page, dlg.getByRole('button', { name: 'Create' }));
    await sleep(1500);
    await channelTab(page, 'Gulf Cars Online', 'Overview');
    await say(page, 'The new broker starts in Testing: its bookings are sandbox bookings and never hold a car.', 'Overview lists every setup step in order, with a link to the page where it is done.');
    await channelTab(page, 'Gulf Cars Online', 'Rates');
    await say(page, 'Rates were copied as a draft. Check the prices for this broker, then publish them.', null, btn(page, 'Review & publish'));
    await click(page, btn(page, 'Review & publish'));
    await say(page, 'The publish window shows what changes. Publishing sends the prices to the broker as a new version.', null, page.getByRole('dialog').last());
    await click(page, page.getByRole('dialog').last().getByRole('button', { name: /^Publish version/ }));
    await sleep(1500);
    await channelTab(page, 'Gulf Cars Online', 'Connection');
    await say(page, 'Connection: new brokers use the “OpenTravel standard” layout, checked against the official OpenTravel rules.', 'Fill in the broker’s contacts and note the OpenTravel version they use.', page.getByText('OpenTravel XML layout').first().locator('xpath=ancestor::section[1]'));
    await module(page, 'API keys');
    const row = page.getByRole('row').filter({ hasText: 'Gulf Cars Online' });
    await say(page, 'Create the broker’s live key on the API keys page.', null, row);
    await click(page, row.getByRole('button', { name: 'Create', exact: true }).first());
    await page.getByText(/urd_[A-Za-z0-9_-]{20,}/).first().waitFor();
    await say(page, 'The key is shown only once, with a ready message for the broker. Send it securely, never in the same email as the documentation.', 'Only a fingerprint is stored: nobody can read the key back later.', page.getByRole('dialog').last());
    await click(page, page.getByRole('button', { name: 'I have copied it' }));
    await sleep(1000);
    await channelTab(page, 'Gulf Cars Online', 'Go-live');
    await say(page, 'Go-live: the certification test sends every broker message to the channel in the sandbox.', null, btn(page, 'Run certification'));
    await click(page, btn(page, 'Run certification'));
    await page.getByText(/\d+ \/ \d+ passed/).first().waitFor({ timeout: 60000 });
    await sleep(800);
    await say(page, 'Each test shows its result. When the broker has tested too and the required items are done, “Approve go-live” switches the broker to real bookings.', null, page.getByText(/\d+ \/ \d+ passed/).first().locator('xpath=ancestor::section[1]'));
  } },
  { id: '03-rates-publishing', title: 'Rates and publishing', text: 'The prices a broker is quoted, how they are published and what the broker receives.',
    list: ['Rates by season, car group and rental length', 'Publish history and roll-back', 'The XML feed the broker receives'], run: async page => {
    await openOta(page);
    await channelTab(page, 'Sample Broker', 'Rates');
    await say(page, 'Rates: the price per day for each car group, by season and by rental length.', 'Example: Economy (EDAR) 40 USD a day for 1–2 days, 35 for 3–6 days, 30 from 7 days.');
    await page.mouse.wheel(0, 450); await sleep(900);
    await say(page, '“Add period” adds a season; “Excel” downloads the grid to edit and upload again.', 'Changes stay a draft until you click “Review & publish”.', [btn(page, 'Excel'), btn(page, 'Add period')]);
    await channelTab(page, 'Sample Broker', 'Publish History');
    await say(page, 'Publish history: every published version, who published it and when.', 'A wrong change can be rolled back to an earlier version in one step.');
    await channelTab(page, 'Sample Broker', 'XML Feed');
    await say(page, 'XML feed: the rate sheet exactly as the broker receives it, ready to copy or download.', 'Useful when a broker asks “which prices did you send us?”.');
  } },
  { id: '04-pricing-rules', title: 'Price rules, rate rules, extras and terms', text: 'Commercial terms per broker, dynamic pricing for seasons and last-minute, extras and rental terms.',
    list: ['Price rules: one broker’s own terms', 'Rate rules: seasons, events, last-minute', 'Extras', 'Terms'], run: async page => {
    await openOta(page);
    await channelTab(page, 'Sample Broker', 'Price rules');
    await say(page, 'Price rules: this broker’s own commercial terms.', 'Markup or discount, prices by day of the week, early-booking and last-minute changes, minimum days and closed dates.');
    await page.mouse.wheel(0, 500); await sleep(900);
    await say(page, 'Every rule shows an example price, so you see its effect before you save.');
    await module(page, 'Rate rules');
    await say(page, 'Rate rules (top menu): seasons, holidays and events, and last-minute pricing for the brokers you choose.', 'Prices are calculated day by day.');
    for (const [t, msg] of [['Seasons', 'Seasons & events: Eid, Ramadan, Christmas or your own dates, each raising or lowering the price.'], ['Last minute', 'Last minute: prices that change with how soon the rental starts.'], ['Try a price', 'Try a price: shows the final price of any rental, step by step, before it reaches a broker.']]) {
      const b = page.getByRole('button', { name: new RegExp('^' + t) }).first();
      if (await b.count()) { await click(page, b); await say(page, msg); }
    }
    await channelTab(page, 'Sample Broker', 'Extras');
    await say(page, 'Extras: what this broker may sell with a car, such as GPS, a child seat or an extra driver, and at what price.');
    await channelTab(page, 'Sample Broker', 'Terms & Conditions');
    await say(page, 'Terms: the rental conditions sent with every quote and booking, in English and Arabic.');
  } },
  { id: '05-connection-keys', title: 'Connection, API keys and the XML layout', text: 'How a broker reaches you, the keys they use and the OpenTravel layout of your answers.',
    list: ['Connection addresses', 'OpenTravel layout and schema check', 'Agreed OpenTravel and SOAP version', 'API keys: live, test, replace, revoke'], run: async page => {
    await openOta(page);
    await channelTab(page, 'Sample Broker', 'Connection');
    await say(page, 'Connection: the broker’s contacts and the addresses they send their messages to.', 'One address per message type, for XML, SOAP and the newer 2018A and 2024A versions.');
    await say(page, 'OpenTravel XML layout: “OpenTravel standard” answers exactly as the official OpenTravel rules require.', '“As connected” keeps the layout an existing broker was built against, until they confirm they read the standard one.', page.getByText('OpenTravel XML layout').first().locator('xpath=ancestor::section[1]'));
    await say(page, 'Schema check: every message is checked against the official OpenTravel rules. “Report only” shows problems in Traffic; “Strict” refuses invalid messages.', null, page.getByText('Schema check of broker requests').first().locator('xpath=..'));
    await say(page, 'Record the OpenTravel version and SOAP version you agreed with the broker.', 'Traffic shows what they really send, so you can compare.', [page.getByLabel('OpenTravel release'), page.getByLabel('SOAP version')]);
    await module(page, 'API keys');
    await say(page, 'API keys: one secret key per broker. A live key for real bookings and an optional test key that only makes sandbox bookings.', 'A key is shown once when it is made; only a fingerprint is stored.');
    await say(page, '“Replace” makes a new key if a key may be known to someone else; “Revoke” stops it at once.', null, page.getByRole('row').filter({ hasText: 'Sample Broker' }).first());
  } },
  { id: '06-advanced-connection', title: 'Booking API, languages, security, API v3 and outbound', text: 'Booking rules and branches, Arabic texts, who is calling, REST v3 with OAuth and what we send to the broker.',
    list: ['Booking API: branches and booking rules', 'Languages', 'Security', 'API v3 (REST/JSON, OAuth)', 'Outbound connectors'], run: async page => {
    await openOta(page);
    await channelTab(page, 'Sample Broker', 'Booking API');
    await say(page, 'Booking API: the branches this broker may use, their opening hours and holidays, and the booking rules.', 'Minimum driver age, how far ahead, the longest rental, fees, cancellation and no-shows.');
    await page.mouse.wheel(0, 600); await sleep(900);
    await say(page, 'When you change or cancel a broker booking, the broker is told automatically. Failed updates are retried and shown in red at the top.');
    await channelTab(page, 'Sample Broker', 'Languages');
    await say(page, 'Languages: Arabic names and texts for brokers that ask in Arabic.');
    await channelTab(page, 'Sample Broker', 'Security');
    await say(page, 'Security: every address that called with this broker’s code, failed sign-ins, and addresses locked after too many wrong keys.', 'You can also limit the broker to its own IP addresses and require signed requests.');
    await channelTab(page, 'Sample Broker', 'API v3');
    await say(page, 'API v3: for brokers that prefer REST/JSON. Each gets an OAuth client with exactly the permissions it needs, and webhook notifications.');
    await channelTab(page, 'Sample Broker', 'Outbound');
    await say(page, 'Outbound: for brokers that want us to send to them — rate files, availability updates and booking notifications to their own system.');
  } },
  { id: '07-booking-over-xml', title: 'A booking over XML, step by step', text: 'What a broker sends and what we answer, message by message, in the test console (sandbox: nothing real is booked).',
    list: ['Ping: is the connection alive?', 'Availability & rates: the search', 'Book: the reservation', 'Retrieve', 'Modify', 'Cancel'], run: async page => {
    await openOta(page);
    await channelTab(page, 'Sample Broker', 'Test console');
    await say(page, 'The test console sends real broker messages to this channel, in the sandbox: nothing is booked for real.', 'Pick a message on the left, then click Send.', page.getByRole('navigation', { name: 'Message templates' }));
    await consoleSend(page, 'Ping');
    await say(page, 'Ping: the broker checks the connection. The answer says Success and repeats their text.', null);
    await consoleSend(page, 'Availability');
    await say(page, 'Availability & rates: the broker’s search — branch, dates and driver age.', 'Our answer lists each car group with its price, extras, the cancellation terms and an offer number.');
    await consoleSend(page, 'Book');
    await say(page, 'Book: the broker books an offer. Our answer confirms it with our reservation number (RSV-…).', 'Sending the same broker reference again returns the same booking, never a second one.');
    await consoleSend(page, 'Retrieve');
    await say(page, 'Retrieve: the broker reads the booking back with our reservation number.');
    await consoleSend(page, 'Modify');
    await say(page, 'Modify: the broker changes the dates. The price is worked out again and the car is checked as still free.');
    await consoleSend(page, 'Cancel');
    await say(page, 'Cancel: the booking is cancelled under your cancellation terms and the car is free again.');
    await say(page, '“Run full booking flow” runs all of these in one click — the quickest check after any change.', null, btn(page, 'Run full booking flow'));
  } },
  { id: '08-daily-work', title: 'Daily work: bookings and traffic', text: 'Where broker bookings arrive and how to read every message they send.',
    list: ['XML reservations', 'A broker’s bookings and statement', 'Traffic: every message and answer', 'What the broker sends and the Schema label'], run: async page => {
    await openOta(page);
    await module(page, 'XML reservations');
    await say(page, 'XML reservations: every booking received from the brokers, kept apart from your own Reservations screen.', 'Upcoming, on rent, completed and cancelled, with the broker’s own reference.');
    await say(page, 'Search by reservation number, broker reference or customer; switch between live and sandbox bookings.', null, page.getByPlaceholder(/Search reservation/).first());
    await channelTab(page, 'Sample Broker', 'Bookings');
    await say(page, 'A channel’s Bookings page shows only that broker’s bookings, with a monthly statement for invoicing.');
    await channelTab(page, 'Sample Broker', 'Traffic');
    await say(page, 'Traffic: every message the broker sent and every answer, with the time taken. Keys and card numbers are hidden.', 'Calls, error rate, response time and look-to-book (searches per booking).');
    await say(page, '“What the broker sends” shows the version address, SOAP version and message version they really use.', null, page.getByTestId('broker-protocols'));
    const log = page.getByText('Message log').first().locator('xpath=ancestor::section[1]');
    await say(page, 'An amber “Schema” label means the message misses something the official OpenTravel rules require. The broker still got an answer: tell them what to fix.', 'Click a line to see the full request and answer.', log);
    await click(page, log.locator('tbody tr').first());
    await sleep(1200);
    await say(page, 'Each message opens with its full request and answer, and any schema problems listed at the top.');
    await page.keyboard.press('Escape');
  } },
  { id: '09-dashboard-bulk-stops', title: 'Dashboard, bulk editor and stop sales', text: 'Figures across every broker, changing many brokers at once, and closing cars for some dates.',
    list: ['Dashboard', 'Bulk editor', 'Stop sales'], run: async page => {
    await openOta(page);
    await module(page, 'Dashboard');
    await say(page, 'Dashboard: requests, bookings, revenue, errors and alerts across every broker, for the period you choose.');
    await page.mouse.wheel(0, 500); await sleep(900);
    await say(page, 'Per-broker figures show who sells most and who has problems; click a broker to open it.');
    await module(page, 'Bulk editor');
    await say(page, 'Bulk editor: change rates, extras, terms and policies for several brokers at once, with a preview before anything is saved.');
    await module(page, 'Stop sales');
    await say(page, 'Stop sales: close a car or a car group for some dates, for every broker or only chosen ones.', 'Example: all SUVs closed over the Eid holiday for walk-in customers. Brokers stop seeing them at once.');
  } },
  { id: '10-developer', title: 'Developer page and broker documentation', text: 'What brokers read to connect, and the technical details for their developers.',
    list: ['Developer page', 'The public developer portal', 'Sample answers, limits and sandbox checklist'], run: async page => {
    await openOta(page);
    await module(page, 'Developer');
    await say(page, 'Developer: the technical details for a broker’s developers — addresses, message types, error codes and examples.');
    await page.goto(BASE + '/ota/developers'); await sleep(1800);
    await say(page, 'The developer portal is the public page you send to brokers. It shows only “UR-Drive Jordan”, never any keys.', 'Authentication, sandbox and production, a quick start, every message and error, and webhooks.');
    await page.goto(BASE + '/ota/developers#xml-answers'); await sleep(1500);
    await say(page, 'Sample answers are taken from the real system and checked against the official OpenTravel rules, so the documentation always matches what brokers receive.');
    await page.goto(BASE + '/ota/developers#certification'); await sleep(1200);
    await say(page, 'The sandbox checklist tells a broker exactly what to test before going live.');
  } },
];

// ---------------------------------------------------------------- run
(async () => {
  const server = spawn('java', ['-jar', JAR, '--spring.profiles.active=e2e', `--server.port=${PORT}`, '--spring.datasource.url=jdbc:h2:mem:guide;DB_CLOSE_DELAY=-1'],
    { env: { ...process.env, JWT_SECRET: 'g'.repeat(64), E2E_PASSWORD: PASSWORD }, stdio: 'ignore' });
  const browser = await chromium.launch();
  try {
    await waitUp();
    await seed(browser);
    for (let i = 0; i < CHAPTERS.length; i++) {
      const ch = CHAPTERS[i];
      if (ONLY.length && !ONLY.includes(ch.id)) continue;
      const raw = path.join(OUT, 'raw', ch.id);
      fs.rmSync(raw, { recursive: true, force: true });
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: raw, size: { width: W, height: H } }, reducedMotion: 'reduce' });
      await ctx.addInitScript(CURSOR_SCRIPT);
      const page = await ctx.newPage();
      page.on('dialog', d => d.dismiss());
      const t0 = Date.now();
      await login(page);
      const skip = (Date.now() - t0) / 1000;
      CH = i + 1; STEP = 0;
      await card(page, `OTA XML video guide · Chapter ${i + 1} of ${CHAPTERS.length}`, ch.title, ch.text, ch.list, 6500);
      try { await ch.run(page); } catch (e) { await page.screenshot({ path: path.join(OUT, `fail-${ch.id}.png`) }); throw e; }
      await clear(page);
      const nxt = CHAPTERS[i + 1];
      await card(page, nxt ? 'Next chapter' : 'End of the guide', nxt ? nxt.title : 'You have seen every part of OTA XML', nxt ? nxt.text : 'Open any chapter again from OTA XML → Video guide.', null, 3500);
      const video = page.video();
      await ctx.close();
      const src = await video.path();
      const mp4 = path.join(OUT, `${ch.id}.mp4`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', skip.toFixed(2), '-i', src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(probe(mp4) * 0.45), '-i', mp4, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', path.join(OUT, `${ch.id}.jpg`)]);
      fs.rmSync(raw, { recursive: true, force: true });
      const s = Math.round(probe(mp4));
      console.log(`${ch.id}  length '${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}'  ${(fs.statSync(mp4).size / 1024 / 1024).toFixed(1)} MB`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
