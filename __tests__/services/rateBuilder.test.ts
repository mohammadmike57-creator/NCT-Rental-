import { RatePlan } from '../../types';
import {
  DEFAULT_BANDS, adjustRatePlans, basePricesFrom, buildRatePlans, checkInput, jordanSeasons, priceInversions, rentalTotal, roundPrice,
  bandsOf, matrixOf, withMatrix, checkBands, bandLabel,
} from '../../services/rateBuilder';
import { validateChannel } from '../../services/channelManager';

const input = () => ({ seasons: jordanSeasons(2027), bands: DEFAULT_BANDS, basePrices: { ECAR: 30, SDAR: 40 }, rounding: 'cents' as const });

describe('rate builder', () => {
  it('Jordan seasons cover the whole year without gaps', () => {
    expect(checkInput(input())).toEqual([]);
    expect(jordanSeasons(2028)[0].endDate).toBe('2028-02-29');
  });

  it('builds one period per season with every group and band', () => {
    const plans = buildRatePlans(input(), 1);
    expect(plans).toHaveLength(5);
    const spring = plans.find(p => p.name === 'Spring high 2027')!;
    expect(spring.sippRates.map(r => r.sippCode)).toEqual(['ECAR', 'SDAR']);
    const ecar = spring.sippRates[0].tiers;
    expect(ecar.map(t => [t.fromDay, t.toDay])).toEqual([[1, 2], [3, 6], [7, 13], [14, 29], [30, null]]);
    // 30 × 1.15 = 34.50; 3–6 days 5% off = 32.78 (rounded to the cent)
    expect(ecar[0].dailyPrice).toBe(34.5);
    expect(ecar[1].dailyPrice).toBe(32.78);
    expect(rentalTotal(spring, 'ECAR', 5)).toEqual({ daily: 32.78, total: 163.9 });
  });

  it('the default bands never make a longer rental cheaper', () => {
    buildRatePlans(input(), 1).forEach(p => expect(priceInversions(p)).toEqual([]));
  });

  it('reports gaps, overlaps, broken bands and missing prices', () => {
    const bad = input();
    bad.seasons = [...bad.seasons.slice(0, 1), ...bad.seasons.slice(2)];
    bad.bands = [{ fromDay: 1, toDay: 3, discountPercent: 0 }, { fromDay: 5, toDay: 10, discountPercent: 5 }];
    bad.basePrices = { ECAR: 30, SDAR: NaN };
    const p = checkInput(bad);
    expect(p.some(m => m.startsWith('No season from 2027-03-01 to 2027-05-31'))).toBe(true);
    expect(p.some(m => m.includes('day 4 is in no band'))).toBe(true);
    expect(p.some(m => m.includes('last band must be open-ended'))).toBe(true);
    expect(p).toContain('SDAR: enter a base daily price.');
  });

  it('flags a band discount that makes the next band cheaper in total', () => {
    const plans = buildRatePlans({ ...input(), bands: [{ fromDay: 1, toDay: 6, discountPercent: 0 }, { fromDay: 7, toDay: null, discountPercent: 30 }] }, 1);
    expect(priceInversions(plans[0])[0]).toMatch(/ECAR: 7 days cost .* less than 6 days/);
  });

  it('rounds as asked', () => {
    expect(roundPrice(32.775, 'cents')).toBe(32.78);
    expect(roundPrice(32.78, 'half')).toBe(33);
    expect(roundPrice(32.2, 'half')).toBe(32);
    expect(roundPrice(32.5, 'whole')).toBe(33);
  });

  it('changes prices only for the chosen periods and groups', () => {
    const plans = buildRatePlans(input(), 1);
    const next = adjustRatePlans(plans, { percent: 10, amount: 0, planIds: [plans[0].id], sippCodes: ['SDAR'], rounding: 'cents' });
    expect(next[0].sippRates[1].tiers[0].dailyPrice).toBe(39.6);   // 40 × 0.9 = 36, +10%
    expect(next[0].sippRates[0]).toEqual(plans[0].sippRates[0]);
    expect(next[1]).toEqual(plans[1]);
  });

  it('reads base prices back from an existing rate card', () => {
    const plans: RatePlan[] = buildRatePlans(input(), 1);
    expect(basePricesFrom(plans)).toEqual({ ECAR: 27, SDAR: 36 });
  });

  it('the channel check warns about longer rentals costing less and groups missing in a season', () => {
    const plans = buildRatePlans({ ...input(), bands: [{ fromDay: 1, toDay: 6, discountPercent: 0 }, { fromDay: 7, toDay: null, discountPercent: 30 }] }, 1);
    plans[2].sippRates = plans[2].sippRates.filter(r => r.sippCode !== 'SDAR');
    const v = validateChannel({ id: 'a', name: 'AE', connectionDetails: { apiUrl: '', username: '', apiKey: '' }, currentRatePlans: plans,
      ratePlanHistory: [], extras: [], termsAndConditions: '' }, [], '2026-11-01');
    const msgs = v.issues.map(i => i.message);
    expect(msgs.some(m => /Low season 2027 \/ ECAR: 7 days cost/.test(m))).toBe(true);
    expect(msgs).toContain('Summer 2027: SDAR is not priced, so it cannot be booked from 2027-06-01 to 2027-08-31.');
  });

  it('shows a period as one grid of car groups by rental bands and saves it back', () => {
    const plan = buildRatePlans(input(), 1)[0];
    const bands = bandsOf(plan);
    expect(bands.map(bandLabel)).toEqual(['1–2 days', '3–6 days', '7–13 days', '14–29 days', '30+ days']);
    const m = matrixOf(plan, bands);
    expect(m.ECAR[0]).toBe(27);
    const next = withMatrix(plan, bands, ['ECAR', 'SDAR', 'FDAR'], { ...m, FDAR: [60, 55, null, null, 45] }, 5);
    expect(next.sippRates.map(r => r.sippCode)).toEqual(['ECAR', 'SDAR', 'FDAR']);
    expect(next.sippRates[0].id).toBe(plan.sippRates[0].id);
    expect(next.sippRates[2].tiers.map(t => [t.fromDay, t.toDay, t.dailyPrice])).toEqual([[1, 2, 60], [3, 6, 55], [30, null, 45]]);
    expect(rentalTotal(next, 'FDAR', 4)?.total).toBe(220);
    expect(matrixOf(next, bands)).toEqual({ ...m, FDAR: [60, 55, null, null, 45] });
  });

  it('lines up groups that were priced with different bands', () => {
    const plan: RatePlan = { id: 'p', name: 'P', startDate: '2027-01-01', endDate: '2027-01-31', sippRates: [
      { id: 'a', sippCode: 'ECAR', tiers: [{ id: '1', fromDay: 1, toDay: 6, dailyPrice: 30 }, { id: '2', fromDay: 7, toDay: null, dailyPrice: 25 }] },
      { id: 'b', sippCode: 'SDAR', tiers: [{ id: '3', fromDay: 1, toDay: 3, dailyPrice: 40 }, { id: '4', fromDay: 4, toDay: null, dailyPrice: 35 }] },
    ] };
    const bands = bandsOf(plan);
    expect(bands).toEqual([{ fromDay: 1, toDay: 3 }, { fromDay: 4, toDay: 6 }, { fromDay: 7, toDay: null }]);
    expect(matrixOf(plan, bands)).toEqual({ ECAR: [30, 30, 25], SDAR: [40, 35, 35] });
    expect(checkBands(bands)).toEqual([]);
  });

  it('flags band layouts that leave rental lengths unpriced', () => {
    expect(checkBands([{ fromDay: 2, toDay: 5 }, { fromDay: 6, toDay: null }])).toContain('The first band must start at day 1.');
    expect(checkBands([{ fromDay: 1, toDay: 3 }, { fromDay: 5, toDay: null }])).toContain('Day 4 is in no band.');
    expect(checkBands([{ fromDay: 1, toDay: 3 }, { fromDay: 4, toDay: 9 }])[0]).toMatch(/longer than 9 days/);
  });
});
