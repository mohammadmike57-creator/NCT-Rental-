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
const W = 1920, H = 1080;
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
#guide-cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:2147483647;width:min(1400px,calc(100% - 160px));
  background:rgba(15,23,42,.96);color:#fff;border-radius:18px;padding:20px 28px 0;font-family:${FONT};
  box-shadow:0 18px 60px rgba(2,6,23,.45);pointer-events:none;overflow:hidden;animation:guide-up .35s ease-out}
#guide-cap .row{display:flex;gap:22px;align-items:flex-start;padding-bottom:18px}
#guide-cap .num{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:86px;height:58px;border-radius:12px;background:#4f46e5;font:700 13px/1.1 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:#c7d2fe}
#guide-cap .num strong{font:700 24px/1 ${FONT};color:#fff;letter-spacing:0;margin-top:3px}
#guide-cap h3{margin:2px 0 0;font:650 27px/1.3 ${FONT};letter-spacing:-.01em}
#guide-cap p{margin:6px 0 0;color:#cbd5e1;font:400 21px/1.45 ${FONT}}
#guide-cap .bar{height:5px;background:rgba(255,255,255,.12);margin:0 -28px}
#guide-cap .bar i{display:block;height:100%;background:linear-gradient(90deg,#818cf8,#22d3ee)}
@keyframes guide-up{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}
#guide-chip{position:fixed;left:28px;top:24px;z-index:2147483646;display:flex;align-items:center;gap:12px;padding:10px 18px 10px 12px;border-radius:999px;
  background:rgba(15,23,42,.9);color:#fff;font:600 17px/1 ${FONT};box-shadow:0 8px 30px rgba(2,6,23,.3);pointer-events:none}
