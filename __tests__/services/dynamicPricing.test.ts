import { DynamicPricingConfig, emptyPricingConfig, priceRental, rentalDayCount, SeasonRule, PriceRequest } from '../../services/dynamicPricing';

const rule = (p: Partial<SeasonRule>): SeasonRule => ({
  id: p.name || 'r', name: 'Rule', kind: 'custom', from: '2027-01-01', to: '2027-12-31', priority: 5, active: true,
  groups: [], locations: [], channels: [], adjust: { type: 'fixed', value: 0 }, blackout: [], ...p,
});
const cfg = (c: Partial<DynamicPricingConfig> = {}): DynamicPricingConfig => ({ ...emptyPricingConfig(), ...c });
const req = (p: Partial<PriceRequest>): PriceRequest => ({
  group: 'ECMR', location: 'AMM', channel: 'broker', pickup: '2027-03-01T10:00', dropOff: '2027-03-12T12:00',
  now: '2027-01-01T10:00', availableCars: 6, baseDaily: () => 30, ...p,
});
const eid = rule({ name: 'Eid Al-Fitr', kind: 'eid_fitr', from: '2027-03-10', to: '2027-03-12', priority: 1, adjust: { type: 'fixed', value: 45 } });
const high = rule({ name: 'High season', kind: 'high', from: '2027-03-05', to: '2027-03-20', priority: 2, adjust: { type: 'fixed', value: 40 } });

