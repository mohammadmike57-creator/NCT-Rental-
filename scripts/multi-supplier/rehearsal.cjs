// Go-live rehearsal on PostgreSQL (see docs/multi-supplier.md §10).
// Usage: node rehearsal.cjs <phase> with the server from run.sh on port 8393, in this order:
//   before (old version) → after (new version, MULTI_SUPPLIER=true) → restart → rollback (old version) → off → on-again
const crypto = require('crypto'), fs = require('fs');
const API = 'http://localhost:8393', PW = 'rehearsal-pass-12345', OUT = __dirname;
const phase = process.argv[2];
const Y = new Date().getFullYear() + 1;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = async (method, path, tok, body, xml) => {
  const r = await fetch(API + path, { method, headers: xml ? { 'Content-Type': 'application/xml', ...xml } : { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body ? (xml ? body : JSON.stringify(body)) : undefined });
  const t = await r.text(); let b = t; try { b = JSON.parse(t); } catch { /* not JSON */ } return { s: r.status, b, t };
};
const login = async e => { const r = await j('POST', '/auth/login', null, { email: e, password: PW }); if (!r.b.token) throw new Error('login ' + e + ': ' + r.t); return r.b.token; };
const chan = (id, name, code, key, sipp, price) => [{ id, name, channelCode: code, vendorCode: code.slice(0, 3), locationCode: 'AMM', currency: 'USD', status: 'active',
  feedKeyHash: crypto.createHash('sha256').update(key).digest('hex'), connectionDetails: { environment: 'production' },
  bookingRules: { rateLimitPerMinute: 500, freeCancellationHours: 48, locations: [{ code: 'AMM', name: 'Airport' }] }, extras: [], currentRatePlans: [],
  ratePlanHistory: [{ id: 'p', submittedAt: '2026-01-01T00:00:00Z', version: 1, ratePlans: [{ id: 'r', name: 'All year', startDate: `${Y}-01-01`, endDate: `${Y}-12-31`, sippRates: [{ id: 's', sippCode: sipp, tiers: [{ id: 't', fromDay: 1, toDay: null, dailyPrice: price }] }] }] }] }];
const car = (id, m, sipp) => ({ id, modelName: m, licensePlate: id.toUpperCase(), category: 'Standard', sippCode: sipp, transmission: 'Automatic', securityDeposit: 200, excess: 500, registrationExpiry: '2030-01-01' });
const avail = `<OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="R"><VehAvailRQCore><VehRentalCore PickUpDateTime="${Y}-05-01T10:00:00" ReturnDateTime="${Y}-05-04T10:00:00"><PickUpLocation LocationCode="AMM"/><ReturnLocation LocationCode="AMM"/></VehRentalCore><DriverType Age="35"/></VehAvailRQCore></OTA_VehAvailRateRQ>`;
const res = (offer, ref) => `<OTA_VehResRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="B"><VehResRQCore><Customer><Primary BirthDate="1990-05-01"><PersonName><GivenName>John</GivenName><Surname>Doe</Surname></PersonName><Telephone PhoneNumber="+962790000000"/><Email>john@example.com</Email><Address><CountryName Code="JO"/></Address><Document DocID="JO123456" DocType="4" DocIssueCountry="JO"/></Primary></Customer></VehResRQCore><VehResRQInfo><Reference Type="16" ID="${offer}"/><TPA_Extensions><BrokerReference>${ref}</BrokerReference></TPA_Extensions></VehResRQInfo></OTA_VehResRQ>`;
const search = async (code, key) => { const r = await j('POST', `/ota/v1/${code}/OTA_VehAvailRate`, null, avail, { 'X-Api-Key': key }); return { status: r.s, cars: [...r.t.matchAll(/<VehMakeModel Name="([^"]+)"/g)].map(m => m[1]), offer: (r.t.match(/Type="16" ID="(OFF-[^"]+)"/) || [])[1] }; };
const book = async (code, key, ref) => { const s = await search(code, key); const r = await j('POST', `/ota/v1/${code}/OTA_VehRes`, null, res(s.offer, ref), { 'X-Api-Key': key }); return (r.t.match(/RSV-\d{4}-\d{6}/) || [])[0]; };
const results = []; const check = (name, ok, detail = '') => { results.push({ phase, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`); };
const stateOf = async tok => (await j('GET', '/api/state', tok)).b;
(async () => {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch { /* not up yet */ } await sleep(1000); }
  const adm = await login('e2e-admin@example.test');
  if (phase === 'before') {
    // UR-Drive Jordan as in production today: fleet, broker, a broker booking, staff.
    await j('POST', '/api/state/patch', adm, { ops: [{ op: 'set', key: 'fleet', value: [car('u1', 'Toyota Corolla', 'SDAR'), car('u2', 'Kia Sportage', 'IFAR')] },
      { op: 'set', key: 'aggregators', value: chan('agg-urd', 'Sample Broker', 'BKG', 'urd-live-key-123', 'SDAR', 40) }] });
    const rsv = await book('BKG', 'urd-live-key-123', 'URD-REF-1');
    check('old version: UR-Drive broker booking', rsv, rsv);
    const r = await j('POST', '/api/admin/users', adm, { email: 'clerk@urd.example', fullName: 'Clara Clerk', password: PW, permissions: ['VIEW_RESERVATIONS', 'ACTION_RESERVATIONS_ADD'] });
    check('old version: staff account created', r.s === 201, String(r.s));
    const st = await stateOf(adm);
    fs.writeFileSync(OUT + '/urd-before.json', JSON.stringify(st));
    fs.writeFileSync(OUT + '/rsv.txt', rsv || '');
    check('old version: reservation saved in UR-Drive data', JSON.stringify(st).includes('URD-REF-1'));
  }
  if (phase === 'after') {
    const before = JSON.parse(fs.readFileSync(OUT + '/urd-before.json', 'utf8'));
    const now = await stateOf(adm);
    check('update: UR-Drive data identical after the update', JSON.stringify(now) === JSON.stringify(before));
    const clerk = await login('clerk@urd.example');
    check('update: existing staff sign in with the same password', !!clerk);
    const me = (await j('GET', '/api/account/me', clerk)).b;
    check('update: staff permissions unchanged', JSON.stringify(me.permissions) === JSON.stringify(['VIEW_RESERVATIONS', 'ACTION_RESERVATIONS_ADD']), JSON.stringify(me.permissions));
    const s = await search('BKG', 'urd-live-key-123');
    check("update: UR-Drive's broker still answered", s.status === 200 && s.cars.length > 0, s.cars.join(', '));
    const rsv = fs.readFileSync(OUT + '/rsv.txt', 'utf8');
    const bk = await j('GET', '/api/channels/agg-urd/bookings', adm);
    check('update: earlier broker booking still listed', bk.s === 200 && bk.t.includes(rsv), rsv);
    // Two suppliers and their brokers.
    for (const [code, name, owner, plan] of [['DDR', 'Desert Drive Rentals', 'owner@ddr.example', 'FULL'], ['PCH', 'Petra Car Hire', 'owner@pch.example', 'XML']]) {
      const c = await j('POST', '/api/platform/suppliers', adm, { code, name, plan, ownerName: name + ' Owner', ownerEmail: owner, ownerAccess: 'password', ownerPassword: PW });
      check(`create supplier ${code} (${plan})`, c.s === 201, String(c.s));
    }
    const ddr = await login('owner@ddr.example'), pch = await login('owner@pch.example');
    await j('POST', '/api/state/patch', ddr, { ops: [{ op: 'set', key: 'fleet', value: [car('d1', 'BMW X5', 'FFAR')] }, { op: 'set', key: 'aggregators', value: chan('agg-ddr', 'Desert Travel', 'DDT', 'ddr-key-123456', 'FFAR', 99) }] });
    await j('POST', '/api/state/patch', pch, { ops: [{ op: 'set', key: 'fleet', value: [car('p1', 'Nissan Sunny', 'CDAR')] }, { op: 'set', key: 'aggregators', value: chan('agg-pch', 'Petra Trips', 'PTT', 'pch-key-123456', 'CDAR', 33) }] });
    const a = await search('DDT', 'ddr-key-123456'), b = await search('PTT', 'pch-key-123456'), u = await search('BKG', 'urd-live-key-123');
    check('broker of Desert Drive gets only its cars', a.cars.join() === 'BMW X5 or similar', a.cars.join());
    check('broker of Petra gets only its cars', b.cars.join() === 'Nissan Sunny or similar', b.cars.join());
    check('broker of UR-Drive gets only its cars', u.cars.every(c => /Toyota|Kia/.test(c)) && u.cars.length > 0, u.cars.join());
    check("a supplier's key is refused on another's channel", (await search('PTT', 'ddr-key-123456')).status === 401 && (await search('BKG', 'pch-key-123456')).status === 401);
    const r1 = await book('DDT', 'ddr-key-123456', 'DDR-REF-1'), r2 = await book('PTT', 'pch-key-123456', 'PCH-REF-1');
    check('broker bookings for both suppliers', r1 && r2, `${r1} · ${r2}`);
    const sd = JSON.stringify(await stateOf(ddr)), sp = JSON.stringify(await stateOf(pch)), su = JSON.stringify(await stateOf(adm));
    check('each booking only in its own supplier', sd.includes('DDR-REF-1') && !sd.includes('PCH-REF-1') && !sd.includes('URD-REF-1')
      && sp.includes('PCH-REF-1') && !sp.includes('DDR-REF-1') && !su.includes('DDR-REF-1') && !su.includes('PCH-REF-1'));
    check("UR-Drive's earlier data still there", su.includes('URD-REF-1') && su.includes('Toyota Corolla'));
    check('Desert Drive cannot open UR-Drive channel', (await j('GET', '/api/channels/agg-urd/bookings', ddr)).s === 404);
    check('Petra (XML only) cannot save reservations data', JSON.stringify((await j('POST', '/api/state/patch', pch, { ops: [{ op: 'set', key: 'expenses', value: [{ id: 'x', amount: 1 }] }] })).b).includes('expenses'));
    const ov = (await j('GET', '/api/platform/overview', adm)).b;
    check('platform overview counts 3 suppliers and live broker calls', ov.suppliers === 3 && ov.brokerCalls7d >= 6, `${ov.suppliers} suppliers, ${ov.brokerCalls7d} calls`);
    fs.writeFileSync(OUT + '/urd-after.json', su);
  }
  if (phase === 'restart') {
    const ddr = await login('owner@ddr.example');
    check('after a restart: supplier data kept', JSON.stringify(await stateOf(ddr)).includes('DDR-REF-1'));
    check('after a restart: brokers routed', (await search('PTT', 'pch-key-123456')).cars.join() === 'Nissan Sunny or similar');
  }
  if (phase === 'rollback') {
    const now = JSON.stringify(await stateOf(adm));
    check('rollback to the old version: UR-Drive data readable', now.includes('URD-REF-1') && now.includes('Toyota Corolla'));
    check('rollback: UR-Drive broker answered', (await search('BKG', 'urd-live-key-123')).cars.length > 0);
    check('rollback: UR-Drive staff sign in', !!(await login('clerk@urd.example')));
    check('rollback: other suppliers stay switched off', (await search('DDT', 'ddr-key-123456')).status === 401);
  }
  if (phase === 'off') {
    check('switch off: UR-Drive works', (await search('BKG', 'urd-live-key-123')).cars.length > 0 && JSON.stringify(await stateOf(adm)).includes('URD-REF-1'));
    check('switch off: other suppliers cannot sign in', (await j('POST', '/auth/login', null, { email: 'owner@ddr.example', password: PW })).s === 403);
    check('switch off: their brokers are not answered', (await search('DDT', 'ddr-key-123456')).status === 401);
    check('switch off: admin portal not available', (await j('GET', '/api/platform/me', adm)).s === 404);
  }
  if (phase === 'on-again') {
    const ddr = await login('owner@ddr.example');
    check('switch on again: nothing was lost', JSON.stringify(await stateOf(ddr)).includes('DDR-REF-1') && (await search('DDT', 'ddr-key-123456')).cars.length > 0);
  }
  const file = OUT + '/results.json';
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  fs.writeFileSync(file, JSON.stringify(all.filter(r => r.phase !== phase).concat(results), null, 1));
  process.exit(results.every(r => r.ok) ? 0 : 1);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