#guide-chip b{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:#4f46e5;font-size:15px}
#guide-chip span{color:#a5b4fc;font-weight:500}
#guide-hl{position:fixed;z-index:2147483645;border:4px solid #f59e0b;border-radius:14px;box-shadow:0 0 0 9999px rgba(15,23,42,.30),0 0 0 8px rgba(245,158,11,.25);pointer-events:none;transition:all .45s cubic-bezier(.4,0,.2,1)}
.guide-card{position:fixed;inset:0;z-index:2147483647;background:radial-gradient(1300px 600px at 85% -10%,rgba(99,102,241,.38),transparent 60%),radial-gradient(900px 500px at -10% 120%,rgba(34,211,238,.16),transparent 60%),linear-gradient(135deg,#1e1b4b,#0f172a 62%);
  color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 160px;font-family:${FONT};animation:guide-fade .45s ease-out}
@keyframes guide-fade{from{opacity:0}to{opacity:1}}
.guide-card .k{margin:0;color:#a5b4fc;font:700 20px/1 ${FONT};letter-spacing:.2em;text-transform:uppercase}
.guide-card h1{margin:26px 0 18px;font:750 72px/1.08 ${FONT};letter-spacing:-.025em;max-width:1400px}
.guide-card .t{color:#cbd5e1;font:400 30px/1.5 ${FONT};max-width:1300px}
.guide-card ol{margin:40px 0 0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,560px));gap:14px 60px;counter-reset:g}
.guide-card ol li{counter-increment:g;display:flex;gap:16px;align-items:baseline;color:#e2e8f0;font:500 25px/1.35 ${FONT}}
.guide-card ol li::before{content:counter(g);flex:none;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;background:rgba(129,140,248,.2);color:#c7d2fe;font:700 18px/1 ${FONT}}
.guide-card .brand{position:absolute;left:160px;bottom:64px;color:#94a3b8;font:500 19px/1 ${FONT};letter-spacing:.04em}
.guide-flow{display:flex;align-items:center;gap:0;margin-top:56px}
.guide-flow .node{flex:none;width:300px;padding:26px 24px;border-radius:20px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.16);text-align:center}
.guide-flow .node b{display:block;font:700 27px/1.25 ${FONT}}
.guide-flow .node small{display:block;margin-top:8px;color:#94a3b8;font:400 18px/1.35 ${FONT}}
.guide-flow .node.us{background:rgba(79,70,229,.28);border-color:rgba(165,180,252,.55)}
.guide-flow .link{flex:1;min-width:300px;position:relative;height:150px}
.guide-flow .lane{position:absolute;left:24px;right:24px;height:3px;background:rgba(255,255,255,.22)}
.guide-flow .lane.a{top:46px} .guide-flow .lane.b{top:104px}
.guide-flow .lane::after{content:"";position:absolute;top:-7px;width:0;height:0;border:8px solid transparent}
.guide-flow .lane.a::after{right:-6px;border-left:12px solid rgba(255,255,255,.4)} .guide-flow .lane.b::after{left:-6px;border-right:12px solid rgba(255,255,255,.4)}
.guide-flow .msg{position:absolute;left:0;right:0;text-align:center;font:600 19px/1.3 'JetBrains Mono',ui-monospace,monospace}
.guide-flow .msg.a{top:8px;color:#a5b4fc} .guide-flow .msg.b{top:116px;color:#67e8f9}
.guide-flow .dot{position:absolute;width:16px;height:16px;border-radius:50%;margin-top:-7px}
.guide-flow .dot.a{top:47px;background:#818cf8;box-shadow:0 0 18px #818cf8;animation:guide-go 1.6s ease-in-out .4s both}
.guide-flow .dot.b{top:105px;background:#22d3ee;box-shadow:0 0 18px #22d3ee;animation:guide-back 1.6s ease-in-out 2.1s both}
@keyframes guide-go{from{left:24px;opacity:0}10%{opacity:1}to{left:calc(100% - 40px);opacity:1}}
@keyframes guide-back{from{left:calc(100% - 40px);opacity:0}10%{opacity:1}to{left:24px;opacity:1}}
#guide-cursor{position:fixed;left:0;top:0;z-index:2147483647;width:34px;height:34px;pointer-events:none;transform:translate(-4px,-3px);filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}
.guide-ripple{position:fixed;z-index:2147483646;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:4px solid #f59e0b;pointer-events:none;animation:guide-ripple .65s ease-out forwards}
@keyframes guide-ripple{to{transform:scale(3.6);opacity:0}}
#root{transition:transform .9s cubic-bezier(.4,0,.2,1);transform-origin:0 0;will-change:transform}`;
// A visible pointer that follows the mouse and shows each click (videos have no system pointer).
const CURSOR_SCRIPT = `(() => {
  const add = () => {
    if (document.getElementById('guide-cursor') || !document.body) return;
    const c = document.createElement('div'); c.id = 'guide-cursor';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2.5l15.5 9.2-6.8 1.5 3.9 7.2-3 1.6-3.9-7.3-5.7 4.6z" fill="#fff" stroke="#0f172a" stroke-width="1.5" stroke-linejoin="round"/></svg>';
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
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function showCard(page, html, ms) {
  await overlay(page);
  await page.evaluate(h => { const d = document.createElement('div'); d.className = 'guide-card'; d.id = 'guide-card'; d.innerHTML = h; document.body.appendChild(d); }, html);
  await sleep(ms);
  await page.evaluate(() => document.getElementById('guide-card')?.remove());
}
async function card(page, kicker, heading, text, list, ms) {
  await showCard(page, `<p class="k">${esc(kicker)}</p><h1>${esc(heading)}</h1><div class="t">${esc(text)}</div>`
    + (list && list.length ? `<ol>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : '') + '<div class="brand">UR-Drive Jordan · Staff training</div>', ms);
}
/** An explanation card: what happens behind the screen, with an animated message going out and the answer coming back. */
async function explain(page, { kicker = 'What happens now', title, text, from, to, out, back, fromNote, toNote, ms = 9000 }) {
  STEP++;
  cue(title, text);
  const flow = from ? `<div class="guide-flow"><div class="node"><b>${esc(from)}</b><small>${esc(fromNote || '')}</small></div>
    <div class="link"><div class="msg a">${esc(out || '')}</div><div class="lane a"></div><div class="dot a"></div>${back ? `<div class="lane b"></div><div class="dot b"></div><div class="msg b">${esc(back)}</div>` : ''}</div>
    <div class="node us"><b>${esc(to)}</b><small>${esc(toNote || '')}</small></div></div>` : '';
  await showCard(page, `<p class="k">${esc(kicker)} · Step ${STEP} of ${TOTAL}</p><h1>${esc(title)}</h1><div class="t">${esc(text)}</div>${flow}<div class="brand">UR-Drive Jordan · Staff training</div>`, ms);
  endCue();
}
let CH = 0, STEP = 0, TOTAL = 0, ZOOM = 1;
// The steps with their times, saved next to each video so the player can show them as subtitles.
let CUES = [], T0 = 0;
const cue = (title, text) => { const t = (Date.now() - T0) / 1000; if (CUES.length && CUES[CUES.length - 1].end == null) CUES[CUES.length - 1].end = t; CUES.push({ start: t, end: null, step: STEP, total: TOTAL, title, text: text || '' }); };
const endCue = () => { if (CUES.length && CUES[CUES.length - 1].end == null) CUES[CUES.length - 1].end = (Date.now() - T0) / 1000; };
/** Smoothly zooms the whole app into a box (viewport coordinates), so it can be read; 1 zooms back out. */
async function zoomTo(page, box, max = 1.7) {
  let s = 1, tx = 0, ty = 0;
  if (box) {
    s = Math.max(1, Math.min(max, (W * 0.78) / box.width, (H * 0.62) / box.height));
    if (s < 1.12) s = 1;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    tx = Math.min(0, Math.max(W - s * W, W / 2 - s * cx));
    ty = Math.min(0, Math.max(H - s * H, H * 0.42 - s * cy));
  }
  if (s === 1 && ZOOM === 1) return;
  ZOOM = s;
  await page.evaluate(([s, tx, ty]) => { const r = document.getElementById('root'); if (r) r.style.transform = s === 1 ? '' : `translate(${tx}px, ${ty}px) scale(${s})`; }, [s, tx, ty]);
  await sleep(1000);
}
async function boxOf(page, target) {
  const locs = (Array.isArray(target) ? target : [target]).map(t => typeof t === 'string' ? page.getByText(t, { exact: true }).first() : t);
  try {
    await locs[0].waitFor({ timeout: 3000 });
    const vis = await locs[0].evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 90 && r.bottom <= window.innerHeight - 220; });
    if (!vis) { await locs[0].evaluate(el => el.scrollIntoView({ block: 'center' })); await sleep(450); }
    const boxes = (await Promise.all(locs.map(l => l.boundingBox()))).filter(Boolean);
    if (!boxes.length) return null;
    const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
    return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y, inDialog: await locs[0].evaluate(el => !!el.closest('[role=dialog]')) };
  } catch { return null; }
}
/** The next step: zooms into its target, highlights it and shows the caption long enough to read. */
async function say(page, text, sub, target, ms) {
  await overlay(page);
  STEP++;
  let box = target ? await boxOf(page, target) : null;
  if (box && !box.inDialog) { await zoomTo(page, box); box = await boxOf(page, target); } else await zoomTo(page, null);
  await page.evaluate(([step, total, text, sub, box]) => {
    let c = document.getElementById('guide-cap');
    if (c) c.remove();
    c = document.createElement('div'); c.id = 'guide-cap';
    c.innerHTML = '<div class="row"><div class="num">Step<strong></strong></div><div><h3></h3></div></div><div class="bar"><i></i></div>';
    c.querySelector('strong').textContent = `${step} / ${total}`;
    c.querySelector('h3').textContent = text;
    if (sub) { const p = document.createElement('p'); p.textContent = sub; c.querySelector('h3').after(p); }
    c.querySelector('.bar i').style.width = `${Math.round((step / total) * 100)}%`;
    document.body.appendChild(c);
    let h = document.getElementById('guide-hl');
    if (box) {
      if (!h) { h = document.createElement('div'); h.id = 'guide-hl'; document.body.appendChild(h); }
      Object.assign(h.style, { left: `${box.x - 8}px`, top: `${box.y - 8}px`, width: `${box.width + 16}px`, height: `${box.height + 16}px` });
    } else if (h) h.remove();
  }, [STEP, TOTAL, text, sub || '', box]);
  cue(text, sub);
  const words = (text + ' ' + (sub || '')).split(/\s+/).length;
  await sleep(ms || Math.max(4800, words * 360));
}
async function clear(page) { endCue(); await page.evaluate(() => { document.getElementById('guide-cap')?.remove(); document.getElementById('guide-hl')?.remove(); }); }
async function chip(page, label) {
  await overlay(page);
  await page.evaluate(([n, t]) => { document.getElementById('guide-chip')?.remove(); if (!t) return; const c = document.createElement('div'); c.id = 'guide-chip'; c.innerHTML = '<b></b><div></div>'; c.querySelector('b').textContent = n; c.querySelector('div').innerHTML = ''; const s = document.createElement('span'); s.textContent = 'OTA XML guide · '; c.querySelector('div').append(s, t); document.body.appendChild(c); }, [String(CH), label || '']);
}
let PX = W / 2, PY = H / 2;
/** Moves the pointer along an eased path, like a hand would. */
async function moveTo(page, x, y) {
  const n = 30;
  for (let i = 1; i <= n; i++) {
    const t = i / n, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    await page.mouse.move(PX + (x - PX) * e, PY + (y - PY) * e);
    await sleep(14);
  }
  PX = x; PY = y;
}
/** Zooms out, moves the pointer to an element and clicks it. */
async function click(page, target) {
  const loc = typeof target === 'string' ? page.getByText(target, { exact: true }).first() : target;
  await loc.waitFor({ timeout: 10000 });
  await clear(page);
  await zoomTo(page, null);
  await loc.evaluate(el => { const r = el.getBoundingClientRect(); if (r.top < 90 || r.bottom > window.innerHeight - 220) el.scrollIntoView({ block: 'center', inline: 'nearest' }); });
  await sleep(300);
  const b = await loc.boundingBox();
  if (!b) { await loc.click(); return; }
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await moveTo(page, x, y);
  await sleep(220);
  await page.mouse.click(x, y);
  await sleep(750);
}
async function type(page, loc, text) {
  await click(page, loc);
  await loc.fill('');
  await page.keyboard.type(text, { delay: 65 });
  await sleep(450);
}
async function pointAt(page, loc) {
  const b = await boxOf(page, loc);
  if (b) await moveTo(page, b.x + Math.min(b.width - 10, 40), b.y + b.height / 2);
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
/** Sends a message as the broker's own system would (straight to the server, not through the screen). */
async function broker(key, address, body, type = 'application/xml') {
  const r = await fetch(`${BASE}${address}`, { method: 'POST', headers: { 'Content-Type': type, 'X-Api-Key': key }, body });
  return r.text();
}
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
  { id: '00-complete-flow', title: 'The complete flow, explained', text: 'From a new broker to a real booking: what you do on screen, and what happens behind it at every step.',
    list: ['How brokers and OTA XML work', 'Add and set up the broker', 'Publish prices and give the key', 'The broker searches', 'The broker books', 'Changes and cancellation', 'Go-live'], run: async page => {
    await explain(page, { kicker: 'The idea', title: 'Brokers sell your cars on their websites', text: 'A customer searches on a broker’s website. The broker’s system asks our system for cars and prices in OTA XML — the standard language of the travel industry — and books the car the customer chooses. No one types anything: systems talk to systems.',
      from: 'Broker’s system', fromNote: 'Rentalcars, DiscoverCars, a travel agent…', to: 'UR-Drive Jordan', toNote: 'This system: cars, prices, bookings', out: 'search · book · change · cancel', back: 'cars, prices, confirmations', ms: 12000 });
    await openOta(page);
    await say(page, 'Everything about brokers is here, in OTA XML.', 'Each broker is a channel with its own prices, rules and key. Let us connect a new one from start to finish.');
    await click(page, btn(page, 'Add channel'));
    const dlg = page.getByRole('dialog');
    await type(page, dlg.getByPlaceholder('Channel name, e.g. Rentalcars'), 'Desert Drive Travel');
    await click(page, dlg.getByLabel('Copy setup from'));
    await dlg.getByLabel('Copy setup from').selectOption({ label: 'Sample Broker (SBK)' });
    await type(page, dlg.getByPlaceholder(/Code \(optional\)/), 'DDT');
    await say(page, 'Name the broker, copy the setup of one you already have, and give it a short code.', 'The code becomes part of the broker’s addresses: /ota/2024A/DDT/…', dlg);
    await click(page, dlg.getByRole('button', { name: 'Create' }));
    await sleep(1500);
    await channelTab(page, 'Desert Drive Travel', 'Overview');
    await say(page, 'The broker is created in Testing.', 'While testing, everything it books is a sandbox booking: it is recorded, but it never holds a car or reaches a branch.');
    await channelTab(page, 'Desert Drive Travel', 'Rates');
    await click(page, btn(page, 'Review & publish'));
    await say(page, 'Publish the prices this broker will quote to its customers.', 'Each publish is a new numbered version, so you always know which prices the broker has.', page.getByRole('dialog').last());
    await click(page, page.getByRole('dialog').last().getByRole('button', { name: /^Publish version/ }));
    await sleep(1200);
    await module(page, 'API keys');
    const row = page.getByRole('row').filter({ hasText: 'Desert Drive Travel' });
    await click(page, row.getByRole('button', { name: 'Create', exact: true }).first());
    await page.getByText(/urd_[A-Za-z0-9_-]{20,}/).first().waitFor();
    const key = /urd_[A-Za-z0-9_-]{20,}/.exec(await page.locator('body').innerText())[0];
    await say(page, 'Give the broker its key: the password its system sends with every message.', 'Shown once, with a ready message to send securely. Without a valid key, every message is refused.', page.getByRole('dialog').last());
    await click(page, page.getByRole('button', { name: 'I have copied it' }));
    await sleep(800);

    await explain(page, { title: 'The broker searches', text: 'A customer on the broker’s website looks for a car at Amman Airport for three days. The broker’s system sends our system a search; our system answers with every free car group, its price, the extras and the cancellation terms.',
      from: 'Broker’s system', fromNote: 'Desert Drive Travel', to: 'UR-Drive Jordan', toNote: 'Checks cars, prices, opening hours', out: 'OTA_VehAvailRateRQ', back: 'OTA_VehAvailRateRS · offers' });
    const search = await broker(key, '/ota/2024A/DDT/OTA_VehAvailRate', `<OTA_VehAvailRateRQ xmlns="${OTA}" Version="2.000" EchoToken="WEB-1"><POS><Source><RequestorID Type="22" ID="DDT"/></Source></POS><VehAvailRQCore>
      <VehRentalCore PickUpDateTime="${at(30)}" ReturnDateTime="${at(33)}"><PickUpLocation LocationCode="AMM"/><ReturnLocation LocationCode="AMM"/></VehRentalCore><DriverType Age="35"/></VehAvailRQCore></OTA_VehAvailRateRQ>`);
    const offer = (/Type="16" ID="(OFF-[^"]+)"/.exec(search) || [])[1];
    await channelTab(page, 'Desert Drive Travel', 'Traffic');
    await click(page, btn(page, 'Refresh'));
    await sleep(800);
    const log = page.getByText('Message log').first().locator('xpath=ancestor::section[1]');
    await say(page, 'The search arrives in Traffic, the moment the broker sends it.', 'Every message is kept with its answer and the time taken — this is where you look when a broker asks “what happened?”.', log.locator('tbody tr').first());
    await click(page, log.locator('tbody tr').first());
    await sleep(1200);
    await say(page, 'Open it to see exactly what the broker asked, and exactly what we answered.', 'Here: Amman Airport, three days, driver aged 35 — and our answer with each car, its price and an offer number.');
    await page.keyboard.press('Escape'); await sleep(600);
    const close = page.getByRole('button', { name: 'Close' }).first();
    if (await close.isVisible().catch(() => false)) await click(page, close);

    await explain(page, { title: 'The broker books', text: 'The customer chooses a Toyota Corolla and pays the broker. The broker’s system books the offer with the customer’s name and its own reference. Our system checks the car is still free, creates the reservation and answers with our reservation number.',
      from: 'Broker’s system', fromNote: 'Customer: John Doe', to: 'UR-Drive Jordan', toNote: 'Creates the reservation', out: 'OTA_VehResRQ · offer + customer', back: 'OTA_VehResRS · RSV-…' });
    const booked = await broker(key, '/ota/2024A/DDT/OTA_VehRes', `<OTA_VehResRQ xmlns="${OTA}" Version="2.000"><VehResRQCore><Customer><Primary BirthDate="1988-04-12"><PersonName><GivenName>John</GivenName><Surname>Doe</Surname></PersonName>
      <Email>john.doe@example.com</Email></Primary></Customer></VehResRQCore><VehResRQInfo><Reference Type="16" ID="${offer}"/><TPA_Extensions><BrokerReference>DDT-5001</BrokerReference></TPA_Extensions></VehResRQInfo></OTA_VehResRQ>`);
    const conf = (/ID="(RSV-[^"]+)"/.exec(booked) || [])[1];
    await module(page, 'XML reservations');
    await click(page, page.getByRole('button', { name: 'Sandbox (tests)' }).first());
    await sleep(1200);
    await say(page, `The booking is here in XML reservations: ${conf}, John Doe, broker reference DDT-5001.`, 'Broker bookings are kept apart from your own Reservations screen. This one is under “Sandbox (tests)” because the broker is still testing.', page.getByText('DDT-5001').first().locator('xpath=ancestor::tr[1]'));

    await explain(page, { title: 'The customer changes the dates', text: 'The customer adds a day on the broker’s website. The broker’s system sends the change; our system checks the car is still free for the new dates, prices the rental again and confirms.',
      from: 'Broker’s system', fromNote: 'One more day', to: 'UR-Drive Jordan', toNote: 'Re-prices and checks the car', out: 'OTA_VehModifyRQ', back: 'OTA_VehModifyRS · new price' });
    await broker(key, '/ota/2024A/DDT/OTA_VehModify', `<OTA_VehModifyRQ xmlns="${OTA}" Version="2.000"><VehModifyRQCore ModifyType="Modify"><UniqueID Type="14" ID="${conf}"/>
      <VehRentalCore PickUpDateTime="${at(30)}" ReturnDateTime="${at(34)}"/></VehModifyRQCore></OTA_VehModifyRQ>`);
    await click(page, btn(page, 'Refresh')); await sleep(1200);
    await say(page, 'The booking now shows four days and the new total.', 'If you change a broker booking yourself, the broker is told automatically in the same way.', page.getByText('DDT-5001').first().locator('xpath=ancestor::tr[1]'));

    await explain(page, { title: 'The customer cancels', text: 'The customer cancels on the broker’s website. The broker’s system sends the cancellation; our system applies your cancellation terms, frees the car at once and confirms.',
      from: 'Broker’s system', fromNote: 'Cancellation', to: 'UR-Drive Jordan', toNote: 'Frees the car, applies the terms', out: 'OTA_VehCancelRQ', back: 'OTA_VehCancelRS · cancelled' });
    await broker(key, '/ota/2024A/DDT/OTA_VehCancel', `<OTA_VehCancelRQ xmlns="${OTA}" Version="2.000"><VehCancelRQCore CancelType="Cancel"><UniqueID Type="14" ID="${conf}"/>
      <PersonName><Surname>Doe</Surname></PersonName></VehCancelRQCore></OTA_VehCancelRQ>`);
    await click(page, btn(page, 'Refresh')); await sleep(1200);
    await say(page, 'The booking is cancelled. It is never deleted, so the record stays for your accounts and for the broker.', null, page.getByText('DDT-5001').first().locator('xpath=ancestor::tr[1]'));

    await channelTab(page, 'Desert Drive Travel', 'Go-live');
    await say(page, 'When testing is done, approve go-live here.', 'The broker’s searches and bookings are then real: cars are held, the branch sees the booking, and everything you just saw happens for real customers.', btn(page, 'Approve go-live'));
    await explain(page, { kicker: 'In short', title: 'Search, book, change, cancel — all automatic', text: 'You set up the broker once: prices, rules and a key. From then on the broker’s system and ours do the work, and you see every message in Traffic and every booking in XML reservations. The next chapters show each page in detail.', ms: 10000 });
  } },
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
    await click(page, btn(page, 'Seasons'));
    await say(page, 'Seasons & events: Eid, Ramadan, Christmas or your own dates, each raising or lowering the price.');
    await click(page, btn(page, 'Last minute'));
    await say(page, 'Last minute: prices that change with how soon the rental starts.');
    await click(page, btn(page, 'Try a price'));
    await say(page, 'Try a price: shows the final price of any rental, step by step, before it reaches a broker.');
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
      CUES = []; T0 = Date.now();
      CH = i + 1; STEP = 0; ZOOM = 1; PX = W / 2; PY = H / 2;
      TOTAL = (ch.run.toString().match(/\b(say|explain)\(page/g) || []).length;
      CUES.push({ start: 0, end: 7, step: 0, total: 0, title: ch.title, text: ch.text });
      await card(page, `OTA XML video guide · Chapter ${i + 1} of ${CHAPTERS.length}`, ch.title, ch.text, ch.list, 7000);
      await chip(page, ch.title);
      try { await ch.run(page); } catch (e) { await page.screenshot({ path: path.join(OUT, `fail-${ch.id}.png`) }); throw e; }
      await clear(page);
      await chip(page, '');
      await zoomTo(page, null);
      const nxt = CHAPTERS[i + 1];
      await card(page, nxt ? 'Next chapter' : 'End of the guide', nxt ? nxt.title : 'You have seen every part of OTA XML', nxt ? nxt.text : 'Open any chapter again from OTA XML → Video guide.', null, 3500);
      const video = page.video();
      await ctx.close();
      const src = await video.path();
      const mp4 = path.join(OUT, `${ch.id}.mp4`);
      fs.writeFileSync(path.join(OUT, `${ch.id}.steps.json`), JSON.stringify(CUES.filter(c => c.end != null && c.end > c.start).map(c => ({ ...c, start: +c.start.toFixed(2), end: +c.end.toFixed(2) })), null, 1) + '\n');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', skip.toFixed(2), '-i', src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '32', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
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