describe('Rate & price rules', () => {
  test('rental days follow the booking engine (24-hour blocks, optional grace)', () => {
    expect(rentalDayCount('2027-03-01T10:00', '2027-03-12T10:00')).toBe(11);
    expect(rentalDayCount('2027-03-01T10:00', '2027-03-12T12:00')).toBe(12);
    expect(rentalDayCount('2027-03-01T10:00', '2027-03-12T10:45', 60)).toBe(11);
  });

  test('Test 1 — Eid only on the Eid days: 9 × 30 + 3 × 45 = 405', () => {
    const r = priceRental(cfg({ seasonal: { enabled: true, stack: false, rules: [eid] } }), req({}));
    expect(r.days).toBe(12);
    expect(r.perDay.filter(d => d.rate === 30)).toHaveLength(9);
    expect(r.perDay.filter(d => d.rate === 45).map(d => d.date)).toEqual(['2027-03-10', '2027-03-11', '2027-03-12']);
    expect(r.total).toBe(405);
    expect(r.perDay[9].rule).toBe('Eid Al-Fitr');
  });

  test('Test 2 — Eid inside high season replaces it, never adds to it', () => {
    const r = priceRental(cfg({ seasonal: { enabled: true, stack: false, rules: [high, eid] } }),
      req({ pickup: '2027-03-05T10:00', dropOff: '2027-03-13T09:00' }));
    expect(r.days).toBe(8);
    expect(r.perDay.filter(d => d.rate === 40)).toHaveLength(5);
    expect(r.perDay.filter(d => d.rate === 45)).toHaveLength(3);
    expect(r.total).toBe(5 * 40 + 3 * 45);
  });

  test('percentage seasons: base × (1 + %) on the season days only — 9 × 30 + 3 × (30 × 1.5) = 405', () => {
    const high = rule({ name: 'High season +50%', kind: 'high', from: '2027-03-10', to: '2027-03-12', priority: 2, adjust: { type: 'percent', value: 50 } });
    const r = priceRental(cfg({ seasonal: { enabled: true, stack: false, rules: [high] } }), req({}));
    expect(r.perDay.filter(d => d.rate === 30)).toHaveLength(9);
    expect(r.perDay.filter(d => d.rate === 45)).toHaveLength(3);
    expect(r.total).toBe(405);
  });

  test('Eid +50% inside high season +40% uses +50% on the Eid days, never +90%', () => {
    const high40 = rule({ name: 'High season', kind: 'high', from: '2027-03-01', to: '2027-03-31', priority: 2, adjust: { type: 'percent', value: 40 } });
    const eid50 = rule({ name: 'Eid', kind: 'eid_fitr', from: '2027-03-10', to: '2027-03-12', priority: 1, adjust: { type: 'percent', value: 50 } });
    const r = priceRental(cfg({ seasonal: { enabled: true, stack: false, rules: [high40, eid50] } }), req({}));
    expect(r.perDay[0].rate).toBe(42);
    expect(r.perDay[9].rate).toBe(45);
    expect(r.total).toBe(9 * 42 + 3 * 45);
  });

  test('Eid +50% then availability +20%: 30 × 1.5 × 1.2 = 54, never 30 + 50% + 20% + 50%', () => {
    const c = cfg({
      seasonal: { enabled: true, stack: false, rules: [rule({ name: 'Eid', kind: 'eid_fitr', from: '2027-03-10', to: '2027-03-12', priority: 1, adjust: { type: 'percent', value: 50 } })] },
      availability: { enabled: true, channels: [], tiers: [{ id: 'a', minCars: 2, maxCars: 3, adjust: { type: 'percent', value: 20 }, when: 'all', locations: [] }] },
    });
    expect(priceRental(c, req({ pickup: '2027-03-10T10:00', dropOff: '2027-03-11T10:00', availableCars: 2 })).total).toBe(54);
  });

  test('rules can be limited to direct website, app and walk-in channels', () => {
    const web = rule({ name: 'Web only', from: '2027-03-10', to: '2027-03-10', priority: 1, channels: ['website'], adjust: { type: 'percent', value: -10 } });
    const day = req({ pickup: '2027-03-10T10:00', dropOff: '2027-03-11T10:00' });
    expect(priceRental(cfg({ seasonal: { enabled: true, stack: false, rules: [web] } }), { ...day, channel: 'website' }).total).toBe(27);
    expect(priceRental(cfg({ seasonal: { enabled: true, stack: false, rules: [web] } }), { ...day, channel: 'broker' }).total).toBe(30);
  });

  test('stacking applies every matching rule, in priority order, only when switched on', () => {
    const plus = rule({ name: 'Festival +10%', from: '2027-03-10', to: '2027-03-10', priority: 3, adjust: { type: 'percent', value: 10 } });
    const day = req({ pickup: '2027-03-10T10:00', dropOff: '2027-03-11T10:00' });
    expect(priceRental(cfg({ seasonal: { enabled: true, stack: false, rules: [eid, plus] } }), day).total).toBe(45);
    const s = priceRental(cfg({ seasonal: { enabled: true, stack: true, rules: [eid, plus] } }), day);
    expect(s.total).toBe(49.5);
    expect(s.perDay[0].steps.map(x => x.label)).toEqual(['Eid Al-Fitr (45 a day)', 'Festival +10% (+10%)']);
  });

  const lastMinute = (): DynamicPricingConfig['leadTime'] => ({ enabled: true, channels: [], tiers: [
    { id: 't1', fromHours: 0, toHours: 24, adjust: { type: 'none', value: 0 }, byAvailability: [
      { minCars: 10, maxCars: null, adjust: { type: 'percent', value: -10 } },
      { minCars: 4, maxCars: 9, adjust: { type: 'none', value: 0 } },
      { minCars: 2, maxCars: 3, adjust: { type: 'percent', value: 20 } },
      { minCars: 1, maxCars: 1, adjust: { type: 'percent', value: 40 } },
    ] },
  ] });

  test('Test 3 — last-minute discount: tomorrow, 12 cars, -10% → 27', () => {
    const r = priceRental(cfg({ leadTime: lastMinute() }),
      req({ now: '2027-03-01T08:00', pickup: '2027-03-01T20:00', dropOff: '2027-03-02T20:00', availableCars: 12 }));
    expect(r.perDay[0].rate).toBe(27);
  });

  test('Test 4 — last-minute premium on the Eid rate: 45 + 20% = 54, capped by a maximum', () => {
    const c = cfg({ seasonal: { enabled: true, stack: false, rules: [eid] }, leadTime: lastMinute() });
    const r = req({ now: '2027-03-10T08:00', pickup: '2027-03-10T20:00', dropOff: '2027-03-11T20:00', availableCars: 2 });
    expect(priceRental(c, r).perDay[0].rate).toBe(54);
    expect(priceRental({ ...c, limits: { maxDaily: 50, groups: {} } }, r).perDay[0].rate).toBe(50);
  });

  test('Test 5 — no double counting: Eid 45 (inside high season 40) + 20% availability = 54', () => {
    const c = cfg({
      seasonal: { enabled: true, stack: false, rules: [high, eid] },
      availability: { enabled: true, channels: [], tiers: [
        { id: 'a1', minCars: 10, maxCars: null, adjust: { type: 'percent', value: -10 }, when: 'all', locations: [] },
        { id: 'a2', minCars: 2, maxCars: 3, adjust: { type: 'percent', value: 20 }, when: 'all', locations: [] },
      ] },
    });
    const r = priceRental(c, req({ pickup: '2027-03-11T10:00', dropOff: '2027-03-12T10:00', availableCars: 3 }));
    expect(r.perDay[0].rate).toBe(54);
    expect(r.perDay[0].steps.map(s => s.stage)).toEqual(['season', 'availability']);
  });

  test('the availability rule is not applied again when the last-minute rule priced availability', () => {
    const c = cfg({ leadTime: lastMinute(), availability: { enabled: true, channels: [], tiers: [
      { id: 'a2', minCars: 2, maxCars: 3, adjust: { type: 'percent', value: 20 }, when: 'all', locations: [] }] } });
    const r = priceRental(c, req({ now: '2027-03-01T08:00', pickup: '2027-03-01T20:00', dropOff: '2027-03-02T20:00', availableCars: 2 }));
    expect(r.perDay[0].rate).toBe(36);   // 30 + 20% once, not 30 × 1.2 × 1.2
    expect(r.notes.join(' ')).toMatch(/not applied again/);
  });

  test('Test 6 — a broker on net rates keeps the agreed net rate', () => {
    const c = cfg({ seasonal: { enabled: true, stack: false, rules: [eid] }, leadTime: lastMinute() });
    const r = priceRental(c, req({ mode: 'net', baseDaily: () => 25, pickup: '2027-03-10T10:00', dropOff: '2027-03-11T10:00' }));
    expect(r.total).toBe(25);
    const restricted = priceRental(c, req({ mode: 'restricted', now: '2027-03-10T08:00', pickup: '2027-03-10T10:00', dropOff: '2027-03-11T10:00', availableCars: 2 }));
    expect(restricted.total).toBe(45);   // seasonal only, no last-minute premium
  });

  test('rules respect groups, locations, channels, blackout dates, min/max days and pausing', () => {
    const r = (p: Partial<SeasonRule>) => cfg({ seasonal: { enabled: true, stack: false, rules: [{ ...eid, ...p }] } });
    const one = req({ pickup: '2027-03-10T10:00', dropOff: '2027-03-11T10:00' });
    expect(priceRental(r({ groups: ['SDAR'] }), one).total).toBe(30);
    expect(priceRental(r({ locations: ['AQJ'] }), one).total).toBe(30);
    expect(priceRental(r({ channels: ['ota'] }), one).total).toBe(30);
    expect(priceRental(r({ blackout: ['2027-03-10'] }), one).total).toBe(30);
    expect(priceRental(r({ minDays: 3 }), one).total).toBe(30);
    expect(priceRental(r({ active: false }), one).total).toBe(30);
    expect(priceRental(r({}), one).total).toBe(45);
  });

  test('no car free → not bookable; minimum daily price is kept', () => {
    expect(priceRental(cfg(), req({ availableCars: 0 })).bookable).toBe(false);
    const c = cfg({ seasonal: { enabled: true, stack: false, rules: [rule({ name: 'Low', adjust: { type: 'fixed', value: 15 } })] }, limits: { minDaily: 20, groups: {} } });
    expect(priceRental(c, req({ pickup: '2027-04-01T10:00', dropOff: '2027-04-02T10:00' })).total).toBe(20);
  });
});
